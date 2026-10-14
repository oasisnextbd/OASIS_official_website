#!/usr/bin/env python3
"""Generate venguard/assets/docs/venguard-fact-sheet.pdf (English) from venguard/site.json.
Run after changing claims, price or certifications:  python3 venguard/tools/make_factsheet.py"""
import json, pathlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

SRC = pathlib.Path(__file__).resolve().parent.parent  # venguard/
SITE = json.loads((SRC / "site.json").read_text(encoding="utf-8"))
OUT = SRC / "assets/docs/venguard-fact-sheet.pdf"
# Brand palette (docs/venguard/brand-rules.md): Guard Navy, VenGuard Orange, muted slate for small print.
CARBON, HAZARD, STEEL = (HexColor(c) for c in ("#0B2A4A", "#E85D0C", "#4F6178"))
c = SITE["claims"]

def claim(ok, confirmed, designed):
    return confirmed if ok else designed + " (testing in progress)"

W, H = A4
pdf = canvas.Canvas(str(OUT), pagesize=A4)
pdf.setTitle("VenGuard fact sheet")
pdf.setFillColor(CARBON); pdf.rect(0, H - 120, W, 120, stroke=0, fill=1)
pdf.setFillColor(HAZARD); pdf.rect(0, H - 124, W, 4, stroke=0, fill=1)
pdf.setFillColor(HexColor("#FFFFFF")); pdf.setFont("Helvetica-Bold", 28); pdf.drawString(48, H - 70, "VenGuard")
pdf.setFont("Helvetica", 13); pdf.drawString(48, H - 95, "Safety that acts.  Fact sheet, October 2026")

y = H - 165
def heading(t):
    global y
    pdf.setFillColor(CARBON); pdf.setFont("Helvetica-Bold", 14); pdf.drawString(48, y, t); y -= 22
def line(t, bullet=True):
    global y
    pdf.setFillColor(CARBON); pdf.setFont("Helvetica", 11)
    words, cur = t.split(), ""
    first = True
    for w in words:
        if pdf.stringWidth(cur + " " + w, "Helvetica", 11) > W - 120:
            pdf.drawString(66 if not (bullet and first) else 48, y, ("•  " if bullet and first else "") + cur.strip()); y -= 16; cur = ""; first = False
        cur += " " + w
    pdf.drawString(66 if not (bullet and first) else 48, y, ("•  " if bullet and first else "") + cur.strip()); y -= 20

heading("What it is")
line("An automatic gas shut-off kit for LPG kitchens in Bangladesh: a gas detector, an automatic valve, an active ventilation relay and batteries. When it confirms a leak, it closes the gas by itself and switches on the exhaust fan, even with nobody home.", False)
y -= 6
heading("Key facts")
line(claim(c["no_power_needed_confirmed"], "Works without mains power (battery operated).", "Designed to work without mains power (battery operated)"))
line(claim(c["no_internet_needed_confirmed"], "Works without internet; all protection happens in the device.", "Designed to work without internet; all protection happens in the device"))
line(claim(c["closes_under_1s_confirmed"], "Closes the valve in under 1 second after a confirmed leak.", "Designed to close the valve in under 1 second after a confirmed leak"))
line(claim(c["ventilation_relay_confirmed"], "Switches on the kitchen exhaust fan to clear the gas (fan needs mains power).", "Designed to switch on the kitchen exhaust fan to clear the gas (fan needs mains power)"))
line("A 7-second confirmation check avoids false alarms from brief cooking smells.")
line("Manual reset in about 10 seconds; gas never turns back on by itself.")
line("No change to gas pipes and no special tools needed to install.")
y -= 6
heading("Pricing")
pre = SITE["preorder"]
line(f"Complete Home kit (detector, ventilation relay, valve): BDT {pre['kit_price_bdt']:,}, one-time purchase. Core safety is never paywalled.")
line(f"Modular: detector + relay BDT {pre['detector_relay_bdt']:,}; valve added later BDT {pre['valve_addon_bdt']:,}.")
line(f"Pre-order deposit: BDT {pre['deposit_bdt']:,}, fully refundable before delivery.")
line(f"Connected (optional): BDT {pre['connected_plan_bdt_per_year']:,} per year for remote close, alerts and a landlord dashboard.")
y -= 6
heading("Status")
certs = ", ".join(SITE["certifications_granted"]) or "none granted yet; pathway: BUET BRTC test report, then BTRC, Department of Explosives and BSTI"
line("Working prototype built. Safety and reliability testing under way. Pre-orders open.")
line("Certifications: " + certs + ".")
y -= 6
heading("Who it is for")
line("Homes, restaurants, landlords and building developers. Agro (poultry) and Marine versions are planned.")
y -= 6
heading("Contact")
k = SITE["contact"]  # only real details are printed; empty fields are left out
details = [f"WhatsApp / phone: {k['phone_display']}" if k.get("phone_display") else "", f"Email: {k['email']}" if k.get("email") else ""]
if any(details):
    line("    ".join(d for d in details if d), False)
line(SITE["base_url"], False)

pdf.setFillColor(STEEL); pdf.setFont("Helvetica", 8.5)
pdf.drawString(48, 36, "We state only what testing supports. Claims marked 'designed to' are being tested. Certification marks are shown only once granted.")
pdf.save()
print("Wrote", OUT)
