"""
Aggregations behind the dashboard API.

Every number returned here is computed from uhai_dashboard.db with SQL. Column
names are taken verbatim from the database schema (see README for the list).
"""

from datetime import date, datetime, timedelta

from db import query, scalar
from filters import CHANNEL, PRODUCTS, RECEIVED, TABLES, build_filters, q


# ==================================================
# HELPERS
# ==================================================

def _pct(part, whole):
    return round(100.0 * part / whole, 1) if whole else None


def _round(value, digits=1):
    return round(value, digits) if value is not None else None


def _grouped(table, label_expr, filters, value_exprs=None, order="value DESC", extra_where=None):
    """
    GROUP BY one expression. value_exprs maps output key -> SQL aggregate;
    the first key is aliased `value` for ordering.
    """
    where, params, _ = build_filters(table, filters)
    value_exprs = value_exprs or {"value": "COUNT(*)"}

    if extra_where:
        where = f"{where} AND {extra_where}"

    selects = ", ".join(f"{expr} AS {q(key)}" for key, expr in value_exprs.items())

    rows = query(
        f"""
        SELECT {label_expr} AS label, {selects}
        FROM {table}
        WHERE {where}
        GROUP BY 1
        ORDER BY {order}
        """,
        params,
    )

    return rows


def _row(table, filters, value_exprs, extra_where=None):
    where, params, _ = build_filters(table, filters)

    if extra_where:
        where = f"{where} AND {extra_where}"

    selects = ", ".join(f"{expr} AS {q(key)}" for key, expr in value_exprs.items())

    return query(f"SELECT {selects} FROM {table} WHERE {where}", params)[0]


def _applied(filters):
    return {table: build_filters(table, filters)[2] for table in TABLES}


# ==================================================
# TIME BUCKETS
# ==================================================

def period_expr(date_expr, grain):
    if grain == "week":
        # Monday of the ISO week
        return f"date({date_expr}, 'weekday 0', '-6 days')"

    return f"substr({date_expr}, 1, 7)"


def _all_periods(first, last, grain):
    """Continuous list of period labels so empty periods show as gaps."""
    if not first or not last:
        return []

    periods = []

    if grain == "week":
        current = datetime.strptime(first, "%Y-%m-%d").date()
        end = datetime.strptime(last, "%Y-%m-%d").date()

        while current <= end:
            periods.append(current.isoformat())
            current += timedelta(days=7)

        return periods

    year, month = map(int, first.split("-"))
    end_year, end_month = map(int, last.split("-"))

    while (year, month) <= (end_year, end_month):
        periods.append(f"{year:04d}-{month:02d}")
        month += 1

        if month > 12:
            year, month = year + 1, 1

    return periods


def periodic(table, filters, value_exprs, grain="month", split_expr=None, fill=0):
    """
    Aggregate a table per period (optionally split by a dimension).

    Returns {"labels": [...], "rows": {split_value: {key: [values]}}}.
    """
    date_expr = TABLES[table]["date"]
    where, params, _ = build_filters(table, filters)
    period = period_expr(date_expr, grain)
    split_sql = split_expr or "'All'"

    selects = ", ".join(f"{expr} AS {q(key)}" for key, expr in value_exprs.items())

    rows = query(
        f"""
        SELECT {period} AS period, {split_sql} AS split, {selects}
        FROM {table}
        WHERE {where}
        GROUP BY 1, 2
        ORDER BY 1
        """,
        params,
    )

    labels = _all_periods(
        min((r["period"] for r in rows), default=None),
        max((r["period"] for r in rows), default=None),
        grain,
    )

    index = {label: i for i, label in enumerate(labels)}
    series = {}

    for r in rows:
        bucket = series.setdefault(
            r["split"], {key: [fill] * len(labels) for key in value_exprs}
        )

        for key in value_exprs:
            value = r[key]
            bucket[key][index[r["period"]]] = _round(value, 2) if isinstance(value, float) else value

    return {"labels": labels, "series": series}


def _monthly_records(table, filters, value_exprs):
    result = periodic(table, filters, value_exprs, "month")
    data = result["series"].get("All", {key: [] for key in value_exprs})

    return [
        {"period": label, **{key: data[key][i] for key in value_exprs}}
        for i, label in enumerate(result["labels"])
    ]


