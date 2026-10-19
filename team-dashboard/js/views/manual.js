/* Manual: how to use the dashboard, step by step with pictures (manual/*.webp: the dashboard with
   made-up data; numbered rings = what to press, matching the numbered steps). Each person sees the
   edition for their role; founders also get emulators, testing the app and the app settings.
   The customer guide to the app is on the website (VENGuard/app-guide/); its pictures are reused here. */

import { esc, ICON } from "../ui.js";
import { S } from "../store.js";

const APP = "../VENGuard/assets/img/app-guide/en/";
const M = "manual/";

// who: roles that see the section ("owner" = the company account only).
const SECTIONS = [
  { id: "start", title: "Signing in and finding your way", who: ["founder", "support", "marketing"],
    steps: [
      "Open the dashboard link and press <b>Sign in with Google</b> (picture 1, 1). Choose the Google account the company account added to the team; other accounts are refused.",
      "The sections you can use are on the left (picture 2, 1). A number next to a section means something needs you: new orders, low stock, a renewal.",
      "Your name and role are at the bottom left (2). Your role decides what you can change; everything else you can only look at.",
      "Switch Day and Night here (3). <b>Sign out</b> on shared computers: it also deletes the copy of the data kept in this browser.",
    ],
    pics: [[M + "01-signin.webp", "Team sign-in page"], [M + "02-overview.webp", "Overview with the menu, your role and the theme button marked"]] },

  { id: "orders", title: "Orders and leads", who: ["founder", "support"],
    steps: [
      "Every pre-order, enquiry and dealer application from the website arrives here by itself, with a message and a count in the browser tab.",
      "Search by name, phone, order number, area, dealer or promo code (picture 1, 2). Click a row to open it (3).",
      "In the order: change the <b>Status</b> as it moves on (picture 2, 1), write <b>Team notes</b> such as calls and promises (2), then <b>Save changes</b> (3). <b>Create invoice</b> starts its invoice (4).",
      "An order that came by WhatsApp, email, phone or a fair: <b>Add order</b> (picture 1, 1), paste the message (picture 3, 1), press <b>Fill in from message</b> (2), check the filled fields (3) and save.",
      "<b>Export CSV</b> and <b>Import CSV</b> are at the top for spreadsheets.",
    ],
    pics: [[M + "03-orders.webp", "Orders list"], [M + "04-order.webp", "An open order"], [M + "05-add-order.webp", "Add order filled from a pasted message"]] },

  { id: "invoices", title: "Invoices", who: ["founder", "support"],
    steps: [
      "From an order press <b>Create invoice</b>, or use <b>New invoice</b> in Invoices (picture 2, 1). The company details in Settings must be filled in first.",
      "Check the items (picture 1, 1), add a promo code or other discount (2), then <b>Issue invoice</b> (3). Numbers go INV-2026-0001, -0002 … and are never reused. Stock goes down by itself.",
      "Click an invoice in the list (picture 2, 2) to open it: <b>Print / save PDF</b> (picture 3, 1), <b>Change</b> it with a reason (2), or <b>Record a payment</b> as money comes in (3).",
      "Founders can cancel an invoice (at the bottom); the number stays, marked cancelled, and the stock and promo use come back.",
      "When management changes, add the new signature in Settings; old invoices show a button to re-issue them with it.",
    ],
    pics: [[M + "06-invoice-new.webp", "New invoice from an order"], [M + "07-invoices.webp", "Invoices list"], [M + "08-invoice.webp", "An issued invoice"]] },

  { id: "inventory", title: "Stock", who: ["founder", "support"],
    steps: [
      "<b>Stock in / out</b> (picture 1, 1) for deliveries, returns, damage and samples: choose the item (picture 2, 1), the number (2), and <b>Save</b> (3). Every movement is listed with who did it.",
      "Founders add items (2) and packages made of them (3), with the warning level for running low.",
      "Issuing an invoice takes stock by itself; changing or cancelling it puts the difference back.",
    ],
    pics: [[M + "09-inventory.webp", "Stock page"], [M + "10-stock.webp", "Stock in / out form"]] },

  { id: "promos", title: "Promo codes", who: ["founder", "marketing"],
    steps: [
      "<b>New code</b> (1): percent or taka off, start and end dates, and a maximum number of uses.",
      "The website checks that a code is running before an order is sent; the code is saved on the order and filled in on its invoice.",
      "A use counts when an invoice with the code is issued, and comes back if the invoice is cancelled. Open a code to switch it off.",
    ],
    pics: [[M + "11-promos.webp", "Promo codes"]] },

  { id: "marketing", title: "Marketing costs", who: ["founder", "marketing"],
    steps: [
      "<b>Add a cost</b> (1) for every spend: date, channel, campaign, amount.",
      "The page shows orders, paying customers and sales per channel, cost per order and per paying customer, and taka back per taka spent. The channel of an order comes from the website tracking, its \"Came by\" or its dealer code.",
    ],
    pics: [[M + "12-marketing.webp", "Marketing costs"]] },

  { id: "dealers", title: "Dealers", who: ["founder"],
    steps: [
      "<b>Add dealer</b> (1), or approve an application from the website further down.",
      "<b>QR &amp; link</b> (2) gives the dealer's sticker and link; orders that come through them are counted on their row.",
    ],
    pics: [[M + "13-dealers.webp", "Dealers"]] },

  { id: "subscriptions", title: "Subscriptions and renewals", who: ["founder"],
    steps: [
      "<b>Add subscription</b> (1) for every service the company uses: cost, cycle, next renewal, who pays and with what. Never store passwords here.",
      "A warning shows on Overview and in the menu before each renewal. Open a service (2) and press <b>Mark as renewed</b> when it is paid.",
    ],
    pics: [[M + "14-subscriptions.webp", "Subscriptions"]] },

  { id: "emulators", title: "Emulators: test devices for founders", who: ["founder"],
    steps: [
      "An emulator acts exactly like a real VenGuard (detector, valve, relay) through the same database and rules. Each founder has one; only you and the company account see it.",
      "Company account: <b>Create emulator</b> (picture 1, 1), then choose the founder in <b>Assigned to</b> (3).",
      "Your card shows its <b>device ID</b> and <b>sticker code</b> (2): add it in the app with those (see Testing the app).",
      "Press <b>Start</b> (4). Keep this page open while you test; close it and the app shows the device offline within 3 minutes.",
      "<b>Start a leak</b> (5) and watch your phone: the app turns red, then shows Gas is mitigated. The card shows gas, valve, fan, alarm and battery (picture 2, 1), the state (2) and a log of everything it did, including \"Close the gas now\" from the app (3).",
      "Also: <b>Lift the reset lever</b> after a leak, <b>Low battery</b>, <b>Test button</b>, <b>Go offline</b>.",
    ],
    pics: [[M + "15-emulators.webp", "Emulators section"], [M + "16-emulator-leak.webp", "An emulator during a leak"]] },

  { id: "testing", title: "Testing the app as a customer", who: ["founder"],
    steps: [
      "Install the Android app from the website and create an account with your email (the full customer guide: website → How to use the app).",
      "On Home press <b>+</b> (picture 1, 1).",
      "Type your emulator's device ID (picture 2, 1) and sticker code (2), a place name (3) and area (4), then <b>Add device</b> (5).",
      "Start the emulator here and go through the founders' test plan (venguard-app repository: docs/founder-test.md). Report problems in the founders' WhatsApp group with a screenshot, the phone model and the app version from Profile.",
    ],
    pics: [[APP + "03-empty.webp", "App home with the + button"], [APP + "04-add.webp", "Add a VenGuard form"], [APP + "08-alarm.webp", "The app during a leak"]] },

  { id: "settings", title: "Settings", who: ["founder"],
    steps: [
      "<b>Company details on invoices</b> (1): legal name, address, BIN, VAT rate, terms. Needed before the first invoice.",
      "<b>Authorised signature</b> (2): add a signatory and put them in use; saved signatures can never be altered.",
      "<b>Website</b> (3): pre-orders on or off, the price shown, the notice bar. The website reads them within 10 minutes.",
      "<b>VenGuard app</b> (4): a notice shown at the top of the Android app (picture 2, 1, English) and the minimum app version (2), then <b>Save</b> (3). Set a minimum only when a release needs the new APK.",
    ],
    pics: [[M + "17-settings.webp", "Settings"], [M + "18-app-notice.webp", "VenGuard app settings"]] },

  { id: "team", title: "The team (company account only)", who: ["owner"],
    steps: [
      "Settings → Team → <b>Add person</b> (picture 1, 1): their Google account email (picture 2, 1), name, and role (2): Founder, Support or Marketing. <b>Add to team</b> (3).",
      "They sign in with exactly that Google account. <b>Change</b> (picture 1, 2) edits the role; <b>Remove from team</b> locks them out at once.",
      "Only the company account manages the team, and it can't be removed.",
    ],
    pics: [[M + "19-team.webp", "Team list"], [M + "20-add-person.webp", "Add a person"]] },
];

