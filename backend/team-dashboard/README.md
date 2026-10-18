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

Roles: **founder** (everything except the team list), **support** (add and update orders, notes), **marketing** (view and export).
Only the company account that owns the script (oasisnextbd@gmail.com) adds or removes team members, and it
always stays on the team as founder, so nobody can lock the company out.

**Where it lives:** <https://oasisnextbd.github.io/OASIS_official_website/team/>, a page built from
`Index.html` by `scripts/build.py`. It is not linked from the website and asks search engines not to
index it. Anyone can load the page, but it shows nothing until they sign in.

**Who gets in:** a person clicks **Sign in with Google** and picks an account in Google's account
chooser, so a browser with several Google accounts is fine and no Incognito window is needed. Sign-in
goes through Firebase Auth in the `venguard-connected` project, the same one the app uses. Every request
then goes to the Apps Script web app (`Dashboard.gs`) with a Firebase ID token. The script asks Google
whether the token is genuine and lets the request through only if that email is on the **Team** tab
with a role. The company account adds or removes people in **Settings & team**; nobody else can get in.

**Data:** the script runs as the company account, so it is the only thing that reads or writes the
**VenGuard Leads** Google Sheet. Team members never need access to the Sheet itself. Everything is free:
Apps Script, the Sheet and Firebase Auth on the Spark plan.

`Index.html` also opens on its own in a browser with example data, for demos and design changes.

Look: the same palette, fonts (Inter, Noto Sans Bengali) and Day/Night themes as the customer website, with a
Day/Night switch in the side rail, and the new VenGuard logo (reversed on the navy rail; symbol only on phones).
The browser-tab icon is the website's favicon. Keep it in step with `venguard/assets/css/venguard.css`.

## Set up (once, about 10 minutes, on a computer)

Do every step signed in as the **company** Google account, so the company owns the Sheet and the script.

1. Go to <https://sheets.new>, name the new spreadsheet **VenGuard Leads**, and copy its ID:
   the long part of its address between `/d/` and `/edit`.
2. Go to <https://script.google.com> → **New project**. Name it `VenGuard Dashboard`.
3. Replace everything in `Code.gs` with `Dashboard.gs`. (`Index.html` is not needed in the project; the
   page is hosted with the website.) In **Project Settings**, tick *Show "appsscript.json"*, then paste `appsscript.json` into it.
4. In **Project Settings → Script properties**, add the property `SHEET_ID` with the ID from step 1.
5. In the editor, choose `getBootstrap` in the function list and click **Run**. Allow the permissions:
   *Advanced → Go to VenGuard Dashboard*. This makes the company account the first **founder**.
6. **Deploy → New deployment → Web app**: *Execute as: **Me***, *Who has access: **Anyone***. Deploy,
   then copy the Web app URL (it ends in `/exec`).
7. Put that URL in `hosted.json` as `endpoint`, then build and publish the website (`scripts/build.py`).
8. Open <https://oasisnextbd.github.io/OASIS_official_website/team/>, sign in with the company account,
   and add each team member's Google email and role in **Settings & team**.

Firebase needs nothing extra. The Google sign-in method is on in the `venguard-connected` project, and
`oasisnextbd.github.io` is in its authorised domains (Authentication → Settings).

## Orders that arrive by WhatsApp or email

Until the website backend is connected, the website hands each order to the customer's WhatsApp or email
with a ready-made message. In **Orders & leads → Add order**, paste that message and press
**Fill in from message**: the form fills itself (English or Bangla), keeps the website's order number,
and refuses the same order number twice. Orders taken by phone or at a fair go in the same way, by hand.

Updating later: paste the new files, then **Deploy → Manage deployments → ✏ Edit → Version: New version →
Deploy**. The URL stays the same. The Sheet ID is a script property, so pasting a newer `Dashboard.gs` keeps it.

## What the website reads from it

The **Settings** tab of the Sheet holds `preorder_open`, `kit_price_bdt`, `notice_bn`, `notice_en`.
The website endpoint (`../leads-sheet/Code.gs`, `doGet?settings`) shares only these non-personal values;
the site applies them within about 10 minutes (cached per visit). The endpoint also refuses new
pre-orders while `preorder_open` is off.
These settings reach the website only once the website backend is connected (`endpoints.leads` in
`venguard/content/site.json`); before that, saving them changes the Sheet but not the site.

## Speed

Each request opens the Sheet once, the team list is cached for 10 minutes (cleared whenever the team is
changed in the dashboard), a sign-in check is remembered until the token expires, and status and note
changes appear at once and save in the background. Editing the **Team** tab directly in the Sheet can take
up to 10 minutes to apply; use **Settings & team** instead. The first request after a quiet period is
still a few seconds slower while Google starts the script.
