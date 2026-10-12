"""
Upcoming blood drives, shown in the "Next Blood Drive" section of the home page.

To add a drive, copy one entry and change its details. To remove a drive, delete its entry.
Drives whose date has passed are hidden automatically. If no upcoming drives remain, the
page shows: "New blood drive dates are coming soon. Follow us on social media for updates."

Fields:
  date   YYYY-MM-DD, for example "2026-10-24"
  time   free text, for example "9:00 am – 3:00 pm"
  venue  where the drive takes place
  area   town or area, for example "Eldoret"
"""

from datetime import date

DRIVES = [
    # EXAMPLE ENTRY: replace with a real drive before publishing.
    {"date": "2026-10-24", "time": "9:00 am – 3:00 pm",
     "venue": "Eldoret Regional Blood Transfusion Centre", "area": "Eldoret"},

    # EXAMPLE ENTRY: replace with a real drive before publishing.
    {"date": "2026-11-07", "time": "10:00 am – 4:00 pm",
     "venue": "University of Eldoret, main campus", "area": "Eldoret"},

    # EXAMPLE ENTRY: replace with a real drive before publishing.
    {"date": "2026-11-21", "time": "9:00 am – 2:00 pm",
     "venue": "Eldoret town centre, Uhuru Gardens", "area": "Eldoret"},
]


def upcoming(today=None):
    """Drives from today onwards, soonest first, with a display label for the date."""
    today = today or date.today()
    result = []
    for d in DRIVES:
        when = date.fromisoformat(d["date"])
        if when >= today:
            result.append(d | {
                "when": when,
                "weekday": when.strftime("%A"),
                "day": when.day,
                "month": when.strftime("%B"),
                "label": f"{when.strftime('%A')} {when.day} {when.strftime('%B %Y')}",
            })
    return sorted(result, key=lambda d: d["when"])
