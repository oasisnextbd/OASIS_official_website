/* Manual: how to use the dashboard, step by step with pictures (manual/*.webp: the dashboard with
   made-up data; numbered rings = what to press, matching the numbered steps). Each person sees the
   edition for their role; founders also get emulators, testing the app and the app settings.
   The customer guide to the app is on the website (VENGuard/app-guide/); its pictures are reused here. */

import { esc, ICON } from "../ui.js";
import { S } from "../store.js";

// Picture sizes are fixed (dashboard 1100×688, app 540×1171) so the page does not jump while they load.
const APP = "../VENGuard/assets/img/app-guide/en/";
const M = "manual/";

// who: roles that see the section ("owner" = the company account only).
const SECTIONS = [
  { id: "start", title: "Signing in and finding your way", who: ["founder", "support", "marketing", "guest"],
    steps: [
      "Open the dashboard link and press <b>Sign in with Google</b> (picture 1, 1). Choose the Google account the company account added to the team; other accounts are refused.",
      "The sections you can use are on the left (picture 2, 1). A number next to a section means something needs you: new orders, low stock, a renewal.",
      "Your name and role are at the top left, under the logo (2; the round badge at the top right on a phone). Press it for your <b>Profile</b> (picture 3): correct your name (1), choose Day, Night or Automatic (2), see what your role may do and your work this month, and <b>Sign out</b> (3). Sign out on shared computers: it also deletes the copy of the data kept in this browser.",
      "Your role decides what you can change; everything else you can only look at.",
    ],
    pics: [[M + "01-signin.webp", "Team sign-in page"], [M + "02-overview.webp", "Overview with the menu and your profile button marked"], [M + "28-profile.webp", "Your profile"]] },

  { id: "mywork", title: "My work: your tasks", who: ["founder", "support", "marketing", "guest"],
    steps: [
      "The company account gives you tasks: for <b>today</b>, <b>this week</b>, <b>this month</b>, or a <b>milestone</b>. They are at the top of Overview and under <b>My work</b> in the menu (picture 1). The number next to My work is how many are still to do.",
      "Overdue tasks have a dashed border and come first. A task <b>sent back</b> shows the company account's note: fix it, then submit again.",
      "When a task is done press <b>Submit as done</b> (1). Write what you did (picture 2, 1), attach the proof (2): a PDF, Word or Excel file, a CSV, a text file or photos, up to 5 files of 700 KB each (photos are made smaller automatically), or paste a link to a bigger file such as a Google Drive folder (3). Then <b>Submit</b> (4). The company account approves it or sends it back.",
      "Your online status (whether your dashboard is open) is visible to the company account, and nothing else about what you do. Your Profile says so too.",
    ],
    pics: [[M + "23-mywork.webp", "My work on Overview"], [M + "24-submit.webp", "Submit as done"]] },

  { id: "tasks", title: "Tasks and who is online (company account only)", who: ["owner"],
    steps: [
      "Menu → <b>Tasks</b>. <b>Assign a task</b> (picture 1, 1): what to do (picture 2, 1), who it is for (2), daily, weekly, monthly or milestone (3), the due date (4), then <b>Assign</b> (5). It appears on their Overview at once.",
      "Submitted tasks wait in <b>Waiting for your review</b>: read their note, open the attached files or link (click a file to open or download it), then <b>Approve</b> (picture 1, 2) or <b>Send back</b> (3) with what needs to change. Deleting a task also deletes its files.",
      "<b>People</b> (4): who is at the dashboard right now (Online now, or when they were last seen) and each person's tasks to do, overdue and to review. Click a person to open their profile. Overview also shows who is online.",
      "Click a task in <b>All tasks</b> to change or delete it. <b>Monthly summary (for HR)</b> (picture 3): pick the month (1) and <b>Export CSV</b> (2) for a spreadsheet: assigned, on time, late, approved, sent back, overdue.",
    ],
    pics: [[M + "25-tasks.webp", "Tasks for the company account"], [M + "26-assign-task.webp", "Assign a task"], [M + "27-hr-summary.webp", "Monthly summary for HR"]] },

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

  { id: "ratings", title: "Ratings from the website", who: ["founder", "support", "marketing"],
    steps: [
      "Visitors rate the VenGuard device, the website and our service and support with 1 to 5 stars at the bottom of every website page. One tap saves it; there is no form, name or phone number. They arrive in <b>Ratings</b> straight away.",
      "Choose the period (picture 1, 1). The boxes (2) show how many people rated, and the average for each of the three with how many people gave it. Below them, how the stars are spread and which pages people rated from.",
      "With fewer than ten ratings the page says so: read each rating (picture 2, 1) rather than the average. A visitor who changes their stars updates their own row; they are not counted twice.",
      "Founders can <b>Delete</b> obvious spam (picture 2, 2). It cannot be undone, so keep honest low ratings: they show what to improve.",
    ],
    pics: [[M + "21-ratings.webp", "Ratings: period and the averages"], [M + "22-ratings-list.webp", "Each rating, with Delete for founders"]] },

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

  { id: "emulators", title: "Emulators: test devices", who: ["founder", "guest"],
    steps: [
      "An emulator acts exactly like a real VenGuard (detector, valve, relay) through the same database and rules. Each founder (or guest tester) has one; only they and the company account see it.",
      "Company account: <b>Create emulator</b> (picture 1, 1), then choose the founder or guest in <b>Assigned to</b> (3).",
      "Your card shows its <b>device ID</b> and <b>sticker code</b> (2): add it in the app with those (see Testing the app).",
      "Press <b>Start</b> (4). Keep this page open while you test; <b>Stop</b> it or close the page and the app shows the device offline within seconds.",
      "<b>Start a leak</b> (5) and watch your phone: the app turns red, then shows Gas is mitigated. The card shows gas, valve, fan, alarm and battery (picture 2, 1), the state (2) and a log of everything it did, including \"Close the gas now\" from the app (3).",
      "Also: <b>Lift the reset lever</b> after a leak, <b>Low battery</b>, <b>Test button</b>, <b>Go offline</b>.",
    ],
    pics: [[M + "15-emulators.webp", "Emulators section"], [M + "16-emulator-leak.webp", "An emulator during a leak"]] },

  { id: "testing", title: "Testing the app as a customer", who: ["founder", "guest"],
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
      "Settings → Team → <b>Add person</b> (picture 1, 1): their Google account email (picture 2, 1), name, and role (2): Founder, Support, Marketing or <b>Guest</b>. <b>Add to team</b> (3).",
      "<b>Guest</b> is for people outside the company, such as an engineer reviewing the product or a tester: they see only the emulator you assign them, their tasks and this manual, never orders, customers, invoices or settings. Give guests an <b>Access ends</b> date: after that day they can't sign in or read anything, even if you forget to remove them.",
      "They sign in with exactly that Google account. <b>Change</b> (picture 1, 2) edits the role or end date; <b>Remove from team</b> locks them out at once.",
      "Only the company account manages the team, and it can't be removed.",
    ],
    pics: [[M + "19-team.webp", "Team list"], [M + "20-add-person.webp", "Add a person"]] },
];

