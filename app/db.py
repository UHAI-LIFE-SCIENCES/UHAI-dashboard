import os
import sqlite3
from pathlib import Path

# Project root = folder containing uhai_dashboard.db
BASE_DIR = Path(__file__).resolve().parent.parent

# Override with UHAI_DB_PATH to point at another copy of the database.
DB_PATH = Path(os.environ.get("UHAI_DB_PATH", BASE_DIR / "uhai_dashboard.db"))


def get_connection():
    """
    Create a read-only connection to the SQLite database.
    """
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def query(sql, params=()):
    """
    Execute a SELECT query and return the results as dictionaries.
    """
    connection = get_connection()

    try:
        rows = connection.execute(sql, params).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


def scalar(sql, params=()):
    """
    Execute a query that returns a single value.
    """
    rows = query(sql, params)

    if not rows:
        return None

    return next(iter(rows[0].values()))
