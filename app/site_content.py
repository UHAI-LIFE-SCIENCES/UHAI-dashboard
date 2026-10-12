"""
Content for the public UHAI website.

Every statement here is taken from UHAI's own documents in /Docs:
  [deck]     Investor_Pitch_Deck _ Uhai Life Sciences.pptx (2025)
  [elevator] Elevator_Pitch_Uhai Life Sciences.pptx
  [toc]      Theory_of_Change_ Uhai Life Sciences.pptx
  [onepager] UHAI 2024+Startup+One-Pager.pdf
Figures are organisation-reported and are labelled that way on the site.
Edit this file, not the templates, to change wording.
"""

import os


# ==================================================
# PHOTOGRAPHS (captions are neutral: no names, dates or places)
# ==================================================

PHOTOS = {
    "donor-chair": {
        "w": 960, "h": 1280, "focus": "50% 45%",
        "alt": "A blood donor reclining in a donation chair gives a peace sign while a companion stands beside her.",
        "caption": "A donor during a UHAI blood drive.",
    },
    "drive-banner": {
        "w": 960, "h": 540, "focus": "50% 50%",
        "alt": "Two volunteers hold up a UHAI banner reading 'Blood Donation Drive – I Saved a Life'.",
        "caption": "Setting up for a UHAI blood donation drive.",
    },
    "donor-registration": {
        "w": 960, "h": 1280, "focus": "55% 40%",
        "alt": "A smiling donor sits at a registration table while a person in a white coat prepares him.",
        "caption": "Donor registration and screening at a blood drive.",
    },
    "team-group": {
        "w": 1600, "h": 1200, "focus": "50% 45%",
        "alt": "A group of about twenty people, students and health workers, stand together outdoors.",
        "caption": "Volunteers and partners at a UHAI activity.",
    },
    "event-tablet": {
        "w": 960, "h": 920, "focus": "50% 45%",
        "alt": "A hand writes 'UHAI Life Sciences' with a stylus on a tablet.",
        "caption": "UHAI at an outreach event.",
    },
}

GALLERY = ["drive-banner", "donor-registration", "team-group", "event-tablet", "donor-chair"]


# ==================================================
# FACTS
# ==================================================

FOUNDED = "2023"                       # [elevator]
LOCATION = "Eldoret, Kenya"            # [onepager]

PURPOSE = (
    "To strengthen the WHO health-systems building block on medical products, vaccines and technologies "
    "by improving the blood and blood products supply chain, with a focus on access, processing and distribution."
)  # [onepager]

VISION = (
    "A public health system with adequate and safe quantities of blood and blood products that are "
    "distributed objectively and consistently to all critical patients in need."
)  # [onepager]

# National context, as cited in UHAI's deck
NATIONAL_TARGET_PINTS = 500_000        # [deck] "Kenya targets 500,000 pints of blood ..."
NATIONAL_DONATED_PINTS = 150_000       # [deck] "... against 150,000 donated annually."

AUDITOR_FINDINGS = [                   # [deck] 2022 Auditor General report
    ("No inventory system", "There was no inventory system for managing blood and blood products efficiently."),
    ("Too few donors kept", "Mobilisation, recruitment and retention of blood donors was inadequate."),
    ("Targets missed", "The national blood service could not meet its own blood-collection targets."),
    ("Storage and transport", "Blood and blood products were not reliably stored and transported."),
]

AFFECTED = [                           # [deck]
    "People undergoing cancer treatment",
    "People living with blood disorders such as sickle cell disease",
    "Trauma patients, including road-traffic injuries",
    "Patients scheduled for surgery",
]

PILLARS = [                            # [toc] activities -> outcomes
    {
        "key": "access", "title": "Access",
        "summary": "More donors, and donors who come back.",
        "activities": [
            "Running targeted blood drives, on-site and off-site, with the Eldoret blood bank",
            "Predictive modelling of the blood volumes a drive is likely to collect",
            "Targeted messages to previous donors about upcoming drives",
            "A behavioural reward system using digital medals",
        ],
        "outcome": "Adequate donations during blood drives and a recurrent pool of donors.",
    },
    {
        "key": "processing", "title": "Processing",
        "summary": "Blood kept stable from collection to patient.",
        "activities": [
            "Linking the UHAI portal to temperature monitoring during long-term storage and transport",
        ],
        "outcome": "Fewer temperature fluctuations, so blood and blood products stay stable.",
    },
    {
        "key": "distribution", "title": "Distribution",
        "summary": "Knowing what is available, and sharing it fairly.",
        "activities": [
            "A consolidated database of the blood quantities available",
            "A standard inventory of blood products",
        ],
        "outcome": "Better planning, and less human interference and bias in who receives blood.",
    },
]

