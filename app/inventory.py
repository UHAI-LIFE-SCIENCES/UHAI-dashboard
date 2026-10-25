"""
Inventory: what RBTC Eldoret holds for blood drives, where each item came from,
and its brand and type.

Every stock entry records an item type (e.g. "Drinking water"), a brand
(e.g. Dasani), a type/specification (e.g. "500 ml bottle"), a source (KEMSA,
a development partner, UHAI, Good Friends of UHAI or other) and a quantity in
the item type's counting unit. Totals are then built at every level:

    item type   all water, whatever the brand or source
    brand       all Dasani, whoever gave it
    source      everything from one supplier or partner

The first run adds a sample inventory (marked as sample) so the page is not
empty; an admin can remove it once real stock has been entered.
"""

import hmac
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, session

import app_db
from app_db import ID


bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")


# ==================================================
# VOCABULARY
# ==================================================

# Stages of a blood drive, in order
CATEGORIES = [
    "Donor registration & screening",
    "Phlebotomy (blood collection)",
    "Screening & testing",
    "Product separation",
    "Cold storage & transport",
    "Waste management",
    "Post-donation refreshments",
    "Drive logistics",
]

KINDS = ["Consumable", "Equipment"]

SOURCES = ["KEMSA", "Development partner", "UHAI", "Good Friends of UHAI", "Other"]

# Sources that need a name: which partner, or where it came from
NAMED_SOURCES = {"Development partner": "Partner's name", "Other": "Where it came from"}

UNITS = ["pieces", "bottles", "packets", "tests", "kits", "boxes", "packs", "rolls", "pairs", "bags", "units"]

# Items expiring within this many days are flagged.
EXPIRY_WINDOW_DAYS = 30


# ==================================================
# SCHEMA
# ==================================================

