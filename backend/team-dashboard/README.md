# VenGuard team dashboard

The company-side web app: one place for the team to see and work every pre-order and enquiry.

- **Overview**: deposits paid, pre-orders, awaiting payment, paid rate, landlord/restaurant and dealer
  leads; submissions per day; pre-order funnel; sources, districts, dealer codes; a "Needs a call" list
  of anyone waiting more than a day.
- **Orders & leads**: add an order that came by WhatsApp, email, phone or in person (paste the
  website's WhatsApp message to fill the form); search by name, phone, order number, area or dealer code; filter by type,
  status and district; open a lead to WhatsApp or call them, change the status
  (new → payment pending → contacted → deposit paid → installed, or refunded / not interested)
  and add team notes; export CSV.
- **Dealers**: dealer list with codes, leads, pre-orders and paid deposits per dealer; approve dealer
  applications from the website; QR sticker and tracking link for each dealer.
- **Settings & team** (founders): turn pre-orders on/off, set the kit price and a notice bar on the
  website; add or remove team members with a role; activity log of every change.

Roles: **founder** (everything), **support** (update orders and notes), **marketing** (view and export).

It runs on Google Apps Script on top of the same **VenGuard Leads** Google Sheet as the website
backend, so it is free, there is no server to maintain, sign-in is the team's own Google accounts
(with 2-step verification), and the Sheet stays the single source of truth.

`Index.html` also opens on its own in a browser with example data, for demos and design changes.

Look: the same palette, fonts (Inter, Noto Sans Bengali) and Day/Night themes as the customer website, with a
Day/Night switch in the side rail, and the new VenGuard logo (reversed on the navy rail; symbol only on phones).
The browser-tab icon is the website's favicon. Keep it in step with `venguard/assets/css/venguard.css`.

## Set up (once, about 10 minutes, on a computer)

Use the **company** Google account for every step, so the company owns the Sheet and the dashboard.
The dashboard works with an empty Sheet; the website backend (`../leads-sheet/README.md`) can be
connected to the same Sheet later.

1. Go to <https://sheets.new>, name the new spreadsheet **VenGuard Leads**, and copy its ID:
   the long part of its address between `/d/` and `/edit`.
2. Go to <https://script.google.com> → **New project**. Name it `VenGuard Dashboard`.
3. Replace everything in `Code.gs` with the contents of `Dashboard.gs`. In the `CONFIG` block at the top,
   put the Sheet ID in place of `PASTE-THE-SHEET-ID-HERE`. Save.
4. **+ → HTML**, name it `Index`, and paste the contents of `Index.html`. Save.
5. **Project Settings** → tick *Show "appsscript.json"*; open it in the editor and paste `appsscript.json`. Save.
6. **Deploy → New deployment → ⚙ → Web app**: *Execute as: User accessing the web app*,
   *Who has access: Anyone with Google account*. Deploy, then **Authorise access** and allow.
7. Open the Web app URL. The first person to open it becomes a **founder**. Bookmark it.
   Don't put this link on the website; only people on the team list can open it anyway.
8. In **Settings & team**, add each team member's Google email and role. The dashboard gives them
   access to the Sheet automatically.

(Instead of editing `CONFIG`, the Sheet ID can go in **Project Settings → Script properties** as `SHEET_ID`,
with `SITE_URL` alongside; a property wins over `CONFIG`.)

## Orders that arrive by WhatsApp or email

Until the website backend is connected, the website hands each order to the customer's WhatsApp or email
with a ready-made message. In **Orders & leads → Add order**, paste that message and press
**Fill in from message**: the form fills itself (English or Bangla), keeps the website's order number,
and refuses the same order number twice. Orders taken by phone or at a fair go in the same way, by hand.

Updating later: paste the new files, then **Deploy → Manage deployments → Edit → Version: New version**.
The URL stays the same.

## What the website reads from it

The **Settings** tab of the Sheet holds `preorder_open`, `kit_price_bdt`, `notice_bn`, `notice_en`.
The website endpoint (`../leads-sheet/Code.gs`, `doGet?settings`) shares only these non-personal values;
the site applies them within about 10 minutes (cached per visit). The endpoint also refuses new
pre-orders while `preorder_open` is off.
These settings reach the website only once the website backend is connected (`endpoints.leads` in
`venguard/content/site.json`); before that, saving them changes the Sheet but not the site.