const EDITION = { owner: "Company account edition", founder: "Founder edition", support: "Support edition", marketing: "Marketing edition" };
const sees = (s) => s.who.includes(S.me.owner ? "founder" : S.me.role) || (S.me.owner && s.who.includes("owner"));

export default {
  id: "manual", label: "Manual", icon: "manual", deps: [],
  render() {
    const key = S.me.owner ? "owner" : S.me.role;
    const list = SECTIONS.filter(sees);
    return `<div class="topline"><div><h1>Manual</h1>
        <div class="sub">${esc(EDITION[key] || "Team edition")}: the parts of the dashboard your role uses, step by step. In the pictures, the orange rings and numbers show what to press; they match the numbered steps. Pictures use made-up data.</div></div></div>
      <div class="manual">
        <nav class="manual-toc panel tight" aria-label="Manual contents"><strong>Contents</strong><ol>${list.map((s) => `<li><a href="#m-${s.id}" data-manual="${s.id}">${esc(s.title)}</a></li>`).join("")}</ol>
          <p class="sub">Customers' guide to the app: <a href="../VENGuard/en/app-guide/" target="_blank" rel="noopener">website → How to use the app</a></p></nav>
        <div class="manual-body">${list.map((s, i) => `<section class="panel manual-sec" id="m-${s.id}">
          <h2><span class="manual-num">${i + 1}</span>${esc(s.title)}</h2>
          <ol class="manual-steps">${s.steps.map((t) => `<li>${t}</li>`).join("")}</ol>
          <div class="manual-pics">${s.pics.map(([src, alt], n) => `<figure><a href="${src}" target="_blank" rel="noopener" title="Open larger"><img src="${src}" alt="${esc(alt)}" loading="lazy"></a><figcaption>Picture ${n + 1}: ${esc(alt)}</figcaption></figure>`).join("")}</div>
        </section>`).join("")}</div></div>`;
  },
};

// Contents links: scroll within the page (the address bar keeps the section name).
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-manual]");
  if (!a) return;
  e.preventDefault();
  document.getElementById("m-" + a.dataset.manual)?.scrollIntoView({ behavior: "smooth", block: "start" });
});