# Organisation-reported results [deck, slides 4–7]
IMPACT = [
    {"value": "35+", "label": "blood drives run",
     "context": "More than 20 outdoor and 15 in-house drives, with the Eldoret blood bank."},
    {"value": "3,000+", "label": "pints of blood raised",
     "context": "Cumulative. UHAI estimates this has supported about 12,000 patients."},
    {"value": "30%", "label": "more recurring donors",
     "context": "Increase in donors who return, as measured by UHAI."},
    {"value": "20%", "label": "less blood wasted",
     "context": "Reduction in blood wastage, as measured by UHAI."},
    {"value": "US$250", "label": "cost per blood drive",
     "context": "Down from more than US$1,000 per drive."},
]

MILESTONES_2030 = [                    # [onepager]
    "Complete the mobile application",
    "Onboard donors, patients and hospitals",
    "Embed the mobile application in blood banks",
    "Increase blood drives and donated quantities",
    "Objective distribution of blood to patients",
]

ACHIEVED = [                           # [deck]
    "Developed a working predictive-model algorithm",
    "Determined the number of target blood-drive sites",
    "Served oncology patients at Moi Teaching and Referral Hospital (MTRH)",
    "Served people with sickle cell disease and haemophilia through AMPATH",
    "Media coverage on Citizen TV, K24 TV and Nation TV, including World Sickle Cell Day 2025",
]

PARTNERS = [                           # [deck] "Uhai partners with:"
    ("Government", "National and county government"),
    ("Blood services", "Kenya Tissue and Transplant Services (blood banks)"),
    ("Hospitals", "Public and private hospitals, including MTRH"),
    ("Research", "AMPATH and Innovative Hematology"),
    ("Professional bodies", "Oncology Nurses Chapter"),
    ("Education", "Colleges and universities"),
    ("Business", "Bakeries, beverage and events companies"),
]

SDGS = [                               # [deck] [onepager]
    ("3", "Good health and well-being"),
    ("10", "Reduced inequalities"),
    ("17", "Partnerships for the goals"),
]

COMMUNITY_SIZE = "500"                 # [elevator] "a community of 500 multidisciplinary health professionals and students"

# <unclear> The one-pager (2024) and the investor deck (2025) list different
# teams and titles. The newer deck is used here; confirm before publishing.
TEAM = [                               # [deck, slide 9]
    {"name": "Gerald Lwande", "role": "Executive Director",
     "bio": "Has worked in clinical laboratories in Kenya and Finland where blood was screened and stored before "
            "transfusion. Studied biomedical sciences and information technology."},
    {"name": "Prof. Innocent Edagha", "role": "Research scientist",
     "bio": "Clinical and research experience in Nigeria and the United States, including platforms for sharing "
            "blood products and organs."},
    {"name": "Dr. Samuel Mbunya", "role": "Advocacy",
     "bio": "Advocacy expert on blood and blood disorders, with over 10 years of experience."},
    {"name": "Benjamin Mogusu", "role": "Medical student",
     "bio": "Sixth-year medical student, student leader and team leader at Equity Leadership Scholars."},
    {"name": "Mary Jerop", "role": "Medical student",
     "bio": "Fourth-year medical student involved in reproductive-health campaigns."},
]


# ==================================================
# FAQS (question, answer)
# ==================================================

