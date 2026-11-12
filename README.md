UHAI Blood Supply Chain Strengthening

A simple web dashboard for Uhai Life Sciences showing blood donations, donors, conditions and hospitals in Eldoret City.

It has these sections:

Overview: key figures, blood groups and donations vs requests
Donors, hospitals and conditions, and trends: the detail behind the overview
Forecast: a projection with scenario sliders

How to run: 

- Put uhai.db in the project folder, next to the app folder.
- Install and start the app:
- bash
- pip install -r requirements.txt
- python app/app.py
- Open the address Flask prints in the terminal (port 5000 by default).

Logins:

- The website is public. The dashboard (/dashboard) and its data (/api/...) need a login; /api/contact and /api/ping stay public.
- There is no sign-up. Create the first admin in a terminal, from the project folder:
  flask --app app/app.py create-admin
  It asks for a name, email and password (the password is not shown while typing).
- Admins add users, reset passwords and make users inactive at /admin/users (the "Users" link in the dashboard header). Staff accounts need an institutional affiliation; admins set or correct it in the users table.
- Accounts are stored in uhai_app.db locally (never commit it), or in Neon PostgreSQL when DATABASE_URL is set.
- Live settings (Render, Environment): SECRET_KEY (Render generates it; the app will not start without it) and DATABASE_URL (the Neon connection string). Never put either in the code or in git.
- "Continue as admin" (no password): by default only on the computer running the app, until the first admin exists. Set UHAI_ADMIN_BYPASS=on (Render, Environment) to offer it on the live site too; anyone can then enter as admin, so delete the setting or set it to off as soon as accounts are ready.
- Logins end after 8 hours without activity. After 5 wrong passwords for one email, that email is locked for 15 minutes.
- Log in with a code: instead of a password, a person enters their email or phone number and gets a 6-digit code (valid 10 minutes, works once, 5 tries; at most 3 codes per email or phone in 15 minutes). For SMS, admins add the person's phone number in /admin/users.
  - Email codes need SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD and SMTP_FROM (Render, Environment), e.g. from Brevo's free plan or a Gmail app password.
  - SMS codes need AT_USERNAME and AT_API_KEY from Africa's Talking (each SMS is charged; AT_USERNAME=sandbox tests for free in their simulator). AT_SENDER_ID is optional.
  - On your own computer without these settings, the code is printed in the terminal instead of being sent. Live, the page says that channel is not set up yet.

Editing content:

- Upcoming blood drives: app/blood_drives.py (past dates are hidden automatically).
- Monthly collections chart on the home page: the monthly figures in app/static/js/services/reported_figures.js (the same figures as the dashboard Overview).
- Names in the scrolling band under the home-page hero: PARTNER_NAMES in app/site_content.py.
- Wording, FAQs and social links: app/site_content.py.


Folder structure
uhai-dashboard/
├── uhai.db
├── requirements.txt
├── README.md
└── app/
    ├── app.py
    └── templates/
        └── index.html


Data notes (added with the dashboard redesign)

- The app reads uhai_dashboard.db (set UHAI_DB_PATH to use a different file such as uhai.db).
- The website is at / and the dashboard at /dashboard.
- Packed red cells in Sourcing are a sample split: 60% of whole-blood donations, chosen by donor ID (RBC_SAMPLE in app/filters.py). Replace once the product is recorded per donation.
- Donor areas on the Map are a sample allocation to Uasin Gishu's six sub-counties (SUB_COUNTY_SAMPLE in app/analytics.py). Replace once a collection site or sub-county is recorded per donation.
- Map locations (hospitals, sub-county and county centres) are approximate and live in app/static/data/facility_locations.json.
- For shaded (choropleth) maps, add GeoJSON boundaries for Uasin Gishu sub-counties or wards and for Kenya's counties (for example the IEBC or OCHA/HDX Kenya administrative boundaries).
