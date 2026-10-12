"""
Generic indicator explorer behind /api/explore.

Labels and allowed breakdowns come from static/data/indicators.json (shared
with the offline mock). This module holds the SQL for each dimension and
measure. Every value is aggregated: no record-level or identifying data
leaves this endpoint.
"""

import json
from pathlib import Path

from analytics import AGE_ORDER, COMPONENT_COLUMNS, SCREENING, WEEKDAY_ORDER, _all_periods, period_expr
from db import query
from filters import CHANNEL, SOURCING_PRODUCT, TABLES, build_filters, q

CATALOG_PATH = Path(__file__).resolve().parent / "static" / "data" / "indicators.json"
CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

TAT = q("turnaround_time_(days)")
STATUS = q("transfusion_outcome_/_status")
COMPONENT_SUM = " + ".join(f"SUM({q(c)})" for c in COMPONENT_COLUMNS.values())

# --------------------------------------------------
# Dimensions: SQL expression and (optional) natural ordering
# --------------------------------------------------
DIM_SQL = {
    "sourcing": {
        "blood_group": ("blood_group", None),
        "collection": (SOURCING_PRODUCT, None),
        "donor_type": (q("voluntary/replacement"), None),
        "sex": ("sex", None),
        "age_group": (q("donor_age_group"), "label"),
        "weekday": ("day_of_week", f"MIN({WEEKDAY_ORDER})"),
    },
    "processing": {
        "blood_group": ("blood_groups", None),
        "channel": (CHANNEL, None),
        # Strip the percentage embedded in the category text, e.g. "Reactive: HBV (1.2%)" -> "Reactive: HBV"
        "screening": (
            f"CASE WHEN {SCREENING} LIKE 'Reactive:%' "
            f"THEN 'Reactive: ' || trim(substr({SCREENING}, 11, instr({SCREENING}, ' (') - 11)) "
            f"ELSE 'Non-reactive' END",
            None,
        ),
        "discard_reason": ("reason_for_discard", None),
    },
    "distributions": {
        "facility": (q("recipient_facility"), None),
        "product": (q("type_of_product"), None),
        "status": (STATUS, None),
        "turnaround": (f"CAST({TAT} AS TEXT) || CASE WHEN {TAT} = 1 THEN ' day' ELSE ' days' END", f"MIN({TAT})"),
    },
    "transfusions": {
        "blood_group": ("blood_group", None),
        "product": ("blood_product_requested", None),
        "reason": ("reason_for_transfusion", None),
        "fulfilment": ("fulfilment", None),
        "age_group": ("age_group", f"MIN({AGE_ORDER})"),
        "sex": ("sex", None),
        "outcome": ("transfusion_outcomes", None),
    },
}

# --------------------------------------------------
# Measures: SQL per indicator measure key
# --------------------------------------------------
MEASURE_SQL = {
    "donations": {"donations": "COUNT(*)"},
    "volume_donated": {"volume": f"SUM({q('volume_donated_(ml)')}) / 1000.0"},
    "voluntary_share": {"share": f"100.0 * SUM(CASE WHEN {q('voluntary/replacement')} = 'Voluntary' THEN 1 ELSE 0 END) / COUNT(*)"},

    "units_received": {"units": "COUNT(*)"},
    "components": {"components": COMPONENT_SUM},
    "reactive_share": {"share": f"100.0 * SUM(CASE WHEN {SCREENING} LIKE 'Reactive:%' THEN 1 ELSE 0 END) / COUNT(*)"},
    "discard_share": {"share": "100.0 * SUM(CASE WHEN is_discarded = 'Yes' THEN 1 ELSE 0 END) / COUNT(*)"},

    "units_distributed": {"units": f"SUM({q('quantity_(units)')})"},
    "orders": {"orders": "COUNT(*)"},
    "mean_turnaround": {"days": f"AVG({TAT})"},
    "facility_returns": {
        "units": f"SUM({q('quantity_(units)')})",
        "returned": f"100.0 * SUM(CASE WHEN {STATUS} = 'Returned Unused' THEN 1 ELSE 0 END) / COUNT(*)",
    },

    "requests": {"requests": "COUNT(*)"},
    "units_requested_given": {"requested": "SUM(quantity_requested)", "given": "SUM(quantity_given)"},
    "fulfilment_rate": {"rate": "100.0 * SUM(quantity_given) / SUM(quantity_requested)"},
    "mean_hb": {"hb": "AVG(hb_level)"},
    "reason_hb_fulfilment": {"hb": "AVG(hb_level)", "rate": "100.0 * SUM(quantity_given) / SUM(quantity_requested)"},
}


def _clean(v):
    return round(v, 2) if isinstance(v, float) else v