# ==================================================
# META
# ==================================================

def meta():
    groups = [
        r["g"]
        for r in query(
            """
            SELECT blood_group AS g FROM sourcing
            UNION SELECT blood_group FROM transfusions
            UNION SELECT blood_groups FROM processing
            ORDER BY 1
            """
        )
    ]

    facilities = [
        r["f"]
        for r in query(
            f"SELECT DISTINCT {q('recipient_facility')} AS f FROM distributions ORDER BY 1"
        )
    ]

    ranges = {}

    for table, dims in TABLES.items():
        if dims["date"]:
            row = query(f"SELECT MIN({dims['date']}) AS lo, MAX({dims['date']}) AS hi FROM {table}")[0]
            ranges[table] = {"min": row["lo"], "max": row["hi"]}
        else:
            ranges[table] = None

    all_dates = [v for r in ranges.values() if r for v in (r["min"], r["max"])]

    return {
        "today": date.today().isoformat(),
        "options": {
            "blood_group": groups,
            "product": PRODUCTS,
            "facility": facilities,
            "donor_type": [r["v"] for r in query(f"SELECT DISTINCT {q('voluntary/replacement')} AS v FROM sourcing ORDER BY 1")],
            "channel": [r["v"] for r in query(f"SELECT DISTINCT {CHANNEL} AS v FROM processing ORDER BY 1")],
        },
        "date_range": {"min": min(all_dates), "max": max(all_dates)},
        "table_date_ranges": ranges,
        "date_fields": {
            "sourcing": "date",
            "processing": None,
            "distributions": "date_blood_ordered",
            "transfusions": "date_blood_first_ordered",
        },
    }


# ==================================================
# SOURCING
# ==================================================

WEEKDAY_ORDER = "CASE day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END"


def sourcing_summary(filters):
    vol = q("volume_donated_(ml)")
    vr = q("voluntary/replacement")

    k = _row(
        "sourcing",
        filters,
        {
            "donations": "COUNT(*)",
            "volume_ml": f"SUM({vol})",
            "voluntary": f"SUM(CASE WHEN {vr} = 'Voluntary' THEN 1 ELSE 0 END)",
            "female": "SUM(CASE WHEN sex = 'Female' THEN 1 ELSE 0 END)",
            "avg_age": "AVG(age)",
            "days": "COUNT(DISTINCT substr(date, 1, 10))",
            "first": "MIN(substr(date, 1, 10))",
            "last": "MAX(substr(date, 1, 10))",
        },
    )

    donations = k["donations"] or 0

    return {
        "kpis": {
            "donations": donations,
            "volume_l": _round((k["volume_ml"] or 0) / 1000.0),
            "voluntary_pct": _pct(k["voluntary"] or 0, donations),
            "female_pct": _pct(k["female"] or 0, donations),
            "avg_age": _round(k["avg_age"]),
            "days_with_donations": k["days"],
            "avg_per_day": _round(donations / k["days"]) if k["days"] else None,
            "first_date": k["first"],
            "last_date": k["last"],
        },
        "monthly": _monthly_records(
            "sourcing",
            filters,
            {
                "donations": "COUNT(*)",
                "volume_l": f"SUM({vol}) / 1000.0",
                "voluntary": f"SUM(CASE WHEN {vr} = 'Voluntary' THEN 1 ELSE 0 END)",
                "replacement": f"SUM(CASE WHEN {vr} <> 'Voluntary' THEN 1 ELSE 0 END)",
            },
        ),
        "by_type": _grouped("sourcing", vr, filters),
        "by_product": _grouped("sourcing", q("blood_product"), filters),
        "by_sex": _grouped("sourcing", "sex", filters),
        "by_age_group": _grouped("sourcing", q("donor_age_group"), filters, order="label"),
        "by_weekday": _grouped("sourcing", "day_of_week", filters, order=f"MIN({WEEKDAY_ORDER})"),
        "by_blood_group": _grouped("sourcing", "blood_group", filters),
    }


# ==================================================
# PROCESSING
# ==================================================

COMPONENT_COLUMNS = {
    "Red Cells": "prbc_(units)",
    "Plasma": "ffp_(units)",
    "Platelets": "platelets_(units)",
    "Cryoprecipitate": "cryoprecipitate_(units)",
}

SCREENING = q("screening_failure_rate_(had_tti's)")


