# VenGuard team dashboard

The company's admin website: orders, invoices, stock, promo codes, marketing costs, dealers and the team.
It is published at **<https://oasisnextbd.github.io/OASIS_official_website/team/>**. Nothing on the public
website links to it, and search engines are told not to list it. Anyone can load the page, but it shows
nothing until they sign in.

## Who gets in

- People click **Sign in with Google** and pick an account in Google's account chooser, so several Google
  accounts in one browser are fine.
- Only Google accounts on the team list get in. The **company account** (`oasisnextbd@gmail.com`) is always
  the owner. It alone adds or removes people, and nobody can remove it.
- The rules are enforced by the database itself, in `backend/connected-firebase/firestore.rules` (the
  "Team dashboard" part), not only by hiding buttons. Tests: `backend/connected-firebase/rules-test/firestore.test.mjs`.

| Role | Can |
|---|---|
| Owner (company account) | everything, including the team list |
| Founder | everything except the team list: orders, invoices (including cancelling), stock, packages, promo codes, costs, dealers, company details, signatures, website settings |
| Support | add and update orders; issue, change and re-sign invoices; record payments; stock in and out |
| Marketing | promo codes and marketing costs; sees everything else |

## What it does

- **Orders & leads**:
  - Every pre-order and enquiry. The website's forms save straight into this database (rules allow a
    visitor to create one order and nothing else). A new website order shows a message, and the count
    of new orders appears in the browser tab while the dashboard is open.
  - If a customer's save fails (no internet), the website hands the order to WhatsApp or email instead.
    **Add order** pastes that message, or one from a call or fair, and fills the form by itself
    (English or Bangla).
  - Search, filter, change the status, add notes, export or import CSV (e.g. from the old Google Sheet).
- **Invoices**:
  - **Create invoice** from an order (or **New invoice**), then print it or save it as a PDF (the Print
    dialog → *Save as PDF*).
  - Invoice numbers go `INV-2026-0001`, `INV-2026-0002`, … and are never reused.
  - Promo code, other discount, delivery or installation charge, and VAT (if a rate is set in Settings).
    Payments are recorded as they come in.
  - **Change** saves a new revision with a reason. **Cancel** (founders only) keeps the number, marked as
    cancelled. Every step is in the invoice's history.
  - **Management changes:** add the new person under Settings → Authorised signature and put them *in use*.
    New invoices carry their signature. An existing invoice shows a button to re-issue it with the new
    signature. A saved signature can never be altered, so old invoices keep the one they were signed with.
- **Inventory**:
  - Items (detector, valve, relay) and packages made of them (complete kit, detector + relay, valve add-on).
  - Issuing an invoice takes stock by itself; changing or cancelling it puts the difference back.
  - **Stock in / out** covers deliveries, returns, damage and samples.
  - Every movement is listed, and there is a running-low warning.
- **Promo codes**:
  - Percent or taka off, start and end dates, and a maximum number of uses.
  - A use is counted when an invoice with the code is issued, and given back if the invoice is cancelled.
  - The website's pre-order form checks a code is running before the order is sent (it can read one
    active code, never the list). The code is saved on the order and filled in when you create its invoice.
- **Marketing costs**:
  - What was spent per channel.
  - Orders, paying customers and invoiced sales per channel, cost per order, cost per paying customer,
    and taka back per taka spent.
- **Dealers**: dealer list, QR sticker and link per dealer, applications from the website.
- **Subscriptions & renewals**: every service the company uses (domain, hosting, SMS, design tools…) with
  its cost, billing cycle, next renewal date, who pays and with what. A warning shows on Overview and in
  the menu before each renewal (30 days by default, set per service). **Mark as renewed** records the
  payment and moves the date on. Totals per month and per year. Founders edit; everyone can see it.
  Never store passwords here, only which account is used.
- **Settings & team**: company details for invoices, authorised signatures, website switches (pre-orders
  on or off, price shown, notice bar: the website reads them within 10 minutes), the team
  list, and an activity log of every change.

Everything updates live for everyone who is signed in. A copy is kept on each computer so the dashboard
opens at once; signing out deletes that copy.

## How it is built

Plain HTML, CSS and JavaScript modules, with no build step and no npm. `scripts/build.py` copies this
folder to `_site/team/` and puts `config.json` into the page.

| File | What it is |
|---|---|
| `index.html` | the page shell (rail, main area, drawer) |
| `css/dashboard.css` | styles: the website's palette, fonts and Day/Night themes; the printed invoice at the end |
| `js/app.js` | start-up, sign-in, navigation, live redraw; the list of sections (`VIEWS`) |
| `js/store.js` | state and **every** change the team can make (orders, invoices, stock, promos, costs, team) |
| `js/calc.js` | money and stock rules with no screen code: invoice totals, promo validity, stock needs |
| `js/db-firebase.js` | Firebase Auth + Firestore (project `venguard-connected`); `js/db-demo.js` is the same interface with made-up data |
| `js/ui.js` | helpers: formatting, the side drawer, toasts, icons, click/form delegation (`on.act`, `on.form`, `on.input`) |
| `js/views/*.js` | one file per section; each exports `{ id, label, icon, deps, render() }` |
| `config.json` | owner email, website URL, Firebase web config (public values, not secrets) |
| `tests/calc.test.mjs` | `node --test team-dashboard/tests/calc.test.mjs` |

Collections in Firestore: `team`, `orders`, `invoices`, `counters`, `inventory`, `stockMoves`, `products`,
`promos`, `marketing`, `dealers`, `subscriptions`, `signatories`, `settings` (`company`, `website`) and `activity`.

To add a section, write `js/views/name.js` and add it to `VIEWS` in `js/app.js`. Put any new database write
in `store.js`, and give it a rule in `firestore.rules` with a test.

### Try it without Firebase

```
python3 scripts/build.py && python3 -m http.server 8000 -d _site
```

Open <http://localhost:8000/team/?demo>, which uses made-up data and saves nothing.

### Testing against the real rules

The Firebase emulators need Java. Run this in `backend/connected-firebase/rules-test`:

```
npm install
npm run test:firestore
```

## Setting it up (once, in the Firebase console, company account)

1. <https://console.firebase.google.com> → project **venguard-connected** → **Firestore Database** →
   **Create database**. Location: **asia-south1 (Mumbai)**. Choose **production mode**.
2. **Rules** tab: replace everything with `backend/connected-firebase/firestore.rules`, then **Publish**.
3. Open the dashboard and sign in with the company account. It becomes the owner. Then:
   - Settings → **Company details**.
   - Settings → **Authorised signature**.
   - Inventory → **Add the VenGuard devices**, then **Stock in / out** with what you have.
   - Settings → **Team** → add people.

Google sign-in is already on in the project, and `oasisnextbd.github.io` is an authorised domain.
Everything stays on the free Spark plan.

The earlier Apps Script dashboard (on the Google Sheet) has been replaced. Its orders can be brought in
with **Orders → Import CSV**.
