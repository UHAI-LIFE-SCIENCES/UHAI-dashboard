Uhai Blood Dashboard

A simple web dashboard for Uhai Life Sciences showing blood donations, donors, conditions and hospitals in Eldoret City.

It has these sections:

Overview: key figures, blood groups and donations vs requests
Donors, hospitals and conditions, and trends: the detail behind the overview
Forecast: a projection with scenario sliders

The dashboard currently uses sample data.

How to run: 

- Put uhai.db in the project folder, next to the app folder.
- Install and start the app:
- bash
- pip install -r requirements.txt
- python app/app.py
- Open http://127.0.0.1:5000 in your browser.


Folder structure
uhai-dashboard/
├── uhai.db
├── requirements.txt
├── README.md
└── app/
    ├── app.py
    └── templates/
        └── index.html
