# UHAI Life Sciences: website and Blood Intelligence dashboard

One Flask app serves two things:

- **Public website** at `/`: Home, `/about`, `/why-uhai`, `/faqs`, `/contact`. It explains UHAI's mission and work, with real blood-drive photography.
- **Blood Intelligence dashboard** at `/dashboard`: interactive views of sourcing, processing, distribution (including a facility map) and transfusion demand, read from `uhai_dashboard.db`.

> **All dashboard data is illustrative.** The 40,000 records in `uhai_dashboard.db` are synthetic. The Forecasting tab is a **prototype**, not a validated model.

## Run it

```bash
pip install -r requirements.txt
python app/app.py
```

Open **http://localhost:5000** for the website, or **http://localhost:5000/dashboard** for the dashboard. Old links like `/#/overview` redirect to `/dashboard#/overview`.

## Public website

| File | Purpose |
|---|---|
| `app/site_content.py` | **All website wording, figures, FAQs, team and photo captions, each traced to a source document.** Edit this, not the templates. |
| `app/templates/site/*.html` | `base` (nav and footer), `home`, `about`, `why`, `faqs`, `contact`, `_macros` (photo, gallery tile, lightbox) |
| `app/static/css/site.css`, `app/static/js/site.js` | Styles and interactions: mobile menu, scroll reveal, lightbox, accordion, contact form. No libraries. |
| `app/static/img/photos/` | The five supplied photos, optimised at 1600 px and 800 px (1.6 MB total) |
| `app/contact.py` | Contact-form validation and storage |

**Contact form.** `POST /api/contact` validates the submission and saves it to `contact_messages.db`, a separate, writable SQLite file. **No email is sent yet.** The success message says so, rather than claiming the team was notified. To deliver messages, implement `contact.notify()` (for example SMTP with credentials from environment variables). Until then, read the messages with `sqlite3 contact_messages.db "select * from messages"`.

**Contact details** (email, phone, social links) are not in any supplied document, so none are shown. Set them as environment variables and they appear on the Contact page: `UHAI_CONTACT_EMAIL`, `UHAI_CONTACT_PHONE`, `UHAI_INSTAGRAM_URL`, `UHAI_LINKEDIN_URL`.

Motion respects `prefers-reduced-motion`. Every control works with the keyboard, and pages fit a 390 px phone screen without horizontal scrolling.

## Dashboard: UHAI Blood Insights (`/dashboard`)

**Layout:** a compact header (logo, title, an "Illustrative data" badge, the data-source badge, and a link back to the website). Below it, five sections (**Overview, Sourcing, Processing, Distribution, Transfusions**) plus a small **More** menu (Forecast, a prototype; Data quality & definitions). A filter bar then shows only the filters the section's data supports.

**Overview:** a one-sentence summary, four KPIs (donations recorded, units distributed, units requested, fulfilment rate), one main chart (units requested vs given, donations, or units distributed, by month or week) and two supporting charts (blood-group share of donations vs demand; units distributed by product).

**Sections:** each has four summary figures and one GLOBOCAN-style **explorer**:
- **Control panel:** indicator, Compare by, Number / % of total, sort, Reset view.
- **Chart-type rail:** bar, line, pie, scatter and map. A type the data can't support is disabled, and its tooltip explains why (for example, no line chart without dates, or no pie for rates or more than 6 categories).
- **Graphic | Table** tabs and CSV **Download**.
- **Click to select** a bar, slice, point or facility to see its value and share.
- Loading, empty ("No records match these filters", with a reset button) and error (with retry) states.

**Indicators** are defined once in `static/data/indicators.json` (labels, units, definitions, allowed breakdowns). The SQL behind them is in `app/explore.py`, served at `GET /api/explore?indicator=&by=` with the usual filters. Every response is aggregated, so no record-level or identifying data leaves this endpoint.