def processing_components(filters):
    """Component units produced, per component column (all components)."""
    names = list(COMPONENT_COLUMNS)

    row = _row(
        "processing",
        filters,
        {name: f"SUM({q(COMPONENT_COLUMNS[name])})" for name in names},
    )

    return [{"label": name, "value": int(row[name] or 0)} for name in names]


def processing_summary(filters):
    k = _row(
        "processing",
        filters,
        {
            "received": "COUNT(*)",
            "passed": f"SUM(CASE WHEN {SCREENING} = 'Non-Reactive (Passed)' THEN 1 ELSE 0 END)",
            "discarded": "SUM(CASE WHEN is_discarded = 'Yes' THEN 1 ELSE 0 END)",
            "discarded_non_tti": "SUM(CASE WHEN is_discarded = 'Yes' AND reason_for_discard <> 'Reactive' THEN 1 ELSE 0 END)",
            "volume_ml": f"SUM({q('total_volume_processed_(ml)')})",
        },
    )

    received = k["received"] or 0
    passed = k["passed"] or 0
    components = processing_components(filters)

    return {
        "kpis": {
            "units_received": received,
            "passed_screening": passed,
            "reactive": received - passed,
            "reactive_pct": _pct(received - passed, received),
            "discarded": k["discarded"] or 0,
            "discard_pct": _pct(k["discarded"] or 0, received),
            "wastage_non_tti": k["discarded_non_tti"] or 0,
            "wastage_non_tti_pct": _pct(k["discarded_non_tti"] or 0, received),
            "volume_processed_l": _round((k["volume_ml"] or 0) / 1000.0),
            "components_total": sum(c["value"] for c in components),
        },
        "by_tti": _grouped(
            "processing",
            f"replace({SCREENING}, 'Reactive: ', '')",
            filters,
            extra_where=f"{SCREENING} <> 'Non-Reactive (Passed)'",
        ),
        "by_discard_reason": _grouped(
            "processing", "reason_for_discard", filters, extra_where="is_discarded = 'Yes'"
        ),
        "components": components,
        "by_channel": _grouped(
            "processing",
            CHANNEL,
            filters,
            {"value": "COUNT(*)", "discarded": "SUM(CASE WHEN is_discarded = 'Yes' THEN 1 ELSE 0 END)"},
        ),
        "by_intake": _grouped("processing", RECEIVED, filters),
        "by_blood_group": _grouped(
            "processing",
            "blood_groups",
            filters,
            {"value": "COUNT(*)", "discarded": "SUM(CASE WHEN is_discarded = 'Yes' THEN 1 ELSE 0 END)"},
        ),
    }


# ==================================================
# DISTRIBUTIONS
# ==================================================

def distribution_summary(filters):
    qty = q("quantity_(units)")
    ml = q("amount_distributed_(ml)")
    tat = q("turnaround_time_(days)")
    status = q("transfusion_outcome_/_status")

    k = _row(
        "distributions",
        filters,
        {
            "orders": "COUNT(*)",
            "units": f"SUM({qty})",
            "volume_ml": f"SUM({ml})",
            "facilities": f"COUNT(DISTINCT {q('recipient_facility')})",
            "avg_tat": f"AVG({tat})",
            "same_day": f"SUM(CASE WHEN {tat} = 0 THEN 1 ELSE 0 END)",
            "returned": f"SUM(CASE WHEN {status} = 'Returned Unused' THEN 1 ELSE 0 END)",
        },
    )

    orders = k["orders"] or 0

    return {
        "kpis": {
            "orders": orders,
            "units": k["units"] or 0,
            "volume_l": _round((k["volume_ml"] or 0) / 1000.0),
            "facilities": k["facilities"] or 0,
            "avg_turnaround_days": _round(k["avg_tat"], 2),
            "same_day_pct": _pct(k["same_day"] or 0, orders),
            "returned_pct": _pct(k["returned"] or 0, orders),
        },
        "monthly": _monthly_records(
            "distributions", filters, {"units": f"SUM({qty})", "orders": "COUNT(*)"}
        ),
        "by_facility": _grouped(
            "distributions",
            q("recipient_facility"),
            filters,
            {
                "value": f"SUM({qty})", "orders": "COUNT(*)", "avg_tat": f"ROUND(AVG({tat}), 2)",
                "volume_l": f"ROUND(SUM({ml}) / 1000.0, 1)",
                "returned_pct": f"ROUND(100.0 * SUM(CASE WHEN {status} = 'Returned Unused' THEN 1 ELSE 0 END) / COUNT(*), 1)",
            },
        ),
        "by_product": _grouped("distributions", q("type_of_product"), filters, {"value": f"SUM({qty})"}),
        "by_status": _grouped("distributions", status, filters),
    }


