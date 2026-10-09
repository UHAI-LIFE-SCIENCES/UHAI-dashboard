from flask import request


# ==================================================
# FILTER DIMENSIONS PER TABLE
# ==================================================
#
# The four tables do not share column names, so each filter is mapped to the
# column (or SQL expression) that carries it in each table. None means the
# table has no such field and the filter is ignored for that table.

def q(column):
    """Quote a column name (several contain brackets, slashes or quotes)."""
    return '"' + column.replace('"', '""') + '"'


# Canonical product vocabulary used by the product filter. Each table names
# its products differently; the CASE expressions below map them. This mapping
# is an assumption documented in the README.
PRODUCTS = ["Whole Blood", "Red Cells", "Plasma", "Platelets"]

SOURCING_PRODUCT = f"""CASE
    WHEN {q('blood_product')} LIKE 'Whole Blood%' THEN 'Whole Blood'
    WHEN {q('blood_product')} = 'Apheresis Platelets' THEN 'Platelets'
    WHEN {q('blood_product')} = 'Apheresis Plasma' THEN 'Plasma'
    ELSE {q('blood_product')} END"""

DISTRIBUTION_PRODUCT = f"""CASE
    WHEN {q('type_of_product')} = 'Packed Red Blood Cells' THEN 'Red Cells'
    WHEN {q('type_of_product')} = 'Fresh Frozen Plasma' THEN 'Plasma'
    WHEN {q('type_of_product')} = 'Platelet Concentrate' THEN 'Platelets'
    ELSE {q('type_of_product')} END"""

TRANSFUSION_PRODUCT = f"""CASE
    WHEN {q('blood_product_requested')} = 'Packed Red Blood Cells' THEN 'Red Cells'
    WHEN {q('blood_product_requested')} = 'Fresh Frozen Plasma' THEN 'Plasma'
    ELSE {q('blood_product_requested')} END"""

# Collection channel, parsed from e.g. "450 mL (Mobile Drive)" -> "Mobile Drive"
RECEIVED = q("how_much_blood_was_received_(in-house/mobile)")
CHANNEL = f"trim(replace(substr({RECEIVED}, instr({RECEIVED}, '(') + 1), ')', ''))"

TABLES = {
    "sourcing": {
        "date": f"substr({q('date')}, 1, 10)",
        "blood_group": q("blood_group"),
        "product": SOURCING_PRODUCT,
        "facility": None,
        "donor_type": q("voluntary/replacement"),
        "channel": None,
    },
    "processing": {
        # No date or facility column exists in processing.
        "date": None,
        "blood_group": q("blood_groups"),
        # Product is not a row attribute here: each row is one donated unit
        # that yields several components (see the "component" breakdown).
        "product": None,
        "facility": None,
        "donor_type": None,
        "channel": CHANNEL,
    },
    "distributions": {
        "date": f"substr({q('date_blood_ordered')}, 1, 10)",
        "blood_group": None,
        "product": DISTRIBUTION_PRODUCT,
        "facility": q("recipient_facility"),
        "donor_type": None,
        "channel": None,
    },
    "transfusions": {
        "date": f"substr({q('date_blood_first_ordered')}, 1, 10)",
        "blood_group": q("blood_group"),
        "product": TRANSFUSION_PRODUCT,
        "facility": None,
        "donor_type": None,
        "channel": None,
    },
}

LIST_FILTERS = ("blood_group", "product", "facility", "donor_type", "channel")
FILTER_KEYS = ["date", *LIST_FILTERS]


def support_matrix():
    """Which filters each table can honour."""
    return {
        table: {key: dims[key] is not None for key in FILTER_KEYS}
        for table, dims in TABLES.items()
    }


def _list_arg(name):
    values = []

    for raw in request.args.getlist(name):
        values.extend(v.strip() for v in raw.split(",") if v.strip())

    return values


def read_filters():
    """
    Read filters from the query string.

    Supported filters:
    - from, to        (YYYY-MM-DD)
    - blood_group     (repeatable or comma-separated)
    - product         (canonical names, see PRODUCTS)
    - facility        (recipient facility names)
    - donor_type      (sourcing: Voluntary / Family / Replacement)
    - channel         (processing: In-house Walk-in / Mobile Drive / Mobile Outreach)
    """
    return {
        "from": request.args.get("from") or None,
        "to": request.args.get("to") or None,
        "blood_group": _list_arg("blood_group"),
        "product": _list_arg("product"),
        "facility": _list_arg("facility"),
        "donor_type": _list_arg("donor_type"),
        "channel": _list_arg("channel"),
    }


def build_filters(table, filters=None):
    """
    Build a WHERE clause for one table.

    Returns (where_clause, params, applied) where `applied` lists the filters
    that were actually used. Filters the table cannot support are skipped
    rather than raising, so one filter state can drive every page.
    """
    filters = filters if filters is not None else read_filters()
    dims = TABLES[table]

    conditions = ["1=1"]
    params = []
    applied = []

    # -----------------------------------------
    # DATE RANGE
    # -----------------------------------------

    if dims["date"] and (filters.get("from") or filters.get("to")):

        if filters.get("from"):
            conditions.append(f"{dims['date']} >= ?")
            params.append(filters["from"])

        if filters.get("to"):
            conditions.append(f"{dims['date']} <= ?")
            params.append(filters["to"])

        applied.append("date")

    # -----------------------------------------
    # LIST FILTERS
    # -----------------------------------------

    for key in LIST_FILTERS:

        values = filters.get(key) or []

        if dims[key] and values:

            placeholders = ",".join(["?"] * len(values))

            conditions.append(f"({dims[key]}) IN ({placeholders})")

            params.extend(values)

            applied.append(key)

    return " AND ".join(conditions), params, applied