| Section | Indicators | Breakdowns |
|---|---|---|
| Sourcing | Donations recorded, volume donated, voluntary share | month, week, blood group, collection type, donor type, sex, age group, weekday |
| Processing | Units received, components produced, reactive TTI screens (share), units discarded (share) | collection channel, blood group, screening result, discard reason, component. **No dates** |
| Distribution | Units distributed, orders, mean order-to-receipt time, units vs % returned (scatter) | month, week, recipient facility (**map**), product, status, turnaround |
| Transfusions | Units requested vs given, requests, fulfilment rate, mean Hb, mean Hb vs fulfilment (scatter) | month, week, blood group, product, reason, fulfilment, age group, sex, outcome |

**Filters:** period, blood group, product and recipient facility, with **More filters** for donor type (voluntary or replacement; sourcing) and collection channel (in-house or mobile; processing). Active filters appear as removable chips; a filter the current section can't use is shown as "(not used here)". **Reset filters** clears them all. Filters are kept in the URL, so views can be shared.

**Design:** `static/css/uhai-base.css` holds the colour tokens, fonts and buttons shared by the website and the dashboard; `dashboard.css` builds on it. Chart colours follow the entity (a blood group or product keeps the same colour everywhere), and the palette was checked for colour-vision deficiency. Reduced-motion preferences turn chart animation off.

**Privacy:** the raw `/api/<table>` endpoints no longer return `patient_id`, `dob` or `date_of_birth` unless the request sends `X-API-Key` matching `UHAI_RAW_API_KEY`.

## Facility map (Distribution → Compare by recipient facility → map icon)

Recipient facilities are drawn with Leaflet 1.9.4 on OpenStreetMap tiles, sized by the selected indicator, and follow the active filters.

The database stores facility **names only**. Coordinates come from `app/static/data/facility_locations.json`, which holds **approximate town-level** positions that I added, and the page says so. Replace them with surveyed coordinates (for example from the Kenya Master Health Facility List). For production traffic, use a tile provider with a usage agreement instead of the public OpenStreetMap tile servers.

### Environment variables (all optional, no secrets)

| Variable | Default | Purpose |
|---|---|---|
| `UHAI_DB_PATH` | `./uhai_dashboard.db` | Database file (opened read-only) |
| `UHAI_DATA_SOURCE` | `api` | `api` or `mock` (the frontend data source) |
| `UHAI_API_BASE` | `""` (same origin) | API base URL if the API is hosted elsewhere |
| `UHAI_MAX_ROWS` | `1000` | Row cap for the raw `/api/<table>` endpoints |
| `UHAI_RAW_API_KEY` | unset | If set, requests with a matching `X-API-Key` header get identifier columns in raw rows |
| `UHAI_CONTACT_DB` | `./contact_messages.db` | Where contact-form messages are stored |
| `UHAI_CONTACT_EMAIL` / `_PHONE`, `UHAI_INSTAGRAM_URL` / `UHAI_LINKEDIN_URL` | unset | Verified contact details for the Contact page |
| `HOST` / `PORT` / `FLASK_DEBUG` | `127.0.0.1` / `5000` / `0` | Server settings |

To force mock data in the browser without restarting, add `?source=mock` to the URL.

## Architecture

```
app/
  app.py              Flask routes (existing API kept, new endpoints added)
  db.py               SQLite access (read-only)
  filters.py          Maps filters to each table's real columns
  analytics.py        KPI aggregations, in SQL
  explore.py          Indicator explorer SQL (/api/explore)
  templates/index.html  Dashboard shell
  static/
    css/uhai-base.css   Shared tokens and buttons (website + dashboard)
    css/dashboard.css   Dashboard layout
    data/indicators.json  Indicator catalogue (API and mock)
    img/              uhai-logo.svg, uhai-mark.svg (stand-ins, see below)
    js/
      services/
        api_service.js    API layer: calls Flask
        mock_data.js      Mock layer: seeded synthetic rows, same response shapes
        data_service.js   The only entry point pages use; picks API or mock
      charts.js           Chart.js wrapper: brand palette, pie labels, selection
      explorer.js         GLOBOCAN-style explorer and chart card
      forecast_prototype.js  Linear-trend prototype (replace with a real model)
      ui.js / pages.js / app.js  Filter bar and helpers, sections, routing
```

