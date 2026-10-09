"""
Contact-form storage.

Messages are validated and saved to a local SQLite file, separate from the
read-only analytics database. No email is sent: nobody at UHAI is notified
until a delivery integration (e.g. SMTP or a CRM) is added in notify().
"""

import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from site_content import CONTACT_REASONS

BASE_DIR = Path(__file__).resolve().parent.parent
CONTACT_DB = Path(os.environ.get("UHAI_CONTACT_DB", BASE_DIR / "contact_messages.db"))

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

LIMITS = {"name": 120, "email": 200, "organisation": 160, "message": 4000}


def validate(form):
    """Return (clean_data, errors). Errors map field -> message."""
    data = {k: (form.get(k) or "").strip() for k in ("name", "email", "organisation", "reason", "message")}
    errors = {}

    if not data["name"]:
        errors["name"] = "Please enter your name."
    if not data["email"]:
        errors["email"] = "Please enter your email address."
    elif not EMAIL_RE.match(data["email"]):
        errors["email"] = "Please enter a valid email address, like name@example.org."
    if data["reason"] not in CONTACT_REASONS:
        errors["reason"] = "Please choose a reason for contacting UHAI."
    if len(data["message"]) < 10:
        errors["message"] = "Please write a message of at least 10 characters."

    for field, limit in LIMITS.items():
        if len(data[field]) > limit and field not in errors:
            errors[field] = f"Please keep this under {limit} characters."

    return data, errors


def save(data):
    connection = sqlite3.connect(CONTACT_DB)

    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                organisation TEXT,
                reason TEXT NOT NULL,
                message TEXT NOT NULL
            )
            """
        )
        cursor = connection.execute(
            "INSERT INTO messages (received_at, name, email, organisation, reason, message) VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"),
             data["name"], data["email"], data["organisation"], data["reason"], data["message"]),
        )
        connection.commit()
        return cursor.lastrowid

    finally:
        connection.close()


def notify(data):
    """
    Hook for real delivery. Returns True only if someone was actually notified.
    Not implemented yet; configure SMTP credentials via environment variables.
    """
    return False
