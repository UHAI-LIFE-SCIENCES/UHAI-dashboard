"""
Login for the dashboard.

  Public       the website (/, /about, /why-uhai, /faqs, /contact), static
               files, /login, /api/contact and /api/ping.
  Login        /dashboard and every other /api/ route. A data route called
               without a login answers 401 (JSON); a page redirects to /login.
  Admins only  /admin/users: add users, reset passwords, make users inactive.

There is no public sign-up. The first admin is created in the terminal:

    flask --app app/app.py create-admin

Passwords are stored only as werkzeug.security hashes. Sessions are signed
cookies (HttpOnly, SameSite=Lax, Secure when live) that end after 8 hours
without activity. Forms carry a CSRF token. After 5 failed logins for the same
email, that email is locked for 15 minutes.
"""

import hmac
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import click
from flask import (Blueprint, abort, flash, g, jsonify, redirect,
                   render_template, request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

import app_db
import site_content
from app_db import ID


bp = Blueprint("auth", __name__)

ROLES = ("admin", "staff")
IDLE_TIMEOUT = timedelta(hours=8)
MAX_FAILURES = 5
LOCK_TIME = timedelta(minutes=15)
MIN_PASSWORD_LENGTH = 10
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Everything under these needs a login; /api routes listed here stay public.
PROTECTED_PREFIXES = ("/dashboard", "/admin", "/api/")
PUBLIC_API = {"/api/contact", "/api/ping"}

# Running on Render (or marked as production): stricter settings apply.
LIVE = bool(os.environ.get("RENDER")) or os.environ.get("UHAI_ENV") == "production"

# Compared against when an email is unknown, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))

# Temporary admin access ("bypass") until the first admin account exists. It
# only works on the computer running the app (never live, never from another
# device) and switches itself off once an active admin is registered. Set
# UHAI_ADMIN_BYPASS=0 to turn it off sooner.
LOCAL_ADDRESSES = {"127.0.0.1", "::1"}
BYPASS_USER = {"id": 0, "name": "Admin (temporary access)", "email": "", "role": "admin", "active": 1, "bypass": True}


# ==================================================
# DATABASE
# ==================================================

def _migrate_v1(c):
    c.execute(f"""CREATE TABLE IF NOT EXISTS users (
        id {ID},
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_login TEXT,
        session_version INTEGER NOT NULL DEFAULT 1
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS login_attempts (
        email TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL
    )""")


MIGRATIONS = [("auth_v1", _migrate_v1)]


def _now():
    return datetime.now(timezone.utc)


def _iso(moment):
    return moment.isoformat(timespec="seconds")


def _normal_email(value):
    return (value or "").strip().lower()


# ==================================================
# SET-UP
# ==================================================

def init_app(app):
    secret = os.environ.get("SECRET_KEY", "").strip()

    if not secret:
        if LIVE:
            raise RuntimeError("SECRET_KEY is not set. Add it in the Render dashboard (Environment) before starting the app.")
        # Local only: a random key, so logins end when the app restarts.
        secret = secrets.token_hex(32)
        app.logger.warning("SECRET_KEY is not set; using a temporary key (logins end when the app restarts).")

    app.config.update(
        SECRET_KEY=secret,
        SESSION_COOKIE_NAME="uhai_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=LIVE,
        PERMANENT_SESSION_LIFETIME=IDLE_TIMEOUT,
    )

    app_db.migrate(MIGRATIONS)
    app.register_blueprint(bp)
    app.before_request(_require_login)
    app.context_processor(lambda: {"current_user": current_user(), "csrf_token": csrf_token})
    app.add_template_filter(kenya_time)
    app.cli.add_command(create_admin)


# Kenya has no daylight saving: East Africa Time is always UTC+3.
EAT = timezone(timedelta(hours=3))


def kenya_time(iso, date_only=False):
    """'2026-10-21T11:05:00+00:00' -> '21 Oct 2026, 14:05' (East Africa Time)."""
    if not iso:
        return ""
    moment = datetime.fromisoformat(iso).astimezone(EAT)
    return moment.strftime("%d %b %Y").lstrip("0") if date_only else moment.strftime("%d %b %Y, %H:%M").lstrip("0")


# ==================================================
# WHO IS LOGGED IN
# ==================================================

def current_user():
    """
    The logged-in, active user for this request, or None. The account is read
    again on every request, so making someone inactive or resetting their
    password ends their session straight away.
    """
    if "user" in g:
        return g.user

    g.user = None
    now = time.time()

    if session.get("bypass"):
        if now - session.get("seen", 0) > IDLE_TIMEOUT.total_seconds() or not bypass_available():
            session.clear()
            return None
        if now - session.get("seen", 0) > 60:
            session["seen"] = now
        g.user = BYPASS_USER
        return g.user

    user_id = session.get("uid")

    if not user_id:
        return None

    if now - session.get("seen", 0) > IDLE_TIMEOUT.total_seconds():
        session.clear()
        return None

    rows = app_db.query(
        "SELECT id, name, email, role, active, session_version FROM users WHERE id = ?", (user_id,)
    )

    if not rows or not rows[0]["active"] or rows[0]["session_version"] != session.get("ver"):
        session.clear()
        return None

    # Refresh the inactivity clock (at most once a minute, to keep cookies stable).
    if now - session.get("seen", 0) > 60:
        session["seen"] = now

    g.user = rows[0]
    return g.user


def _require_login():
    path = request.path

    if not path.startswith(PROTECTED_PREFIXES) or path in PUBLIC_API:
        return None

    user = current_user()

    if user is None:
        if path.startswith("/api/"):
            return jsonify({"error": "Please log in.", "login": url_for("auth.login")}), 401
        return redirect(url_for("auth.login", next=request.full_path.rstrip("?")))

    if path.startswith("/admin") and user["role"] != "admin":
        abort(403)

    return None


def bypass_available():
    """
    Temporary admin access is offered only on this computer, never live, and
    only while no active admin account exists.
    """
    if LIVE or os.environ.get("UHAI_ADMIN_BYPASS", "1") == "0":
        return False

    if request.remote_addr not in LOCAL_ADDRESSES:
        return False

    return not app_db.query("SELECT 1 FROM users WHERE role = 'admin' AND active = 1")


def _safe_next(target):
    """Only follow redirects to pages on this site."""
    target = (target or "").strip()
    parts = urlsplit(target)

    if (not target.startswith("/") or target.startswith("//") or "\\" in target
            or parts.scheme or parts.netloc or parts.path in ("/login", "/logout")):
        return url_for("dashboard_page")

    return target


# ==================================================
# CSRF
# ==================================================

def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def _csrf_ok():
    sent = request.form.get("csrf_token", "")
    return bool(sent) and hmac.compare_digest(sent, session.get("csrf", ""))


# ==================================================
# FAILED LOGINS
# ==================================================

def _minutes_locked(email):
    rows = app_db.query("SELECT locked_until FROM login_attempts WHERE email = ?", (email,))

    if rows and rows[0]["locked_until"]:
        left = datetime.fromisoformat(rows[0]["locked_until"]) - _now()

        if left.total_seconds() > 0:
            return max(1, int(left.total_seconds() // 60) + 1)

    return 0


def _record_failure(email):
    now = _now()

    with app_db.transaction() as c:
        row = c.execute("SELECT failures, updated_at FROM login_attempts WHERE email = ?", (email,)).fetchone()
        # Failures older than the lock window no longer count.
        recent = row and now - datetime.fromisoformat(row[1]) < LOCK_TIME
        failures = (row[0] if recent else 0) + 1
        locked_until = _iso(now + LOCK_TIME) if failures >= MAX_FAILURES else None

        c.execute(
            """
            INSERT INTO login_attempts (email, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET failures = excluded.failures,
                locked_until = excluded.locked_until, updated_at = excluded.updated_at
            """,
            (email, 0 if locked_until else failures, locked_until, _iso(now)),
        )


def _clear_failures(email):
    with app_db.transaction() as c:
        c.execute("DELETE FROM login_attempts WHERE email = ?", (email,))


# ==================================================
# LOGIN AND LOGOUT
# ==================================================

def _site_page(template, **extra):
    """Render a page inside the public website's layout."""
    return render_template(template, c=site_content, contact_details=site_content.contact_details(), **extra)


@bp.route("/login", methods=["GET", "POST"])
def login():
    target = _safe_next(request.values.get("next"))

    if current_user():
        return redirect(target)

    error = None
    email = ""

    if request.method == "POST":
        email = _normal_email(request.form.get("email"))
        password = request.form.get("password") or ""

        if not _csrf_ok():
            error = "This page was open for too long. Please try again."
        elif not email or not password:
            error = "Please enter your email and password."
        elif (wait := _minutes_locked(email)):
            error = f"Too many failed attempts. Please wait {wait} minute{'s' if wait != 1 else ''} and try again."
        else:
            rows = app_db.query("SELECT id, password_hash, active, session_version FROM users WHERE email = ?", (email,))
            user = rows[0] if rows else None
            correct = check_password_hash(user["password_hash"] if user else _DUMMY_HASH, password)

            if user and correct and user["active"]:
                _clear_failures(email)
                session.clear()
                session.permanent = True
                session.update(uid=user["id"], ver=user["session_version"], seen=time.time())

                with app_db.transaction() as c:
                    c.execute("UPDATE users SET last_login = ? WHERE id = ?", (_iso(_now()), user["id"]))

                return redirect(target)

            _record_failure(email)
            # Same message whether the email, the password or the account status was the problem.
            error = "Email or password is not correct."

    return _site_page("auth/login.html", page="login", page_title="Log in", error=error, email=email,
                      next_url=target, bypass=bypass_available())


@bp.route("/login/bypass", methods=["POST"])
def login_bypass():
    """Temporary admin access, until the first admin account is registered."""
    target = _safe_next(request.form.get("next"))

    if not _csrf_ok() or not bypass_available():
        return redirect(url_for("auth.login", next=target))

    session.clear()
    session.permanent = True
    session.update(bypass=True, seen=time.time())
    return redirect(target)


@bp.route("/logout", methods=["POST"])
def logout():
    if _csrf_ok():
        session.clear()
    return redirect(url_for("site_home"))


# ==================================================
# ADMIN: USERS
# ==================================================

def _check_password(password):
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    return None


def _done(message, ok=True):
    flash(message, "ok" if ok else "error")
    return redirect(url_for("auth.users"))


@bp.route("/admin/users")
def users():
    rows = app_db.query(
        "SELECT id, name, email, role, active, created_at, last_login FROM users ORDER BY active DESC, lower(name)"
    )
    return render_template("auth/users.html", users=rows, roles=ROLES, min_password=MIN_PASSWORD_LENGTH)


@bp.route("/admin/users", methods=["POST"])
def add_user():
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    name = (request.form.get("name") or "").strip()
    email = _normal_email(request.form.get("email"))
    role = request.form.get("role")
    password = request.form.get("password") or ""

    problem = (
        "Please enter a name." if not name or len(name) > 120 else
        "Please enter a valid email address." if not EMAIL_RE.match(email) or len(email) > 200 else
        "Please choose a role." if role not in ROLES else
        _check_password(password)
    )

    if not problem and app_db.query("SELECT 1 FROM users WHERE email = ?", (email,)):
        problem = "A user with this email already exists."

    if problem:
        return _done(f"User not added: {problem}", ok=False)

    with app_db.transaction() as c:
        c.execute(
            "INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
            (name, email, generate_password_hash(password), role, _iso(_now())),
        )

    # The first real admin ends the temporary access: log in with the new account.
    if current_user().get("bypass") and role == "admin":
        session.clear()
        flash(f"Admin account created for {name}. Temporary access is now off: log in with {email}.", "ok")
        return redirect(url_for("auth.login"))

    return _done(f"{name} can now log in with {email}. Give them their password in person or by phone.")


def _user_or_404(user_id):
    rows = app_db.query("SELECT id, name, email, active FROM users WHERE id = ?", (user_id,))

    if not rows:
        abort(404)

    return rows[0]


@bp.route("/admin/users/<int:user_id>/password", methods=["POST"])
def reset_password(user_id):
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    user = _user_or_404(user_id)
    password = request.form.get("password") or ""
    problem = _check_password(password)

    if problem:
        return _done(f"Password not changed: {problem}", ok=False)

    # A new session version logs the person out everywhere.
    with app_db.transaction() as c:
        c.execute(
            "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
            (generate_password_hash(password), user_id),
        )
        c.execute("DELETE FROM login_attempts WHERE email = ?", (user["email"],))

    if user_id == current_user()["id"]:
        session["ver"] = session.get("ver", 1) + 1

    return _done(f"Password changed for {user['name']}.")


@bp.route("/admin/users/<int:user_id>/active", methods=["POST"])
def set_active(user_id):
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    user = _user_or_404(user_id)
    active = request.form.get("active") == "1"

    if not active and user_id == current_user()["id"]:
        return _done("You cannot make your own account inactive.", ok=False)

    with app_db.transaction() as c:
        c.execute(
            "UPDATE users SET active = ?, session_version = session_version + 1 WHERE id = ?",
            (1 if active else 0, user_id),
        )

    return _done(f"{user['name']} is now {'active and can log in' if active else 'inactive and cannot log in'}.")


# ==================================================
# FIRST ADMIN (terminal)
# ==================================================

@click.command("create-admin")
@click.option("--name", prompt="Name", default="Gerald", show_default=True)
@click.option("--email", prompt="Email")
@click.password_option("--password", prompt="Password", confirmation_prompt="Repeat password")
def create_admin(name, email, password):
    """Create an admin account (or make an existing account an admin)."""
    email = _normal_email(email)

    if not EMAIL_RE.match(email):
        raise click.ClickException("That email address does not look right.")

    problem = _check_password(password)

    if problem:
        raise click.ClickException(problem)

    existing = app_db.query("SELECT id FROM users WHERE email = ?", (email,))

    if existing and not click.confirm(f"{email} already has an account. Make it an admin and set this password?"):
        raise click.Abort()

    with app_db.transaction() as c:
        if existing:
            c.execute(
                """UPDATE users SET name = ?, password_hash = ?, role = 'admin', active = 1,
                       session_version = session_version + 1 WHERE id = ?""",
                (name.strip(), generate_password_hash(password), existing[0]["id"]),
            )
        else:
            c.execute(
                "INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)",
                (name.strip(), email, generate_password_hash(password), _iso(_now())),
            )

    click.echo(f"Admin ready: {name.strip()} <{email}> ({app_db.describe()}).")