**Mock vs API boundary.** Pages call only `UhaiData` (`data_service.js`). The API and mock services implement the same methods (`ping`, `meta`, `dashboard`, `timeseries`, `explore`, `quality`) and return identical shapes. If the API can't be reached, the app falls back to mock and shows a pink **MOCK DATA** banner. It never presents mock numbers as database numbers.

**API endpoints:** `/api/meta`, `/api/dashboard`, `/api/timeseries?metric=&grain=month|week&split=`, `/api/quality`, plus the original `/api/ping`, `/api/summary`, `/api/{sourcing,processing,distributions,transfusions}`, `/api/sourcing/trend`, `/api/transfusions/trend` and `/api/{sourcing,transfusions}/by-blood-group`. Filters are `from`, `to` (YYYY-MM-DD), and `blood_group`, `product`, `facility` (repeatable).

## Datasets (column names as they exist in the database)

| Table | Rows | Columns |
|---|---|---|
| `sourcing` | 10,000 | patient_id, sex, age, blood_group, blood_product, voluntary/replacement, **date**, time, date_of_birth, weight_(kg), height_(cm), volume_donated_(ml), donor_age_group, bmi_proxy, donation_month, day_of_week |
| `processing` | 10,000 | how_much_blood_was_received_(in-house/mobile), screening_failure_rate_(had_tti's), prbc_(units), ffp_(units), platelets_(units), cryoprecipitate_(units), blood_groups, total_volume_processed_(ml), reason_for_discard, is_discarded |
| `distributions` | 10,000 | type_of_product, quantity_(units), amount_distributed_(ml), recipient_facility, **date_blood_ordered**, date_blood_received, turnaround_time_(days), transfusion_outcome_/_status |
| `transfusions` | 10,000 | 44 columns, incl. patient_id, age, sex, reason_for_transfusion, blood_group, quantity_requested, quantity_given, blood_product_requested, fulfilment, hb_level, **date_blood_first_ordered**, date_blood_received, time_to_receipt_of_transfusion_(days), product_transfused, transfusion_outcomes, had_reaction, age_group, volume_shortfall |

Which filters each table supports:

| | Date | Blood group | Product | Facility |
|---|---|---|---|---|
| sourcing | ✓ | ✓ | ✓ | — |
| processing | — | ✓ (`blood_groups`) | component columns | — |
| distributions | ✓ | — | ✓ | ✓ |
| transfusions | ✓ | ✓ | ✓ | — |

The filter panel marks each filter as Applies, Partial or N/A for the current tab.

## Reused vs changed

- **Reused:** `app/db.py` (`query()`, now read-only plus `scalar()`), `app/filters.py` (`build_filters` pattern, made table-aware), `app/app.py` (every original route kept), UHAI colour tokens (now in `uhai-base.css`), Chart.js, Leaflet. The old `styles.css` was replaced by `uhai-base.css` + `dashboard.css`.
- **Database name:** the project uses `uhai_dashboard.db`. There is no `uhai.db`; set `UHAI_DB_PATH` to point elsewhere.
- **Removed:** `static/js/data_engine.js` (the old client-side generator, whose fields did not exist in the database) and the empty `static/js/dashboard.js`. The dashboard's old gradient hero, icon-card grid and vision block were also removed; that story now lives on the public website.
- **Bug fixed:** the original `/api/transfusions` and `/api/transfusions/trend` endpoints filtered and grouped on a `date` column that `transfusions` does not have, so they failed with any date filter. They now use `date_blood_first_ordered`.

## `<unclear>` items, assumptions and recommended fixes

1. **`<unclear>` Logo file.** The logo was shared as a chat image and is not on disk, and the pitch decks contain only template artwork. `static/img/uhai-logo.svg` is a vector stand-in. **Fix:** save the official PNG as `app/static/img/uhai-logo.png`. The website, dashboard and favicon all switch to it automatically.
1a. **`<unclear>` Team.** The 2024 one-pager (Stephanie Kitur, CEO; Benjamin Mogusu, COO; Vicky Cheptoo, Head of Partnerships) and the 2025 investor deck (Gerald Lwande, Executive Director; Prof. Innocent Edagha; Dr. Samuel Mbunya; Benjamin Mogusu; Mary Jerop) disagree. The About page uses the newer deck. **Fix:** confirm names, titles and consent in `site_content.TEAM`.
1b. **`<unclear>` Photographs.** Captions are deliberately neutral: no names, dates or venues. **Fix:** confirm the people pictured consent to publication, and supply captions to put in `site_content.PHOTOS`.
1c. **`<unclear>` Reported figures.** The impact figures (35+ drives, 3,000+ pints, about 12,000 patients, +30% recurring donors, −20% wastage, US$250 per drive) and the national 500,000 / 150,000 pint figures are quoted from UHAI's own deck and labelled "reported by UHAI, not independently verified". Four FAQ answers are marked "to be confirmed": the next drive date, donor eligibility, how to volunteer, and the meaning of "Uhai".
1d. **`<unclear>` Facility coordinates** are approximate (see Facility map above). The Eldoret blood bank (ERBTC) is assumed to be the origin of all distributions.
2. **`<unclear>` processing has no date, donation ID or link to sourcing.** It cannot be trended or date-filtered, so its figures always cover the whole log. **Fix:** add `processed_date` and a `donation_id` foreign key.
3. **`<unclear>` Product names differ across tables.** Assumed mapping: Whole Blood (350/450 mL) → Whole Blood; Packed Red Blood Cells → Red Cells; Fresh Frozen Plasma / Apheresis Plasma → Plasma; Platelets / Platelet Concentrate / Apheresis Platelets → Platelets. **Fix:** a shared `product_code` lookup table.
4. **`<unclear>` Units.** Donations are counted per donation; transfusion demand is counted in `quantity_requested` units. The Overview, Blood Groups and Forecasting tabs treat one donation as roughly one unit. **Fix:** record units issued per donation.
5. **`<unclear>` Facility is only in distributions.** Sourcing has no drive or site column, and transfusions has no facility (the `MTRH-PT-` prefix suggests a single site). Blood-drive activity is therefore approximated from the processing intake channel (Mobile Drive / Mobile Outreach / In-house Walk-in). **Fix:** add `drive_id`/`site` to sourcing and `facility` to transfusions.
6. **`<unclear>` Distributions have no blood group,** so the blood-group filter can't apply to them. **Fix:** add `blood_group`.
7. **`<unclear>` Donor retention.** `patient_id` is unique on every sourcing row, so repeat donors can't be identified. The pitch deck's "30% increase in recurring donors" can't be checked from this data. **Fix:** a stable donor ID.
8. **`<unclear>` Future-dated records.** 402 distribution and 402 transfusion rows are dated after 9 Oct 2026, up to 22 Oct 2026. They are shown and flagged on the Data Quality tab.
9. **`<unclear>` Sparse dates.** Distribution and transfusion dates fall only on the 1st, 8th, 15th and 22nd of each month, so weekly views have gaps. Sourcing stops on 5 Oct 2026, so October is partial. The UI flags partial periods.
10. **`<unclear>` Stored-as-text numbers.** `milliliters_of_blood_ordered` and `milliliters_of_blood_transfused` are TEXT with thousands separators (e.g. "1,350"). They aren't used in totals. **Fix:** store as INTEGER.
11. **`<unclear>` Storage and temperature.** The theory of change plans cold-chain monitoring, but no temperature or storage fields exist. The Processing tab says so instead of inventing them.
12. **`<unclear>` Category text with embedded rates.** Values like "Reactive: HBV (1.2%)" contain a percentage that doesn't come from the data. **Fix:** store the marker name only.
13. **Forecast.** The prototype fits a linear trend to complete monthly totals and shows an 80% prediction interval. It is labelled as a prototype everywhere it appears. **Fix:** replace `UhaiForecast.project()` with UHAI's validated model.
14. **Other assumptions:** fulfilment rate = units given ÷ units requested; "avoidable wastage" = discards for shelf life, storage or handling (i.e. not reactive); Chart.js, Leaflet, map tiles and the Inter/Manrope fonts load from CDNs; if offline, tables and text still work.