FAQS = [
    ("About UHAI", [
        ("What is UHAI Life Sciences?",
         f"A social enterprise founded in {FOUNDED} and based in {LOCATION}. It works to strengthen the blood supply "
         "chain across three areas: access to donors, processing and storage, and distribution to patients."),
        ("What does “Uhai” mean?",
         "“Uhai” is the Swahili word for life. The organisation's slogan is “Uhai, I saved a life.”"),
        ("Who does UHAI help?",
         "Patients in critical or chronic need of transfusion: people being treated for cancer or blood disorders, "
         "trauma patients such as road-accident victims, and people scheduled for surgery. Donors and volunteers "
         "benefit too, through awareness and recognition."),
        ("How is UHAI funded?",
         "Through a mix of grants, crowd-sourced donations and earned income, such as merchandise sales "
         "(polo shirts and wristbands)."),
    ]),
    ("Blood donation and blood drives", [
        ("Where are UHAI's blood drives held?",
         "UHAI runs drives with the Eldoret blood bank, both at the blood bank (in-house) and at outdoor sites "
         "such as colleges and community venues."),
        ("Who can donate blood?",
         "Eligibility is set by Kenya's blood transfusion service and is checked at screening before every "
         "donation. Staff at the drive or the blood bank can answer questions about your eligibility."),
        ("Do donors get anything for donating?",
         "UHAI is building non-monetary recognition, including digital medals, to thank donors and encourage them "
         "to return. Drives are also run as social events."),
    ]),
    ("Technology and predictive modelling", [
        ("What does UHAI's predictive model do?",
         "It estimates the volume of blood a drive is likely to collect, so drives can be planned and targeted. "
         "UHAI reports having a working algorithm."),
    ]),
    ("Blood supply-chain management", [
        ("Why does Kenya run short of blood?",
         "Kenya targets 500,000 pints of blood a year but collects about 150,000. A 2022 Auditor General report "
         "found no inventory system for blood, weak donor recruitment and retention, missed collection "
         "targets, and problems with storage and transport."),
        ("How does UHAI reduce wastage?",
         "By planning drives around predicted need, monitoring storage temperature, and keeping a consolidated record "
         "of available blood so units are used before they expire. UHAI reports a 20% reduction in wastage."),
    ]),
    ("Partnerships and engagement", [
        ("Who does UHAI work with?",
         "Government, blood banks, hospitals such as MTRH, research institutions such as AMPATH, professional bodies "
         "such as the Oncology Nurses Chapter, universities and local businesses."),
        ("How can my organisation partner with UHAI?",
         "Drives offer businesses in healthcare and allied industries, such as insurance, banking and sports, a chance "
         "to engage the public. UHAI is also seeking partners for a pilot in Western Kenya. Use the contact form to "
         "start a conversation."),
        ("Can I volunteer?",
         "Yes. Volunteers, including health workers, students and entertainers, are central to UHAI's drives. "
         "Send us a message through the contact form and choose “Volunteering”."),
    ]),
]


# ==================================================
# SOCIAL MEDIA (footer "Follow Uhai" and the contact page)
# ==================================================

SOCIAL = [
    {"key": "instagram", "name": "Instagram", "handle": "@uhai.life",
     "url": "https://www.instagram.com/uhai.life/",
     "text": "Follow our updates, events and community activities at @uhai.life"},
    {"key": "linkedin", "name": "LinkedIn", "handle": "Uhai Life Sciences",
     "url": "https://ke.linkedin.com/company/uhai-life",
     "text": "Connect with Uhai Life Sciences and follow our company milestones"},
    {"key": "x", "name": "X", "handle": "@uhai_lifeke",
     "url": "https://x.com/uhai_lifeke",
     "text": "Read our latest announcements at @uhai_lifeke"},
]


# ==================================================
# CONTACT (only shown when configured; never invented)
# ==================================================

def contact_details():
    """Verified contact channels, read from environment variables. Social links live in SOCIAL."""
    channels = [
        ("Email", os.environ.get("UHAI_CONTACT_EMAIL"), "mailto:"),
        ("Phone", os.environ.get("UHAI_CONTACT_PHONE"), "tel:"),
    ]
    return [
        {"label": label, "value": value, "href": prefix + value}
        for label, value, prefix in channels if value
    ]


CONTACT_REASONS = [
    "Partnership or sponsorship",
    "Hosting a blood drive",
    "Volunteering",
    "Donating blood",
    "Media enquiry",
    "Dashboard or data",
    "Something else",
]
