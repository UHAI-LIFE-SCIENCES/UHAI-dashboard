"""
SAMPLE inventory, added once on first run and marked as sample in the database.
An admin can remove it from the Inventory page once real stock is entered.

Quantities are sized for RBTC Eldoret's volume (about 2,000 donations a month,
so about two months of consumables). Brands are real brands sold or used in
Kenya; who supplied what, and how much, is illustrative. The item list follows
the WHO checklist of equipment and materials for a mobile donor clinic
(Safe Blood Donation, Module 1, Figure 5).
"""

# Item types: (name, stage, consumable or equipment, counting unit, reorder level)
ITEMS = [
    # Donor registration & screening
    ("Donor registration forms", "Donor registration & screening", "Consumable", "pieces", 1000),
    ("Haemoglobin microcuvettes", "Donor registration & screening", "Consumable", "tests", 1500),
    ("Safety lancets", "Donor registration & screening", "Consumable", "pieces", 1500),
    ("Haemoglobinometer", "Donor registration & screening", "Equipment", "units", None),
    ("BP machine", "Donor registration & screening", "Equipment", "units", None),
    ("Donor weighing scale", "Donor registration & screening", "Equipment", "units", None),
    # Phlebotomy (blood collection)
    ("Blood bag, single", "Phlebotomy (blood collection)", "Consumable", "pieces", 200),
    ("Blood bag, double", "Phlebotomy (blood collection)", "Consumable", "pieces", 1000),
    ("Blood bag, triple", "Phlebotomy (blood collection)", "Consumable", "pieces", 1200),
    ("Blood bag, quadruple", "Phlebotomy (blood collection)", "Consumable", "pieces", 100),
    ("Sample tubes, EDTA", "Phlebotomy (blood collection)", "Consumable", "pieces", 3000),
    ("Examination gloves", "Phlebotomy (blood collection)", "Consumable", "pairs", 2000),
    ("Alcohol swabs", "Phlebotomy (blood collection)", "Consumable", "pieces", 3000),
    ("Cotton wool", "Phlebotomy (blood collection)", "Consumable", "rolls", 20),
    ("Plasters", "Phlebotomy (blood collection)", "Consumable", "pieces", 2000),
    ("Tourniquets", "Phlebotomy (blood collection)", "Consumable", "pieces", 30),
    ("Donor couch", "Phlebotomy (blood collection)", "Equipment", "units", None),
    ("Blood collection mixer", "Phlebotomy (blood collection)", "Equipment", "units", None),
    ("Tube sealer", "Phlebotomy (blood collection)", "Equipment", "units", None),
    # Screening & testing
    ("HIV test kits", "Screening & testing", "Consumable", "tests", 2000),
    ("Hepatitis B test kits", "Screening & testing", "Consumable", "tests", 2000),
    ("Hepatitis C test kits", "Screening & testing", "Consumable", "tests", 2000),
    ("Syphilis test kits", "Screening & testing", "Consumable", "tests", 2000),
    ("Anti-A reagent", "Screening & testing", "Consumable", "bottles", 5),
    ("Anti-B reagent", "Screening & testing", "Consumable", "bottles", 5),
    ("Anti-D reagent", "Screening & testing", "Consumable", "bottles", 5),
    ("Pipette tips", "Screening & testing", "Consumable", "packs", 10),
    ("Centrifuge", "Screening & testing", "Equipment", "units", None),
    # Product separation
    ("Transfer bags", "Product separation", "Consumable", "pieces", 300),
    ("Sterile connector wafers", "Product separation", "Consumable", "pieces", 200),
    ("Refrigerated centrifuge", "Product separation", "Equipment", "units", None),
    ("Platelet agitator", "Product separation", "Equipment", "units", None),
    # Cold storage & transport
    ("Blood bank refrigerator", "Cold storage & transport", "Equipment", "units", None),
    ("Plasma freezer", "Cold storage & transport", "Equipment", "units", None),
    ("Blood transport cool box", "Cold storage & transport", "Equipment", "units", None),
    ("Temperature logger", "Cold storage & transport", "Equipment", "units", None),
    ("Ice packs", "Cold storage & transport", "Consumable", "pieces", 100),
    ("Blood bag labels", "Cold storage & transport", "Consumable", "pieces", 3000),
    # Waste management
    ("Sharps containers", "Waste management", "Consumable", "pieces", 50),
    ("Biohazard bags, yellow", "Waste management", "Consumable", "bags", 200),
    ("Biohazard bags, red", "Waste management", "Consumable", "bags", 100),
    ("Biohazard bags, black", "Waste management", "Consumable", "bags", 100),
    ("Disinfectant (hypochlorite)", "Waste management", "Consumable", "bottles", 10),
    # Post-donation refreshments
    ("Drinking water", "Post-donation refreshments", "Consumable", "bottles", 1500),
    ("Soda", "Post-donation refreshments", "Consumable", "bottles", 1000),
    ("Juice", "Post-donation refreshments", "Consumable", "packets", 500),
    ("Biscuits", "Post-donation refreshments", "Consumable", "packets", 1000),
    # Drive logistics
    ("Tent", "Drive logistics", "Equipment", "units", None),
    ("Pull-up banner", "Drive logistics", "Equipment", "units", None),
    ("Folding chairs", "Drive logistics", "Equipment", "units", None),
    ("Extension cable", "Drive logistics", "Equipment", "units", None),
    ("Generator", "Drive logistics", "Equipment", "units", None),
    ("First-aid kit", "Drive logistics", "Consumable", "kits", 5),
]