# ==================================================
# TRANSFUSIONS
# ==================================================

AGE_ORDER = "CASE WHEN age_group LIKE '<%' THEN 0 ELSE CAST(age_group AS INTEGER) END"


def transfusion_summary(filters):
    days = q("time_to_receipt_of_transfusion_(days)")

    k = _row(
        "transfusions",
        filters,
        {
            "requests": "COUNT(*)",
            "requested": "SUM(quantity_requested)",
            "given": "SUM(quantity_given)",
            "short": "SUM(volume_shortfall)",
            "fulfilled": "SUM(CASE WHEN fulfilment = 'Fulfilled' THEN 1 ELSE 0 END)",
            "unfulfilled": "SUM(CASE WHEN fulfilment = 'Unfulfilled' THEN 1 ELSE 0 END)",
            "avg_hb": "AVG(hb_level)",
            "reactions": "SUM(CASE WHEN had_reaction = 'Yes' THEN 1 ELSE 0 END)",
            "avg_days": f"AVG({days})",
            "paediatric": "SUM(CASE WHEN age < 18 THEN 1 ELSE 0 END)",
        },
    )

    requests = k["requests"] or 0
    requested = k["requested"] or 0
    given = k["given"] or 0

    return {
        "kpis": {
            "requests": requests,
            "units_requested": requested,
            "units_given": _round(given),
            "units_short": _round(k["short"] or 0),
            "fulfilment_pct": _pct(given, requested),
            "fully_fulfilled_pct": _pct(k["fulfilled"] or 0, requests),
            "unfulfilled_pct": _pct(k["unfulfilled"] or 0, requests),
            "avg_hb": _round(k["avg_hb"]),
            "reaction_pct": _pct(k["reactions"] or 0, requests),
            "avg_days_to_receipt": _round(k["avg_days"], 2),
            "paediatric_pct": _pct(k["paediatric"] or 0, requests),
        },
        "monthly": _monthly_records(
            "transfusions",
            filters,
            {"requested": "SUM(quantity_requested)", "given": "SUM(quantity_given)", "requests": "COUNT(*)"},
        ),
        "by_status": _grouped("transfusions", "fulfilment", filters),
        "by_reason": _grouped(
            "transfusions",
            "reason_for_transfusion",
            filters,
            {"value": "SUM(quantity_requested)", "given": "SUM(quantity_given)", "requests": "COUNT(*)"},
        ),
        "by_product": _grouped(
            "transfusions",
            "blood_product_requested",
            filters,
            {"value": "SUM(quantity_requested)", "given": "SUM(quantity_given)"},
        ),
        "by_age_group": _grouped("transfusions", "age_group", filters, order=f"MIN({AGE_ORDER})"),
        "by_outcome": _grouped("transfusions", "transfusion_outcomes", filters),
        "by_sex": _grouped("transfusions", "sex", filters),
    }


# ==================================================
# BLOOD GROUPS
# ==================================================

def blood_group_summary(filters):
    merged = {}

    def put(rows, mapping):
        for r in rows:
            entry = merged.setdefault(r["label"], {"group": r["label"]})

            for src, dst in mapping.items():
                entry[dst] = r[src]

    put(_grouped("sourcing", "blood_group", filters), {"value": "donations"})

    put(
        _grouped(
            "processing",
            "blood_groups",
            filters,
            {"value": "COUNT(*)", "discarded": "SUM(CASE WHEN is_discarded = 'Yes' THEN 1 ELSE 0 END)"},
        ),
        {"value": "processed", "discarded": "discarded"},
    )

    put(
        _grouped(
            "transfusions",
            "blood_group",
            filters,
            {
                "value": "SUM(quantity_requested)",
                "given": "SUM(quantity_given)",
                "short": "SUM(volume_shortfall)",
                "requests": "COUNT(*)",
                "unfulfilled": "SUM(CASE WHEN fulfilment = 'Unfulfilled' THEN 1 ELSE 0 END)",
            },
        ),
        {
            "value": "units_requested",
            "given": "units_given",
            "short": "units_short",
            "requests": "requests",
            "unfulfilled": "unfulfilled_requests",
        },
    )

    keys = ["donations", "processed", "discarded", "units_requested", "units_given", "units_short", "requests", "unfulfilled_requests"]

    rows = []

    for group in sorted(merged):
        entry = merged[group]
        rows.append({"group": group, **{key: entry.get(key, 0) or 0 for key in keys}})

    return rows