def _schema_v1(c):
    c.execute(f"""CREATE TABLE IF NOT EXISTS stock_items (
        id {ID},
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        kind TEXT NOT NULL,
        unit TEXT NOT NULL,
        reorder_level INTEGER
    )""")
    c.execute(f"""CREATE TABLE IF NOT EXISTS stock_entries (
        id {ID},
        item_id INTEGER NOT NULL REFERENCES stock_items (id),
        brand TEXT NOT NULL,
        specification TEXT,
        source TEXT NOT NULL,
        partner TEXT,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        batch_number TEXT,
        expiry_date TEXT,
        received_date TEXT NOT NULL,
        sample INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS stock_entries_item ON stock_entries (item_id)")


def _sample_v1(c):
    """Add the sample inventory once. Removing it later does not bring it back."""
    import inventory_sample

    now = _now()
    ids = {}

    for name, category, kind, unit, reorder in inventory_sample.ITEMS:
        ids[name] = c.execute(
            "INSERT INTO stock_items (name, category, kind, unit, reorder_level) VALUES (?, ?, ?, ?, ?) RETURNING id",
            (name, category, kind, unit, reorder),
        ).fetchone()[0]

    for e in inventory_sample.ENTRIES:
        c.execute(
            """
            INSERT INTO stock_entries (item_id, brand, specification, source, partner, quantity,
                                       batch_number, expiry_date, received_date, sample, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (ids[e["item"]], e["brand"], e.get("spec"), e["source"], e.get("partner"), e["qty"],
             e.get("batch"), e.get("expiry"), e["received"], now, now),
        )


MIGRATIONS = [("stock_v1", _schema_v1), ("stock_sample_v1", _sample_v1)]


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init():
    app_db.migrate(MIGRATIONS)


# ==================================================
# CHECKS
# ==================================================

def _csrf_ok():
    """Changes come from the dashboard, which sends the session's CSRF token in a header."""
    sent = request.headers.get("X-CSRF-Token", "")
    return bool(sent) and hmac.compare_digest(sent, session.get("csrf", ""))


def _refused():
    return jsonify({"ok": False, "error": "This page was open for too long. Please reload it and try again."}), 400


class Form:
    """Clean values and error messages (field -> message) from a JSON body."""

    def __init__(self, data):
        self.data = data or {}
        self.clean = {}
        self.errors = {}

    def text(self, key, label, required=False, limit=120):
        value = str(self.data.get(key) or "").strip()

        if required and not value:
            self.errors[key] = f"Please enter {label}."
        elif len(value) > limit:
            self.errors[key] = f"Please keep this under {limit} characters."

        self.clean[key] = value or None
        return self.clean[key]

    def choice(self, key, label, options):
        value = str(self.data.get(key) or "").strip()

        if value not in options:
            self.errors[key] = f"Please choose {label}."

        self.clean[key] = value
        return value

    def number(self, key, label, required=False):
        raw = str(self.data.get(key) if self.data.get(key) is not None else "").strip().replace(",", "")
        self.clean[key] = None

        if not raw:
            if required:
                self.errors[key] = f"Please enter {label}."
            return None

        if not raw.isdigit():
            self.errors[key] = f"Please enter {label} as a whole number (0 or more)."
            return None

        self.clean[key] = int(raw)
        return self.clean[key]

    def day(self, key, label, required=False, not_future=False):
        raw = str(self.data.get(key) or "").strip()
        self.clean[key] = None

        if not raw:
            if required:
                self.errors[key] = f"Please enter {label}."
            return None

        try:
            parsed = date.fromisoformat(raw)
        except ValueError:
            self.errors[key] = f"Please enter {label} as a date."
            return None

        if not_future and parsed > date.today():
            self.errors[key] = f"{label[0].upper()}{label[1:]} cannot be in the future."
            return None

        self.clean[key] = parsed.isoformat()
        return self.clean[key]


def _invalid(errors):
    return jsonify({"ok": False, "errors": errors}), 422


# ==================================================
# READING: LIST AND TOTALS
# ==================================================

def _source_label(source, partner):
    return f"{source}: {partner}" if partner else source


def entries():
    rows = app_db.query(
        """
        SELECT e.*, i.name AS item, i.category, i.kind, i.unit, i.reorder_level
        FROM stock_entries e JOIN stock_items i ON i.id = e.item_id
        ORDER BY i.category, i.name, e.brand, e.received_date DESC, e.id DESC
        """
    )
    today = date.today().isoformat()
    soon = (date.today() + timedelta(days=EXPIRY_WINDOW_DAYS)).isoformat()

    for r in rows:
        r["source_label"] = _source_label(r["source"], r["partner"])
        r["expired"] = bool(r["expiry_date"]) and r["quantity"] > 0 and r["expiry_date"] < today
        r["expiring"] = bool(r["expiry_date"]) and r["quantity"] > 0 and today <= r["expiry_date"] <= soon

    return rows


def _add(bucket, key, qty):
    bucket[key] = bucket.get(key, 0) + qty


def summary():
    """
    Totals at every level: per item type (all brands and sources), per brand
    (all sources), and per source.
    """
    rows = entries()
    items = {}
    brands = {}
    sources = {}

    for r in rows:
        it = items.setdefault(r["item_id"], {
            "id": r["item_id"], "item": r["item"], "category": r["category"], "kind": r["kind"],
            "unit": r["unit"], "reorder_level": r["reorder_level"], "total": 0,
            "by_brand": {}, "by_source": {}, "entries": 0, "expired": 0, "expiring": 0,
        })
        it["total"] += r["quantity"]
        it["entries"] += 1
        it["expired"] += r["expired"]
        it["expiring"] += r["expiring"]
        _add(it["by_brand"], r["brand"], r["quantity"])
        _add(it["by_source"], r["source_label"], r["quantity"])

        b = brands.setdefault((r["item_id"], r["brand"]), {
            "item": r["item"], "brand": r["brand"], "category": r["category"], "unit": r["unit"],
            "total": 0, "by_source": {}, "specifications": set(),
        })
        b["total"] += r["quantity"]
        _add(b["by_source"], r["source_label"], r["quantity"])
        if r["specification"]:
            b["specifications"].add(r["specification"])

        s = sources.setdefault(r["source_label"], {
            "source": r["source"], "partner": r["partner"], "label": r["source_label"],
            "entries": 0, "items": set(), "consumables": 0, "equipment": 0,
        })
        s["entries"] += 1
        s["items"].add(r["item_id"])
        s["equipment" if r["kind"] == "Equipment" else "consumables"] += r["quantity"]

    item_rows = sorted(items.values(), key=lambda i: (CATEGORIES.index(i["category"]) if i["category"] in CATEGORIES else 99, i["item"]))

    for it in item_rows:
        it["low"] = it["reorder_level"] is not None and it["total"] <= it["reorder_level"]
        it["brands"] = len(it["by_brand"])
        it["sources"] = len(it["by_source"])

    brand_rows = sorted(
        [dict(b, specifications=sorted(b["specifications"]), sources=len(b["by_source"])) for b in brands.values()],
        key=lambda b: (b["item"], -b["total"]),
    )
    source_rows = sorted(
        [dict(s, items=len(s["items"])) for s in sources.values()],
        key=lambda s: (SOURCES.index(s["source"]) if s["source"] in SOURCES else 99, s["label"]),
    )

    return {
        "today": date.today().isoformat(),
        "expiry_window_days": EXPIRY_WINDOW_DAYS,
        "cards": {
            "item_types": len(item_rows),
            "consumable_types": sum(i["kind"] == "Consumable" for i in item_rows),
            "equipment_types": sum(i["kind"] == "Equipment" for i in item_rows),
            "low": sum(i["low"] for i in item_rows),
            "out": sum(i["total"] == 0 for i in item_rows),
            "expiring": sum(r["expiring"] for r in rows),
            "expired": sum(r["expired"] for r in rows),
            "sources": len(source_rows),
            "brands": len(brand_rows),
        },
        "sample_entries": sum(r["sample"] for r in rows),
        "items": item_rows,
        "brands": brand_rows,
        "sources": source_rows,
    }


# ==================================================
# ROUTES
# ==================================================

@bp.route("/options")
def options():
    items = app_db.query("SELECT id, name, category, kind, unit, reorder_level FROM stock_items ORDER BY name")
    brands = app_db.query("SELECT DISTINCT i.name AS item, e.brand FROM stock_entries e JOIN stock_items i ON i.id = e.item_id ORDER BY 1, 2")
    partners = app_db.query("SELECT DISTINCT source, partner FROM stock_entries WHERE partner IS NOT NULL ORDER BY 1, 2")
    by_item = defaultdict(list)

    for b in brands:
        by_item[b["item"]].append(b["brand"])

    return jsonify({
        "categories": CATEGORIES,
        "kinds": KINDS,
        "sources": SOURCES,
        "named_sources": NAMED_SOURCES,
        "units": UNITS,
        "items": items,
        "brands_by_item": by_item,
        "partners": [p["partner"] for p in partners if p["source"] == "Development partner"],
        "is_admin": _is_admin(),
    })


@bp.route("/summary")
def get_summary():
    return jsonify(summary())


@bp.route("/entries")
def get_entries():
    return jsonify(entries())


def _entry_fields(f):
    """Validate an entry; returns the item type's values (existing or new)."""
    name = f.text("item", "the item", required=True)
    f.text("brand", "the brand (or 'Unbranded')", required=True, limit=80)
    f.text("specification", "the type or specification", limit=120)
    source = f.choice("source", "where it came from", SOURCES)
    f.text("partner", NAMED_SOURCES.get(source, "a name").lower(), required=source in NAMED_SOURCES, limit=120)
    f.number("quantity", "the quantity", required=True)
    f.text("batch_number", "the batch or lot number", limit=60)
    f.day("expiry_date", "the expiry date")
    f.day("received_date", "the date received", required=True, not_future=True)

    if source not in NAMED_SOURCES:
        f.clean["partner"] = None

    existing = app_db.query("SELECT * FROM stock_items WHERE lower(name) = lower(?)", (name or "",)) if name else []

    if existing:
        item = existing[0]
        unit = str(f.data.get("unit") or "").strip()

        # Totals only add up if one item type is always counted in the same unit.
        if unit and unit != item["unit"]:
            f.errors["unit"] = f"{item['name']} is counted in {item['unit']}. Enter the quantity in {item['unit']}."

        return item

    f.choice("category", "the stage it is used in", CATEGORIES)
    f.choice("kind", "consumable or equipment", KINDS)
    f.choice("unit", "the unit it is counted in", UNITS)
    f.number("reorder_level", "the reorder level")
    return None


def _save_item(c, item, f):
    if item:
        return item["id"]

    return c.execute(
        "INSERT INTO stock_items (name, category, kind, unit, reorder_level) VALUES (?, ?, ?, ?, ?) RETURNING id",
        (f.clean["item"], f.clean["category"], f.clean["kind"], f.clean["unit"], f.clean["reorder_level"]),
    ).fetchone()[0]


@bp.route("/entries", methods=["POST"])
def add_entry():
    if not _csrf_ok():
        return _refused()

    f = Form(request.get_json(silent=True))
    item = _entry_fields(f)

    if f.errors:
        return _invalid(f.errors)

    c = f.clean

    with app_db.transaction() as conn:
        item_id = _save_item(conn, item, f)
        new_id = conn.execute(
            """
            INSERT INTO stock_entries (item_id, brand, specification, source, partner, quantity,
                                       batch_number, expiry_date, received_date, sample, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id
            """,
            (item_id, c["brand"], c["specification"], c["source"], c["partner"], c["quantity"],
             c["batch_number"], c["expiry_date"], c["received_date"], _now(), _now()),
        ).fetchone()[0]

        if item and f.clean.get("reorder_level") is not None:
            conn.execute("UPDATE stock_items SET reorder_level = ? WHERE id = ?", (f.clean["reorder_level"], item_id))

    return jsonify({"ok": True, "id": new_id}), 201


@bp.route("/entries/<int:entry_id>", methods=["PATCH"])
def edit_entry(entry_id):
    if not _csrf_ok():
        return _refused()

    if not app_db.query("SELECT 1 FROM stock_entries WHERE id = ?", (entry_id,)):
        return jsonify({"ok": False, "error": "Entry not found."}), 404

    f = Form(request.get_json(silent=True))
    item = _entry_fields(f)

    if f.errors:
        return _invalid(f.errors)

    c = f.clean

    with app_db.transaction() as conn:
        item_id = _save_item(conn, item, f)
        conn.execute(
            """
            UPDATE stock_entries SET item_id = ?, brand = ?, specification = ?, source = ?, partner = ?,
                   quantity = ?, batch_number = ?, expiry_date = ?, received_date = ?, updated_at = ?
            WHERE id = ?
            """,
            (item_id, c["brand"], c["specification"], c["source"], c["partner"], c["quantity"],
             c["batch_number"], c["expiry_date"], c["received_date"], _now(), entry_id),
        )

    return jsonify({"ok": True})


@bp.route("/entries/<int:entry_id>", methods=["DELETE"])
def delete_entry(entry_id):
    if not _csrf_ok():
        return _refused()

    with app_db.transaction() as conn:
        conn.execute("DELETE FROM stock_entries WHERE id = ?", (entry_id,))

    return jsonify({"ok": True})


def _is_admin():
    import auth

    user = auth.current_user()
    return bool(user) and user["role"] == "admin"


@bp.route("/sample", methods=["DELETE"])
def remove_sample():
    """Admins: remove all sample entries (real entries are kept)."""
    if not _csrf_ok():
        return _refused()

    if not _is_admin():
        return jsonify({"ok": False, "error": "Only an admin can remove the sample data."}), 403

    with app_db.transaction() as conn:
        removed = conn.execute("DELETE FROM stock_entries WHERE sample = 1").rowcount
        # Item types that only existed for the sample go too.
        conn.execute("DELETE FROM stock_items WHERE id NOT IN (SELECT item_id FROM stock_entries)")

    return jsonify({"ok": True, "removed": removed})