AMPATH = "AMPATH"
MBOGA = "Mboga na Kadhalika"
IH = "Innovative Hematology"


def _e(item, brand, spec, source, qty, received, partner=None, batch=None, expiry=None):
    return {"item": item, "brand": brand, "spec": spec, "source": source, "partner": partner,
            "qty": qty, "received": received, "batch": batch, "expiry": expiry}


DP = "Development partner"
GF = "Good Friends of UHAI"

ENTRIES = [
    # Donor registration & screening
    _e("Donor registration forms", "Unbranded", "Printed A4 donor form", "UHAI", 2500, "2026-09-02"),
    _e("Haemoglobin microcuvettes", "HemoCue", "Hb 301 microcuvettes", "KEMSA", 1200, "2026-08-14", batch="HC301-2608", expiry="2026-11-15"),
    _e("Safety lancets", "Unbranded", "Single-use safety lancet", "KEMSA", 4000, "2026-08-14", batch="LN-2607", expiry="2028-07-31"),
    _e("Haemoglobinometer", "HemoCue", "Hb 301", "KEMSA", 4, "2025-11-20"),
    _e("Haemoglobinometer", "HemoCue", "Hb 301", DP, 2, "2026-03-11", partner=AMPATH),
    _e("BP machine", "Omron", "Automatic upper-arm monitor", "UHAI", 4, "2026-01-15"),
    _e("BP machine", "Omron", "Automatic upper-arm monitor", GF, 2, "2026-05-06"),
    _e("Donor weighing scale", "Seca", "Digital floor scale", "UHAI", 3, "2026-01-15"),

    # Phlebotomy (blood collection)
    _e("Blood bag, triple", "Terumo", "Teruflex triple, CPDA-1, 450 ml", "KEMSA", 900, "2026-09-18", batch="TT-2609A", expiry="2028-03-31"),
    _e("Blood bag, triple", "Fresenius Kabi", "Triple, CPD/SAGM, 450 ml", DP, 400, "2026-10-06", partner=AMPATH, batch="FK-T-2610", expiry="2028-05-31"),
    _e("Blood bag, double", "Terumo", "Teruflex double, CPDA-1, 450 ml", "KEMSA", 700, "2026-09-18", batch="TD-2609A", expiry="2028-02-29"),
    _e("Blood bag, single", "Terumo", "Teruflex single, CPDA-1, 450 ml", "KEMSA", 350, "2026-08-14", batch="TS-2608", expiry="2027-12-31"),
    _e("Blood bag, quadruple", "Terumo", "Quadruple, CPD/SAGM, 450 ml", "KEMSA", 120, "2026-08-14", batch="TQ-2608", expiry="2028-01-31"),
    _e("Sample tubes, EDTA", "BD Vacutainer", "K2EDTA, 4 ml", "KEMSA", 5000, "2026-08-14", batch="BD-2607", expiry="2027-06-30"),
    _e("Examination gloves", "Unbranded", "Nitrile, medium", "KEMSA", 3000, "2026-08-14"),
    _e("Examination gloves", "Unbranded", "Latex, large", DP, 1000, "2026-09-25", partner=IH),
    _e("Alcohol swabs", "Unbranded", "70% isopropyl alcohol pads", "KEMSA", 6000, "2026-08-14", expiry="2028-06-30"),
    _e("Cotton wool", "Unbranded", "500 g roll", "UHAI", 40, "2026-09-02"),
    _e("Plasters", "Elastoplast", "Round spot plasters", "UHAI", 3000, "2026-09-02"),
    _e("Tourniquets", "Unbranded", "Quick-release", "KEMSA", 45, "2026-03-04"),
    _e("Donor couch", "Unbranded", "Reclining donor chair", "KEMSA", 4, "2025-11-20"),
    _e("Donor couch", "Unbranded", "Fold-up donor bed (for drives)", "UHAI", 6, "2026-02-10"),
    _e("Blood collection mixer", "Delcon", "Hemoflow mixer-scale", "KEMSA", 6, "2025-11-20"),
    _e("Tube sealer", "Terumo", "T-SEAL II, handheld", "KEMSA", 2, "2025-11-20"),

    # Screening & testing
    _e("HIV test kits", "DiaSorin", "Murex HIV Ag/Ab Combination (ELISA)", "KEMSA", 2880, "2026-09-18", batch="MX-HIV-2609", expiry="2027-02-28"),
    _e("Hepatitis B test kits", "Bio-Rad", "Monolisa HBsAg ULTRA (ELISA)", "KEMSA", 1920, "2026-09-18", batch="BR-HBS-2609", expiry="2026-12-20"),
    _e("Hepatitis B test kits", "Bio-Rad", "Monolisa HBsAg ULTRA (ELISA)", "KEMSA", 96, "2026-04-02", batch="BR-HBS-2603", expiry="2026-10-10"),
    _e("Hepatitis C test kits", "DiaSorin", "Murex anti-HCV (ELISA)", "KEMSA", 2400, "2026-09-18", batch="MX-HCV-2609", expiry="2027-01-31"),
    _e("Syphilis test kits", "Abbott", "Bioline Syphilis 3.0 (rapid)", DP, 600, "2026-07-21", partner=AMPATH, batch="BL-SYP-2607", expiry="2027-04-30"),
    _e("Anti-A reagent", "Lorne Laboratories", "Monoclonal, 10 ml", "KEMSA", 8, "2026-08-14", batch="LA-2607", expiry="2027-08-31"),
    _e("Anti-B reagent", "Lorne Laboratories", "Monoclonal, 10 ml", "KEMSA", 8, "2026-08-14", batch="LB-2607", expiry="2027-08-31"),
    _e("Anti-D reagent", "Lorne Laboratories", "Monoclonal IgM, 10 ml", "KEMSA", 4, "2026-08-14", batch="LD-2607", expiry="2027-06-30"),
    _e("Pipette tips", "Unbranded", "200 µl, pack of 1,000", DP, 12, "2026-09-25", partner=IH),
    _e("Centrifuge", "Hettich", "Bench centrifuge for sample tubes", "KEMSA", 2, "2025-11-20"),

    # Product separation
    _e("Transfer bags", "Terumo", "600 ml transfer bag", "KEMSA", 500, "2026-08-14", batch="TB-2608", expiry="2028-01-31"),
    _e("Sterile connector wafers", "Terumo", "TSCD wafers", "KEMSA", 300, "2026-08-14", batch="TW-2608", expiry="2029-07-31"),
    _e("Refrigerated centrifuge", "Hettich", "Roto Silenta 630 RS", "KEMSA", 1, "2025-11-20"),
    _e("Platelet agitator", "Helmer Scientific", "Platelet agitator with incubator", DP, 1, "2026-03-11", partner=AMPATH),

    # Cold storage & transport
    _e("Blood bank refrigerator", "Helmer Scientific", "Blood bank refrigerator, +4 °C", "KEMSA", 2, "2025-11-20"),
    _e("Blood bank refrigerator", "Haier Biomedical", "Blood bank refrigerator, +4 °C", DP, 1, "2026-03-11", partner=AMPATH),
    _e("Plasma freezer", "Haier Biomedical", "Plasma freezer, -40 °C", "KEMSA", 1, "2025-11-20"),
    _e("Blood transport cool box", "B Medical Systems", "Blood transport box", "KEMSA", 10, "2025-11-20"),
    _e("Blood transport cool box", "Unbranded", "Insulated cooler, 25 litres", "UHAI", 6, "2026-02-10"),
    _e("Temperature logger", "LogTag", "Reusable temperature data logger", "UHAI", 8, "2026-02-10"),
    _e("Ice packs", "Unbranded", "Reusable ice pack", "KEMSA", 120, "2026-03-04"),
    _e("Blood bag labels", "Unbranded", "Donation number labels", "KEMSA", 4000, "2026-08-14"),

    # Waste management
    _e("Sharps containers", "Unbranded", "5 litre", "KEMSA", 60, "2026-08-14"),
    _e("Biohazard bags, yellow", "Unbranded", "Infectious waste", "KEMSA", 150, "2026-08-14"),
    _e("Biohazard bags, red", "Unbranded", "Highly infectious waste", "KEMSA", 120, "2026-08-14"),
    _e("Biohazard bags, black", "Unbranded", "General waste", "UHAI", 140, "2026-09-02"),
    _e("Disinfectant (hypochlorite)", "Jik", "Regular, 750 ml", "UHAI", 12, "2026-09-02"),

    # Post-donation refreshments
    _e("Drinking water", "Dasani", "500 ml bottle", DP, 480, "2026-10-03", partner=MBOGA, expiry="2027-04-30"),
    _e("Drinking water", "Dasani", "500 ml bottle", "UHAI", 240, "2026-10-14", expiry="2027-05-31"),
    _e("Drinking water", "Dasani", "500 ml bottle", GF, 120, "2026-10-17", expiry="2027-05-31"),
    _e("Drinking water", "Keringet", "500 ml bottle", DP, 360, "2026-09-25", partner=AMPATH, expiry="2027-03-31"),
    _e("Drinking water", "Quencher", "500 ml bottle", "UHAI", 240, "2026-10-14", expiry="2027-04-30"),
    _e("Soda", "Coca-Cola", "300 ml glass bottle", DP, 600, "2026-10-03", partner=MBOGA, expiry="2027-01-31"),
    _e("Soda", "Fanta Orange", "300 ml glass bottle", "UHAI", 480, "2026-10-14", expiry="2027-02-28"),
    _e("Soda", "Sprite", "300 ml glass bottle", GF, 240, "2026-10-17", expiry="2027-02-28"),
    _e("Juice", "Afia", "300 ml bottle", "UHAI", 360, "2026-10-14", expiry="2027-01-31"),
    _e("Juice", "Minute Maid", "400 ml bottle", DP, 240, "2026-09-12", partner=MBOGA, expiry="2026-11-10"),
    _e("Biscuits", "Nuvita", "Small packet", DP, 1000, "2026-10-03", partner=MBOGA, expiry="2027-03-31"),
    _e("Biscuits", "Manji", "Small packet", GF, 400, "2026-10-17", expiry="2027-04-30"),

    # Drive logistics
    _e("Tent", "Unbranded", "3 m × 3 m gazebo", GF, 4, "2025-12-08"),
    _e("Tent", "Unbranded", "3 m × 3 m gazebo", "UHAI", 2, "2026-02-10"),
    _e("Pull-up banner", "Unbranded", "UHAI pull-up banner", "UHAI", 6, "2026-02-10"),
    _e("Folding chairs", "Unbranded", "Plastic folding chair", "UHAI", 40, "2026-02-10"),
    _e("Folding chairs", "Unbranded", "Plastic folding chair", DP, 20, "2026-05-06", partner=MBOGA),
    _e("Extension cable", "Unbranded", "4-way, 10 m", "UHAI", 6, "2026-02-10"),
    _e("Generator", "Honda", "Portable petrol generator", GF, 1, "2026-05-06"),
    _e("First-aid kit", "Unbranded", "Drive first-aid kit", "UHAI", 4, "2026-02-10"),
]