/** Wide screens show the contents open beside the manual; phones get a folded "Contents" button that scrolls away. */
const wideScreen = () => matchMedia("(min-width: 961px)").matches;
const EDITION = { owner: "Company account edition", founder: "Founder edition", support: "Support edition", marketing: "Marketing edition", guest: "Guest edition" };
const sees = (s) => s.who.includes(S.me.owner ? "founder" : S.me.role) || (S.me.owner && s.who.includes("owner"));

export default {
  guest: true, id: "manual", label: "Manual", icon: "manual", deps: [],
  render() {
    const key = S.me.owner ? "owner" : S.me.role;
    const list = SECTIONS.filter(sees);
    return `<div class="topline"><div><h1>Manual</h1>
        <div class="sub">${esc(EDITION[key] || "Team edition")}: the parts of the dashboard your role uses, step by step. In the pictures, the orange rings and numbers show what to press; they match the numbered steps. Pictures use made-up data.</div></div></div>
      <div class="manual">
        <nav class="manual-toc panel tight" aria-label="Manual contents"><details${wideScreen() ? " open" : ""}><summary><strong>Contents</strong><span class="type"> · ${list.length} sections</span></summary><ol>${list.map((s) => `<li><a href="#m-${s.id}" data-manual="${s.id}">${esc(s.title)}</a></li>`).join("")}</ol>
          <p class="sub">Customers' guide to the app: <a href="../VENGuard/en/app-guide/" target="_blank" rel="noopener">website → How to use the app</a></p></details></nav>
        <div class="manual-body">${list.map((s, i) => `<section class="panel manual-sec" id="m-${s.id}">
          <h2><span class="manual-num">${i + 1}</span>${esc(s.title)}</h2>
          <ol class="manual-steps">${s.steps.map((t) => `<li>${t}</li>`).join("")}</ol>
          <div class="manual-pics">${s.pics.map(([src, alt], n) => `<figure><a href="${src}" data-zoom title="Open larger"><img src="${src}" alt="${esc(alt)}" ${src.startsWith(APP) ? 'width="540" height="1171"' : 'width="1100" height="688"'} loading="lazy"></a><figcaption>Picture ${n + 1}: ${esc(alt)}</figcaption></figure>`).join("")}</div>
        </section>`).join("")}</div></div>`;
  },
};

// Contents links: scroll within the page (the address bar keeps the section name).
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-manual]");
  if (!a) return;
  e.preventDefault();
  const list = a.closest("details");
  if (list && !wideScreen()) list.open = false;   // phones: fold the contents again
  document.getElementById("m-" + a.dataset.manual)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* Pictures open larger over the manual, never in a new tab: close with ✕, Esc, a click beside the
   picture, or the browser's / phone's Back button (opening adds a history step, closing removes it). */
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-zoom]");
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;   // Ctrl/Cmd-click still opens a tab on purpose
  e.preventDefault();
  zoom(a.getAttribute("href"), a.querySelector("img")?.alt || "");
});
function zoom(src, alt) {
  let d = document.getElementById("zoom");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "zoom";
    d.className = "zoom";
    d.innerHTML = `<button type="button" class="zoom-x" aria-label="Close picture">✕</button><figure><img alt=""><figcaption></figcaption></figure>`;
    document.body.append(d);
    d.addEventListener("click", (ev) => { if (ev.target === d || ev.target.closest(".zoom-x")) d.close(); });
    d.addEventListener("close", () => { if (history.state?.zoom) history.back(); });
    window.addEventListener("popstate", () => { if (d.open) d.close(); });
  }
  d.querySelector("img").src = src;
  d.querySelector("img").alt = alt;
  d.querySelector("figcaption").textContent = alt;
  d.showModal();
  history.pushState({ zoom: true }, "");
}