# ==================================================
# DASHBOARD (one call per filter change)
# ==================================================

def dashboard(filters):
    return {
        "filters_applied": _applied(filters),
        "sourcing": sourcing_summary(filters),
        "processing": processing_summary(filters),
        "distributions": distribution_summary(filters),
        "transfusions": transfusion_summary(filters),
        "blood_groups": blood_group_summary(filters),
    }


# ==================================================
# OVER TIME
# ==================================================

METRICS = {
    "donations": {
        "table": "sourcing", "label": "Donations", "unit": "donations",
        "expr": "COUNT(*)",
    },
    "volume_donated_l": {
        "table": "sourcing", "label": "Volume donated", "unit": "litres",
        "expr": f"SUM({q('volume_donated_(ml)')}) / 1000.0",
    },
    "voluntary_share": {
        "table": "sourcing", "label": "Voluntary donor share", "unit": "%", "ratio": True,
        "expr": f"100.0 * SUM(CASE WHEN {q('voluntary/replacement')} = 'Voluntary' THEN 1 ELSE 0 END) / COUNT(*)",
    },
    "units_distributed": {
        "table": "distributions", "label": "Units distributed", "unit": "units",
        "expr": f"SUM({q('quantity_(units)')})",
    },
    "distribution_orders": {
        "table": "distributions", "label": "Distribution orders", "unit": "orders",
        "expr": "COUNT(*)",
    },
    "mean_turnaround_days": {
        "table": "distributions", "label": "Mean order-to-receipt time", "unit": "days", "ratio": True,
        "expr": f"AVG({q('turnaround_time_(days)')})",
    },
    "transfusion_requests": {
        "table": "transfusions", "label": "Transfusion requests", "unit": "requests",
        "expr": "COUNT(*)",
    },
    "units_requested": {
        "table": "transfusions", "label": "Units requested", "unit": "units",
        "expr": "SUM(quantity_requested)",
    },
    "units_given": {
        "table": "transfusions", "label": "Units given", "unit": "units",
        "expr": "SUM(quantity_given)",
    },
    "units_short": {
        "table": "transfusions", "label": "Unmet units (shortfall)", "unit": "units",
        "expr": "SUM(volume_shortfall)",
    },
    "fulfilment_rate": {
        "table": "transfusions", "label": "Fulfilment rate", "unit": "%", "ratio": True,
        "expr": "100.0 * SUM(quantity_given) / SUM(quantity_requested)",
    },
}


def metric_catalogue():
    catalogue = []

    for key, m in METRICS.items():
        dims = TABLES[m["table"]]
        catalogue.append({
            "key": key,
            "label": m["label"],
            "unit": m["unit"],
            "table": m["table"],
            "ratio": bool(m.get("ratio")),
            "splits": ["none"] + [d for d in ("blood_group", "product", "facility") if dims[d]],
        })

    return catalogue


def timeseries(metric_key, grain, split, filters):
    if metric_key not in METRICS:
        raise ValueError(f"Unknown metric '{metric_key}'")

    if grain not in ("month", "week"):
        raise ValueError("grain must be 'month' or 'week'")

    m = METRICS[metric_key]
    table = m["table"]
    split_expr = None

    if split and split != "none":
        split_expr = TABLES[table].get(split)

        if not split_expr:
            raise ValueError(f"{table} cannot be split by {split}")

    result = periodic(
        table,
        filters,
        {"value": m["expr"]},
        grain,
        split_expr,
        fill=None if m.get("ratio") else 0,
    )

    series = [
        {"name": name, "values": data["value"]}
        for name, data in sorted(result["series"].items(), key=lambda kv: str(kv[0]))
    ]

    return {
        "metric": {key: m.get(key) for key in ("table", "label", "unit")} | {"key": metric_key, "ratio": bool(m.get("ratio"))},
        "grain": grain,
        "split": split or "none",
        "labels": result["labels"],
        "series": series,
        "filters_applied": build_filters(table, filters)[2],
    }