def explore(key, by, grain_filters):
    """Aggregate one indicator by one dimension under the current filters."""
    filters = grain_filters
    ind = CATALOG["indicators"].get(key)

    if not ind:
        raise ValueError(f"Unknown indicator '{key}'")

    by = by or ind["default_by"]

    if by not in ind["dims"]:
        raise ValueError(f"'{ind['label']}' cannot be broken down by '{by}'")

    table = ind["table"]
    dim = CATALOG["dims"][table][by]
    measures = MEASURE_SQL[key]
    keys = [m["key"] for m in ind["measures"]]
    where, params, applied = build_filters(table, filters)
    selects = ", ".join(f"{measures[k]} AS {q(k)}" for k in keys)

    if by == "component":
        # Unpivot the component columns into rows
        row = query(
            "SELECT " + ", ".join(f"SUM({q(col)}) AS {q(name)}" for name, col in COMPONENT_COLUMNS.items())
            + f" FROM processing WHERE {where}",
            params,
        )[0]
        categories = list(COMPONENT_COLUMNS)
        values = {keys[0]: [int(row[name] or 0) for name in categories]}

    elif dim.get("time"):
        period = period_expr(TABLES[table]["date"], dim["time"])
        rows = query(f"SELECT {period} AS label, {selects} FROM {table} WHERE {where} GROUP BY 1 ORDER BY 1", params)
        categories = _all_periods(rows[0]["label"], rows[-1]["label"], dim["time"]) if rows else []
        index = {r["label"]: r for r in rows}
        fill = None if ind.get("ratio") else 0
        values = {k: [_clean(index[c][k]) if c in index else fill for c in categories] for k in keys}

    else:
        expr, order = DIM_SQL[table][by]
        order = order or f"{q(keys[0])} DESC"
        rows = query(f"SELECT {expr} AS label, {selects} FROM {table} WHERE {where} GROUP BY 1 ORDER BY {order}", params)
        categories = [r["label"] for r in rows]
        values = {k: [_clean(r[k]) for r in rows] for k in keys}

    overall = query(f"SELECT {selects} FROM {table} WHERE {where}", params)[0] if by != "component" else {
        keys[0]: sum(values[keys[0]])
    }

    return {
        "indicator": {"key": key, **{k: v for k, v in ind.items() if k not in ("dims",)}},
        "by": by,
        "by_label": dim["label"],
        "time": dim.get("time"),
        "ordinal": bool(dim.get("ordinal") or dim.get("time") or by == "component"),
        "categories": categories,
        "series": [{"key": m["key"], "label": m["label"], "unit": m.get("unit", ind["unit"]), "values": values[m["key"]]} for m in ind["measures"]],
        "overall": {k: _clean(overall[k]) for k in keys},
        "filters_applied": applied,
    }



def crosstab(key, by, by2, filters):
    """Two-way breakdown of an indicator's first measure (stacked bars, heatmaps)."""
    ind = CATALOG["indicators"].get(key)

    if not ind:
        raise ValueError(f"Unknown indicator '{key}'")

    for d in (by, by2):
        if d not in ind["dims"] or d == "component":
            raise ValueError(f"'{ind['label']}' cannot be broken down by '{d}'")

    table = ind["table"]
    measure_key = ind["measures"][0]["key"]
    measure = MEASURE_SQL[key][measure_key]
    where, params, applied = build_filters(table, filters)

    def dim_expr(d):
        dim = CATALOG["dims"][table][d]
        if dim.get("time"):
            return period_expr(TABLES[table]["date"], dim["time"]), None
        return DIM_SQL[table][d]

    e1, o1 = dim_expr(by)
    e2, o2 = dim_expr(by2)
    rows = query(f"SELECT {e1} AS a, {e2} AS b, {measure} AS v FROM {table} WHERE {where} GROUP BY 1, 2", params)

    def ordered(col, d, order):
        dim = CATALOG["dims"][table][d]
        values = sorted({r[col] for r in rows})
        if dim.get("time"):
            return _all_periods(values[0], values[-1], dim["time"]) if values else []
        if order:
            ranked = query(f"SELECT {DIM_SQL[table][d][0]} AS label FROM {table} WHERE {where} GROUP BY 1 ORDER BY {order}", params)
            return [r["label"] for r in ranked if r["label"] in values]
        totals = {}
        for r in rows:
            totals[r[col]] = totals.get(r[col], 0) + (r["v"] or 0)
        return sorted(values, key=lambda v: -totals[v])

    rows_order = ordered("a", by, o1)
    cols_order = ordered("b", by2, o2)
    cell = {(r["a"], r["b"]): _clean(r["v"]) for r in rows}
    fill = None if ind.get("ratio") else 0

    return {
        "indicator": {"key": key, **{k: v for k, v in ind.items() if k != "dims"}},
        "by": by, "by_label": CATALOG["dims"][table][by]["label"],
        "by2": by2, "by2_label": CATALOG["dims"][table][by2]["label"],
        "time": CATALOG["dims"][table][by].get("time"),
        "rows": rows_order, "cols": cols_order,
        "values": [[cell.get((a, b), fill) for b in cols_order] for a in rows_order],
        "unit": ind["measures"][0].get("unit", ind["unit"]),
        "filters_applied": applied,
    }
