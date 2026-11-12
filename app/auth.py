"""
Login for the dashboard.

  Public       the website (/, /about, /why-uhai, /faqs, /contact), static
               files, /login, /api/contact and /api/ping.
  Login        /dashboard and every other /api/ route. A data route called
               without a login answers 401 (JSON); a page redirects to /login.
  Admins only  /admin/users: add users, reset passwords, make users inactive,
               set a staff member's institutional affiliation and anyone's
               phone number (used for login codes by SMS).

There is no public sign-up. The first admin is created in the terminal:

    flask --app app/app.py create-admin

Passwords are stored only as werkzeug.security hashes. Sessions are signed
cookies (HttpOnly, SameSite=Lax, Secure when live) that end after 8 hours
without activity. Forms carry a CSRF token. After 5 failed logins for the same
email, that email is locked for 15 minutes.

Login with a code (/login/code) is the alternative to a password: the person
enters their email or phone number, a 6-digit code is sent to it (see
notify.py), and they type the code in. Codes last 10 minutes, work once, allow
5 tries, and are stored only as an HMAC keyed with SECRET_KEY. At most 3 codes
can be asked for per email or phone in 15 minutes. Every answer is the same
whether or not an account exists, and codes are sent in the background so the
response time does not give it away either.
"""

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import click
from flask import (Blueprint, abort, current_app, flash, g, jsonify, redirect,
                   render_template, request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

import app_db
import notify
import site_content
from app_db import ID


bp = Blueprint("auth", __name__)

ROLES = ("admin", "staff")
IDLE_TIMEOUT = timedelta(hours=8)
MAX_FAILURES = 5
LOCK_TIME = timedelta(minutes=15)
MIN_PASSWORD_LENGTH = 10
MAX_AFFILIATION_LENGTH = 160
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

CODE_LIFETIME = timedelta(minutes=10)
CODE_MAX_TRIES = 5
CODE_MAX_SENDS = 3
CODE_SEND_WINDOW = timedelta(minutes=15)

# Everything under these needs a login; /api routes listed here stay public.
PROTECTED_PREFIXES = ("/dashboard", "/admin", "/api/")
PUBLIC_API = {"/api/contact", "/api/ping"}

# Running on Render (or marked as production): stricter settings apply.
LIVE = bool(os.environ.get("RENDER")) or os.environ.get("UHAI_ENV") == "production"

# Compared against when an email is unknown, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))

# Admin access without a password ("bypass"), controlled by UHAI_ADMIN_BYPASS:
#   not set   only on the computer running the app, never live, and only until
#             the first active admin account exists (the default)
#   on        everywhere, including the live site, until the owner turns it
#             off. Anyone who opens the login page can then enter as admin.
#   off       never
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


def _migrate_v2(c):
    # Institutional affiliation: required for staff, empty for admins.
    c.execute("ALTER TABLE users ADD COLUMN affiliation TEXT")


def _migrate_v3(c):
    # Phone number (+2547XXXXXXXX), for login codes by SMS. Optional.
    c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    c.execute(f"""CREATE TABLE IF NOT EXISTS login_codes (
        id {ID},
        user_id INTEGER NOT NULL,
        code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS login_codes_user ON login_codes (user_id)")
    # One row per code asked for, by the email or phone typed in (account or not).
    c.execute("""CREATE TABLE IF NOT EXISTS login_code_requests (
        identifier TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS login_code_requests_identifier ON login_code_requests (identifier)")


MIGRATIONS = [("auth_v1", _migrate_v1), ("auth_v2", _migrate_v2), ("auth_v3", _migrate_v3)]


def _now():
    return datetime.now(timezone.utc)


def _iso(moment):
    return moment.isoformat(timespec="seconds")


def _normal_email(value):
    return (value or "").strip().lower()


def _normal_phone(value):
    """Kenyan mobile number in any common form -> '+254712345678', or None."""
    digits = re.sub(r"[\s\-().]", "", value or "").removeprefix("+")

    if not digits.isdigit():
        return None

    rest = digits[3:] if digits.startswith("254") else digits[1:] if digits.startswith("0") else digits
    return f"+254{rest}" if re.fullmatch(r"[17]\d{8}", rest) else None


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
    app.context_processor(lambda: {"current_user": current_user(), "csrf_token": csrf_token,
                                   "open_admin_access": bypass_forced()})
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
        "SELECT id, name, email, role, affiliation, active, session_version FROM users WHERE id = ?", (user_id,)
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


def bypass_forced():
    """The owner has switched admin access without a password on for everyone."""
    return os.environ.get("UHAI_ADMIN_BYPASS", "").strip().lower() in ("on", "1", "yes", "true")


def bypass_available():
    """
    By default, admin access without a password is offered only on this
    computer, never live, and only while no active admin account exists.
    UHAI_ADMIN_BYPASS=on offers it everywhere; =off never.
    """
    setting = os.environ.get("UHAI_ADMIN_BYPASS", "").strip().lower()

    if setting in ("off", "0", "no", "false"):
        return False

    if bypass_forced():
        return True

    if LIVE:
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
                _start_session(user)
                return redirect(target)

            _record_failure(email)
            # Same message whether the email, the password or the account status was the problem.
            error = "Email or password is not correct."

    return _site_page("auth/login.html", page="login", page_title="Log in", mode="password", error=error, email=email,
                      next_url=target, bypass=bypass_available())


def _start_session(user):
    session.clear()
    session.permanent = True
    session.update(uid=user["id"], ver=user["session_version"], seen=time.time())

    with app_db.transaction() as c:
        c.execute("UPDATE users SET last_login = ? WHERE id = ?", (_iso(_now()), user["id"]))


# ==================================================
# LOGIN WITH A CODE
# ==================================================

def _read_identifier(value):
    """An email or Kenyan phone number typed in -> (kind, normalised value), or (None, None)."""
    value = (value or "").strip()

    if "@" in value:
        email = _normal_email(value)
        return ("email", email) if EMAIL_RE.match(email) and len(email) <= 200 else (None, None)

    phone = _normal_phone(value)
    return ("phone", phone) if phone else (None, None)


def _code_hash(user_id, code):
    key = current_app.config["SECRET_KEY"].encode()
    return hmac.new(key, f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _too_many_codes(identifier):
    """Record one more code asked for; True if the limit for this email or phone is reached."""
    now = _now()

    with app_db.transaction() as c:
        c.execute("DELETE FROM login_code_requests WHERE created_at < ?", (_iso(now - timedelta(days=1)),))
        recent = c.execute(
            "SELECT COUNT(*) FROM login_code_requests WHERE identifier = ? AND created_at >= ?",
            (identifier, _iso(now - CODE_SEND_WINDOW)),
        ).fetchone()[0]

        if recent >= CODE_MAX_SENDS:
            return True

        c.execute("INSERT INTO login_code_requests (identifier, created_at) VALUES (?, ?)", (identifier, _iso(now)))

    return False


def _active_user_by(kind, identifier):
    if kind not in ("email", "phone"):
        return None

    rows = app_db.query(
        f"SELECT id, name, email, phone, session_version FROM users WHERE {kind} = ? AND active = 1", (identifier,)
    )
    return rows[0] if rows else None


def _send_code(kind, to, code):
    """Send in the background, so the answer comes back as fast whether or not an account exists."""
    app = current_app._get_current_object()
    minutes = int(CODE_LIFETIME.total_seconds() // 60)
    text = f"Your UHAI login code is {code}. It expires in {minutes} minutes. If you did not ask for it, ignore this message."

    def work():
        try:
            if kind == "email" and notify.email_ready():
                notify.send_email(to, "Your UHAI login code", text)
            elif kind == "phone" and notify.sms_ready():
                notify.send_sms(to, text)
            elif not LIVE:
                # On this computer, without email or SMS settings: show the code in the terminal.
                app.logger.warning("Login code for %s: %s (not sent: no %s settings)", to, code, kind)
        except Exception:
            app.logger.exception("Login code could not be sent by %s.", kind)

    threading.Thread(target=work, daemon=True).start()


def _channel_ready(kind):
    return not LIVE or (notify.email_ready() if kind == "email" else notify.sms_ready())


@bp.route("/login/code", methods=["GET", "POST"])
def login_code():
    target = _safe_next(request.values.get("next"))

    if current_user():
        return redirect(target)

    error = None
    identifier = (request.form.get("identifier") or "").strip()

    if request.method == "POST":
        kind, value = _read_identifier(identifier)

        if not _csrf_ok():
            error = "This page was open for too long. Please try again."
        elif not kind:
            error = "Please enter a valid email address or Kenyan mobile number, like 0712 345 678."
        elif not _channel_ready(kind):
            error = f"Codes by {'email' if kind == 'email' else 'SMS'} are not set up yet. Please log in with your password."
        elif _too_many_codes(value):
            error = f"Too many codes asked for. Please wait {int(CODE_SEND_WINDOW.total_seconds() // 60)} minutes and try again."
        else:
            user = _active_user_by(kind, value)

            if user:
                code = f"{secrets.randbelow(10 ** 6):06d}"
                now = _now()

                with app_db.transaction() as c:
                    # A new code replaces any earlier one.
                    c.execute("DELETE FROM login_codes WHERE user_id = ?", (user["id"],))
                    c.execute(
                        "INSERT INTO login_codes (user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
                        (user["id"], _code_hash(user["id"], code), _iso(now), _iso(now + CODE_LIFETIME)),
                    )

                _send_code(kind, value, code)

            # Same answer whether or not an account matched.
            session["code_for"] = [kind, value]
            return redirect(url_for("auth.login_code_verify", next=target))

    return _site_page("auth/login.html", page="login", page_title="Log in with a code", mode="code",
                      error=error, identifier=identifier, next_url=target, bypass=False)


@bp.route("/login/code/verify", methods=["GET", "POST"])
def login_code_verify():
    target = _safe_next(request.values.get("next"))

    if current_user():
        return redirect(target)

    pending = session.get("code_for")

    if not pending:
        return redirect(url_for("auth.login_code", next=target))

    kind, value = pending
    error = None

    if request.method == "POST":
        code = re.sub(r"\s", "", request.form.get("code") or "")

        if not _csrf_ok():
            error = "This page was open for too long. Please try again."
        elif not re.fullmatch(r"\d{6}", code):
            error = "Please enter the 6-digit code."
        else:
            user = _active_user_by(kind, value)
            rows = app_db.query(
                "SELECT id, code_hash, expires_at, attempts FROM login_codes WHERE user_id = ? AND used_at IS NULL",
                (user["id"],),
            ) if user else []
            row = rows[0] if rows else None
            # Always compute a hash, so a missing account takes as long as a wrong code.
            given = _code_hash(user["id"] if user else 0, code)
            usable = row and row["attempts"] < CODE_MAX_TRIES and datetime.fromisoformat(row["expires_at"]) > _now()

            if usable and hmac.compare_digest(given, row["code_hash"]):
                with app_db.transaction() as c:
                    claimed = c.execute(
                        "UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", (_iso(_now()), row["id"])
                    ).rowcount

                if claimed:
                    _start_session(user)
                    return redirect(target)

            if row:
                with app_db.transaction() as c:
                    c.execute("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", (row["id"],))

            error = "That code is not right or has expired. Check it, or ask for a new code."

    return _site_page("auth/login.html", page="login", page_title="Enter your code", mode="verify",
                      error=error, sent_to=value, next_url=target, bypass=False)


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


def _check_affiliation(role, affiliation):
    if role != "staff":
        return None
    if not affiliation:
        return "Please enter the institutional affiliation for staff."
    if len(affiliation) > MAX_AFFILIATION_LENGTH:
        return f"Keep the affiliation under {MAX_AFFILIATION_LENGTH} characters."
    return None


def _done(message, ok=True):
    flash(message, "ok" if ok else "error")
    return redirect(url_for("auth.users"))


@bp.route("/admin/users")
def users():
    rows = app_db.query(
        "SELECT id, name, email, phone, role, affiliation, active, created_at, last_login FROM users ORDER BY active DESC, lower(name)"
    )
    return render_template("auth/users.html", users=rows, roles=ROLES, min_password=MIN_PASSWORD_LENGTH,
                           max_affiliation=MAX_AFFILIATION_LENGTH)


@bp.route("/admin/users", methods=["POST"])
def add_user():
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    name = (request.form.get("name") or "").strip()
    email = _normal_email(request.form.get("email"))
    role = request.form.get("role")
    password = request.form.get("password") or ""
    # Only staff carry an affiliation; anything sent for an admin is ignored.
    affiliation = (request.form.get("affiliation") or "").strip() if role == "staff" else None
    phone_typed = (request.form.get("phone") or "").strip()
    phone = _normal_phone(phone_typed)

    problem = (
        "Please enter a name." if not name or len(name) > 120 else
        "Please enter a valid email address." if not EMAIL_RE.match(email) or len(email) > 200 else
        "Please enter a Kenyan mobile number, like 0712 345 678, or leave it empty." if phone_typed and not phone else
        "Please choose a role." if role not in ROLES else
        _check_affiliation(role, affiliation) or _check_password(password)
    )

    if not problem and app_db.query("SELECT 1 FROM users WHERE email = ?", (email,)):
        problem = "A user with this email already exists."

    if not problem and phone and app_db.query("SELECT 1 FROM users WHERE phone = ?", (phone,)):
        problem = "Another user already has this phone number."

    if problem:
        return _done(f"User not added: {problem}", ok=False)

    with app_db.transaction() as c:
        c.execute(
            "INSERT INTO users (name, email, phone, password_hash, role, affiliation, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            (name, email, phone, generate_password_hash(password), role, affiliation, _iso(_now())),
        )

    # The first real admin ends the temporary access (unless the owner has it
    # switched on for good): log in with the new account.
    if current_user().get("bypass") and role == "admin" and not bypass_available():
        session.clear()
        flash(f"Admin account created for {name}. Temporary access is now off: log in with {email}.", "ok")
        return redirect(url_for("auth.login"))

    return _done(f"{name} can now log in with {email}. Give them their password in person or by phone.")


def _user_or_404(user_id):
    rows = app_db.query("SELECT id, name, email, role, active FROM users WHERE id = ?", (user_id,))

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
        c.execute("DELETE FROM login_codes WHERE user_id = ?", (user_id,))

    if user_id == current_user()["id"]:
        session["ver"] = session.get("ver", 1) + 1

    return _done(f"Password changed for {user['name']}.")


@bp.route("/admin/users/<int:user_id>/affiliation", methods=["POST"])
def set_affiliation(user_id):
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    user = _user_or_404(user_id)

    if user["role"] != "staff":
        return _done("Only staff have an institutional affiliation.", ok=False)

    affiliation = (request.form.get("affiliation") or "").strip()
    problem = _check_affiliation("staff", affiliation)

    if problem:
        return _done(f"Affiliation not changed: {problem}", ok=False)

    with app_db.transaction() as c:
        c.execute("UPDATE users SET affiliation = ? WHERE id = ?", (affiliation, user_id))

    return _done(f"Affiliation saved for {user['name']}.")


@bp.route("/admin/users/<int:user_id>/phone", methods=["POST"])
def set_phone(user_id):
    if not _csrf_ok():
        return _done("This page was open for too long. Please try again.", ok=False)

    user = _user_or_404(user_id)
    typed = (request.form.get("phone") or "").strip()
    phone = _normal_phone(typed)

    if typed and not phone:
        return _done("Phone not changed: please enter a Kenyan mobile number, like 0712 345 678.", ok=False)

    if phone and app_db.query("SELECT 1 FROM users WHERE phone = ? AND id <> ?", (phone, user_id)):
        return _done("Phone not changed: another user already has this number.", ok=False)

    with app_db.transaction() as c:
        c.execute("UPDATE users SET phone = ? WHERE id = ?", (phone, user_id))

    return _done(f"Phone {'saved' if phone else 'removed'} for {user['name']}.")


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
        c.execute("DELETE FROM login_codes WHERE user_id = ?", (user_id,))

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