# ==================================================
# DATA QUALITY
# ==================================================

PLACEHOLDERS = ("-", "None", "N/A", "NA", "null", "Not Transfused")


def _column_profile(table):
    columns = query(f"PRAGMA table_info({table})")
    total = scalar(f"SELECT COUNT(*) FROM {table}")
    marks = ",".join(f"'{p}'" for p in PLACEHOLDERS)
    profile = []

    for col in columns:
        name = q(col["name"])

        row = query(
            f"""
            SELECT
                SUM(CASE WHEN {name} IS NULL OR trim(CAST({name} AS TEXT)) = '' THEN 1 ELSE 0 END) AS missing,
                SUM(CASE WHEN CAST({name} AS TEXT) IN ({marks}) THEN 1 ELSE 0 END) AS placeholder,
                SUM(CASE WHEN typeof({name}) = 'text' AND CAST({name} AS TEXT) GLOB '[0-9]*,[0-9]*' THEN 1 ELSE 0 END) AS numeric_text,
                COUNT(DISTINCT {name}) AS distinct_values
            FROM {table}
            """
        )[0]

        profile.append({
            "name": col["name"],
            "type": col["type"],
            "missing": row["missing"] or 0,
            "placeholder": row["placeholder"] or 0,
            "numeric_text": row["numeric_text"] or 0,
            "distinct": row["distinct_values"],
            "complete_pct": _pct(total - (row["missing"] or 0), total),
        })

    return total, profile


def _check(table, name, failing, total, note, severity="warn"):
    if failing is None:
        status = "info"
    elif failing == 0:
        status = "pass"
    else:
        status = severity

    return {"table": table, "check": name, "failing": failing, "total": total, "status": status, "note": note}


