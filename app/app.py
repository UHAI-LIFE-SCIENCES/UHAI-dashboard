import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

import analytics
import explore
import contact
import site_content
from db import DB_PATH, query
from filters import TABLES, build_filters, read_filters, support_matrix


app = Flask(__name__)

# Configuration comes from the environment; nothing secret is stored here.
API_BASE = os.environ.get("UHAI_API_BASE", "")          # "" = same origin as the page
DATA_SOURCE = os.environ.get("UHAI_DATA_SOURCE", "api")  # "api" or "mock"
MAX_ROWS = int(os.environ.get("UHAI_MAX_ROWS", "1000"))


# ==================================================
# HOME PAGE
# ==================================================

def _logo(name, fallback):
    """Prefer the official logo PNG when it has been added to static/img."""
    official = Path(app.static_folder) / "img" / name
    return f"img/{name}" if official.exists() else f"img/{fallback}"


@app.context_processor
def brand_assets():

    return {
        "logo": _logo("uhai-logo.png", "uhai-logo.svg"),
        "favicon": _logo("uhai-logo.png", "uhai-mark.svg"),
    }


# ==================================================
# PUBLIC WEBSITE
# ==================================================

SITE_PAGES = {
    "home": ("/", "site/home.html", None),
    "about": ("/about", "site/about.html", "About UHAI"),
    "why": ("/why-uhai", "site/why.html", "Why UHAI"),
    "faqs": ("/faqs", "site/faqs.html", "FAQs"),
    "contact": ("/contact", "site/contact.html", "Contact"),
}


def _site_view(key, template, title):

    def view():
        return render_template(
            template,
            page=key,
            page_title=title,
            c=site_content,
            contact_details=site_content.contact_details(),
        )

    view.__name__ = f"site_{key}"
    return view


for _key, (_path, _template, _title) in SITE_PAGES.items():
    app.add_url_rule(_path, endpoint=f"site_{_key}", view_func=_site_view(_key, _template, _title))


@app.route("/api/contact", methods=["POST"])
def contact_submit():

    form = request.get_json(silent=True) or request.form

    # Honeypot: real visitors never fill this hidden field.
    if form.get("website"):
        return jsonify({"ok": False, "errors": {"form": "Submission rejected."}}), 400

    data, errors = contact.validate(form)

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    reference = contact.save(data)

    return jsonify({
        "ok": True,
        "reference": reference,
        "delivered": contact.notify(data),
    })


# ==================================================
# DASHBOARD
# ==================================================

@app.route("/dashboard")
def dashboard_page():

    return render_template(
        "index.html",
        api_base=API_BASE,
        data_source=DATA_SOURCE,
    )


# ==================================================
# ERRORS AS JSON
# ==================================================

@app.errorhandler(ValueError)
def bad_request(error):

    return jsonify({"error": str(error)}), 400


@app.errorhandler(Exception)
def server_error(error):

    if isinstance(error, HTTPException):
        return error

    app.logger.exception(error)

    return jsonify({"error": f"{type(error).__name__}: {error}"}), 500


# ==================================================
# API PING
# ==================================================

@app.route("/api/ping")
def ping():

    results = query("""
        SELECT
            COUNT(*) AS total_records
        FROM sourcing
    """)

    return jsonify(results[0] | {"database": DB_PATH.name})


# ==================================================
# DATABASE OVERVIEW
# ==================================================

@app.route("/api/summary")
def summary():

    return jsonify({
        table: query(f"SELECT COUNT(*) AS total FROM {table}")[0]["total"]
        for table in TABLES
    })


# ==================================================
# DASHBOARD CONTRACT
# ==================================================

@app.route("/api/meta")
def meta():

    return jsonify(
        analytics.meta()
        | {"filter_support": support_matrix(), "metrics": analytics.metric_catalogue()}
    )


@app.route("/api/dashboard")
def dashboard():

    return jsonify(analytics.dashboard(read_filters()))


@app.route("/api/timeseries")
def timeseries():

    return jsonify(analytics.timeseries(
        request.args.get("metric", "donations"),
        request.args.get("grain", "month"),
        request.args.get("split", "none"),
        read_filters(),
    ))


@app.route("/api/explore")
def explore_indicator():

    return jsonify(explore.explore(
        request.args.get("indicator", "donations"),
        request.args.get("by"),
        read_filters(),
    ))


@app.route("/api/quality")
def quality():

    return jsonify(analytics.quality())


# ==================================================
# RAW TABLES (filtered, capped by ?limit=)
# ==================================================

# Direct identifiers are withheld from record-level responses unless the caller
# sends the key configured in UHAI_RAW_API_KEY (header X-API-Key).
IDENTIFIER_COLUMNS = {"patient_id", "dob", "date_of_birth"}
RAW_API_KEY = os.environ.get("UHAI_RAW_API_KEY")


def _rows(table):

    where, params, applied = build_filters(table)

    authorised = bool(RAW_API_KEY) and request.headers.get("X-API-Key") == RAW_API_KEY

    limit = min(int(request.args.get("limit", MAX_ROWS)), MAX_ROWS)

    sql = f"""
        SELECT *
        FROM {table}
        WHERE {where}
        LIMIT ?
    """

    results = query(
        sql,
        params + [limit]
    )

    if not authorised:
        results = [{k: v for k, v in row.items() if k not in IDENTIFIER_COLUMNS} for row in results]

    return jsonify(results)


@app.route("/api/sourcing")
def get_sourcing():

    return _rows("sourcing")


@app.route("/api/processing")
def get_processing():

    return _rows("processing")


@app.route("/api/distributions")
def get_distributions():

    return _rows("distributions")


@app.route("/api/transfusions")
def get_transfusions():

    return _rows("transfusions")


# ==================================================
# TRENDS (kept for existing clients)
# ==================================================

def _trend(table):

    date_expr = TABLES[table]["date"]

    where, params, _ = build_filters(table)

    return query(f"""
        SELECT
            {date_expr} AS date,
            COUNT(*) AS records
        FROM {table}
        WHERE {where}
        GROUP BY 1
        ORDER BY 1
    """, params)


@app.route("/api/sourcing/trend")
def sourcing_trend():

    return jsonify(_trend("sourcing"))


@app.route("/api/transfusions/trend")
def transfusion_trend():

    return jsonify(_trend("transfusions"))


# ==================================================
# BY BLOOD GROUP (kept for existing clients)
# ==================================================

def _by_group(table, column):

    where, params, _ = build_filters(table)

    return query(f"""
        SELECT
            {column} AS blood_group,
            COUNT(*) AS records
        FROM {table}
        WHERE {where}
        GROUP BY 1
        ORDER BY records DESC
    """, params)


@app.route("/api/sourcing/by-blood-group")
def sourcing_by_blood_group():

    return jsonify(_by_group("sourcing", "blood_group"))


@app.route("/api/transfusions/by-blood-group")
def transfusions_by_blood_group():

    return jsonify(_by_group("transfusions", "blood_group"))


# ==================================================
# RUN FLASK
# ==================================================

if __name__ == "__main__":

    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
    )