def quality():
    today = date.today().isoformat()
    tables = []

    for table, dims in TABLES.items():
        total, profile = _column_profile(table)
        coverage = None

        if dims["date"]:
            d = dims["date"]
            row = query(
                f"""
                SELECT MIN({d}) AS lo, MAX({d}) AS hi, COUNT(DISTINCT {d}) AS days,
                       SUM(CASE WHEN {d} > ? THEN 1 ELSE 0 END) AS future
                FROM {table}
                """,
                (today,),
            )[0]

            span = (
                datetime.strptime(row["hi"], "%Y-%m-%d") - datetime.strptime(row["lo"], "%Y-%m-%d")
            ).days + 1

            months = query(
                f"SELECT substr({d}, 1, 7) AS month, COUNT(*) AS records, COUNT(DISTINCT {d}) AS days FROM {table} GROUP BY 1 ORDER BY 1"
            )

            coverage = {
                "field": {"sourcing": "date", "distributions": "date_blood_ordered", "transfusions": "date_blood_first_ordered"}[table],
                "min": row["lo"],
                "max": row["hi"],
                "span_days": span,
                "distinct_days": row["days"],
                "days_without_records": span - row["days"],
                "future_dated": row["future"],
                "months": months,
            }

        complete_cells = sum(total - c["missing"] for c in profile)

        tables.append({
            "name": table,
            "rows": total,
            "columns": len(profile),
            "completeness_pct": _pct(complete_cells, total * len(profile)),
            "profile": profile,
            "coverage": coverage,
            "filters_supported": {k: dims[k] is not None for k in ("date", "blood_group", "product", "facility")},
        })

    n_tx = scalar("SELECT COUNT(*) FROM transfusions")
    n_dist = scalar("SELECT COUNT(*) FROM distributions")
    n_src = scalar("SELECT COUNT(*) FROM sourcing")
    n_proc = scalar("SELECT COUNT(*) FROM processing")

    checks = [
        _check("transfusions", "volume_shortfall = quantity_requested − quantity_given",
               scalar("SELECT COUNT(*) FROM transfusions WHERE abs(quantity_requested - quantity_given - volume_shortfall) > 0.001"),
               n_tx, "Shortfall is derivable; confirm whether it is stored or computed upstream."),
        _check("transfusions", "quantity_given ≤ quantity_requested",
               scalar("SELECT COUNT(*) FROM transfusions WHERE quantity_given > quantity_requested"),
               n_tx, "Over-issue would indicate a capture error.", "fail"),
        _check("transfusions", "transfused unit group matches patient group (when transfused)",
               scalar(f"SELECT COUNT(*) FROM transfusions WHERE {q('transfused_unit_blood_group')} NOT IN (blood_group, 'Not Transfused')"),
               n_tx, "Mismatches may be valid compatible substitutions (e.g. O− to A+); needs a clinical rule.", "info"),
        _check("transfusions", "date_blood_received present when units were given",
               scalar("SELECT COUNT(*) FROM transfusions WHERE quantity_given > 0 AND date_blood_received IS NULL"),
               n_tx, "Missing receipt dates hide turnaround for fulfilled requests.", "fail"),
        _check("transfusions", "date_blood_received ≥ date_blood_first_ordered",
               scalar("SELECT COUNT(*) FROM transfusions WHERE date_blood_received IS NOT NULL AND substr(date_blood_received, 1, 10) < date_blood_first_ordered"),
               n_tx, "Receipt before order is impossible.", "fail"),
        _check("transfusions", "millilitre columns stored as numbers",
               scalar(f"SELECT COUNT(*) FROM transfusions WHERE {q('milliliters_of_blood_ordered')} GLOB '*,*' OR {q('milliliters_of_blood_transfused')} GLOB '*,*'"),
               n_tx, "Values like '1,350' are TEXT with thousands separators; cast before summing."),
        _check("distributions", "date_blood_received ≥ date_blood_ordered",
               scalar("SELECT COUNT(*) FROM distributions WHERE date_blood_received < date_blood_ordered"),
               n_dist, "Receipt before order is impossible.", "fail"),
        _check("distributions", "turnaround_time_(days) matches the two dates",
               scalar(f"SELECT COUNT(*) FROM distributions WHERE CAST(julianday(date_blood_received) - julianday(date_blood_ordered) AS INTEGER) <> {q('turnaround_time_(days)')}"),
               n_dist, "Stored turnaround should equal received − ordered."),
        _check("sourcing", "age agrees with date_of_birth and donation date (±1 year)",
               scalar("SELECT COUNT(*) FROM sourcing WHERE abs((julianday(date) - julianday(date_of_birth)) / 365.25 - age) > 1"),
               n_src, "Age is derivable from date of birth."),
        _check("sourcing", "repeat donors identifiable",
               None, n_src,
               f"patient_id is unique on every row ({scalar('SELECT COUNT(DISTINCT patient_id) FROM sourcing')} IDs / {n_src} rows), so repeat donation and donor retention cannot be measured."),
        _check("processing", "discarded units yield no components",
               scalar(f"SELECT COUNT(*) FROM processing WHERE is_discarded = 'Yes' AND ({q('prbc_(units)')} + {q('ffp_(units)')} + {q('platelets_(units)')} + {q('cryoprecipitate_(units)')}) > 0"),
               n_proc, "A discarded donation should not produce components.", "fail"),
        _check("processing", "rows linkable to a date",
               n_proc, n_proc,
               "processing has no date column, so it cannot be trended, date-filtered or forecast.", "fail"),
    ]

    for t in tables:
        if t["coverage"] and t["coverage"]["future_dated"]:
            checks.append(_check(
                t["name"], f"no records dated after today ({today})",
                t["coverage"]["future_dated"], t["rows"],
                f"Records dated up to {t['coverage']['max']} lie in the future relative to the server clock.", "fail"))

    schema_gaps = [
        {"table": "sourcing", "missing": "facility / blood-drive site / drive ID", "impact": "Blood-drive activity cannot be attributed to a drive or site."},
        {"table": "processing", "missing": "date, donation ID, storage location, temperature", "impact": "No trend, no link to sourcing, no storage/cold-chain view."},
        {"table": "distributions", "missing": "blood group, order ID", "impact": "Distribution cannot be split by blood group or linked to transfusions."},
        {"table": "transfusions", "missing": "facility / ward", "impact": "Demand cannot be split by facility (patient_id prefix suggests MTRH only)."},
    ]

    return {"today": today, "tables": tables, "checks": checks, "schema_gaps": schema_gaps}
