// Team dashboard manual pictures: the dashboard in demo mode (made-up data), with numbered rings.
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mark, unmark } from "./mark.mjs";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
await ctx.route(/fonts\.googleapis|cdnjs|gstatic|venguard-app\/updates/, (r) => r.abort());
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
const shot = async (name, items = []) => { await mark(p, items); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/${name}.png` }); await unmark(p); console.log("shot", name); };
const go = async (view) => { await p.locator(`#nav [data-view="${view}"]`).click(); await p.waitForTimeout(500); await p.evaluate(() => scrollTo(0, 0)); };
const closeDrawer = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(250); };
const hideDemo = () => p.evaluate(() => document.querySelectorAll("#main > .banner").forEach((e) => { if (/Demo data/.test(e.textContent)) e.remove(); }));
const drawer = p.locator(".drawer");

await p.goto("http://localhost:8765/team/?demo");
await p.waitForTimeout(800);
await shot("01-signin", [[p.getByRole("button", { name: "Sign in with Google" }), 1]]);
await p.getByRole("button", { name: "Sign in with Google" }).click();
await p.waitForSelector("#me strong");
await p.evaluate(async () => {
  const m = await import("/team/js/store.js");
  await m.saveSettings("company", { legal_name: "OASIS Next (example)", address: "Dhaka (example)", invoice_prefix: "INV" });
});
await p.waitForTimeout(400); await hideDemo();
await shot("02-overview", [[p.locator("#nav"), 1, 4], [p.locator("#me"), 2, 4]]);
await p.locator("#me").click(); await p.waitForTimeout(400); await hideDemo();
await shot("28-profile", [[p.locator('[data-act="profile:name"]'), 1], [p.locator('#main .seg'), 2, 4], [p.locator('#main [data-act="signout"]'), 3]]);

await go("orders"); await hideDemo();
await shot("03-orders", [[p.getByRole("button", { name: "Add order" }), 1], [p.locator('#main input[type="search"], #main input[data-input]').first(), 2], [p.locator('tr[data-act="order:open"]').first(), 3, 2]]);
await p.locator('tr[data-act="order:open"]').first().click(); await p.waitForTimeout(400);
await shot("04-order", [[drawer.locator('select[name="status"]'), 1], [drawer.locator('textarea[name="team_notes"]'), 2], [drawer.getByRole("button", { name: "Save changes" }), 3], [drawer.getByRole("button", { name: "Create invoice" }), 4]]);
await closeDrawer();
await p.getByRole("button", { name: "Add order" }).click(); await p.waitForTimeout(400);
await drawer.locator("#a_msg").fill("VenGuard pre-order\nOrder: VG-261019-7KQ2\nName: Nasrin Akter\nPhone: 01711000000\nArea: Uttara\nDistrict: Dhaka\nPackage: Complete kit");
await drawer.getByRole("button", { name: "Fill in from message" }).click(); await p.waitForTimeout(300);
await shot("05-add-order", [[drawer.locator("#a_msg"), 1], [drawer.getByRole("button", { name: "Fill in from message" }), 2], [drawer.locator('input[name="name"]'), 3]]);
await closeDrawer();

await p.locator('tr[data-act="order:open"]').first().click(); await p.waitForTimeout(300);
await drawer.getByRole("button", { name: "Create invoice" }).click(); await p.waitForTimeout(500);
await shot("06-invoice-new", [[drawer.locator("table, .lines").first(), 1, 4], [drawer.locator('input[name="promo_code"], input[name="promo"]').first(), 2], [drawer.getByRole("button", { name: "Issue invoice" }), 3]]);
await drawer.getByRole("button", { name: "Issue invoice" }).click(); await p.waitForTimeout(800);
await closeDrawer();
await go("invoices"); await hideDemo();
const firstInv = p.locator('#main tr[data-act]').first();
await shot("07-invoices", [[p.getByRole("button", { name: "New invoice" }), 1], [firstInv, 2, 2]]);
if (await firstInv.count()) { await firstInv.click(); await p.waitForTimeout(400);
  await shot("08-invoice", [[drawer.getByRole("button", { name: "Print / save PDF" }), 1], [drawer.getByRole("button", { name: "Change" }), 2], [drawer.locator('form[data-form="inv:pay"]'), 3, 2]]);
  await closeDrawer(); }

await go("inventory"); await hideDemo();
await shot("09-inventory", [[p.getByRole("button", { name: "Stock in / out" }), 1], [p.getByRole("button", { name: "Add item" }), 2], [p.getByRole("button", { name: "Add package" }), 3]]);
await p.getByRole("button", { name: "Stock in / out" }).click(); await p.waitForTimeout(400);
await shot("10-stock", [[drawer.locator("select").first(), 1], [drawer.locator('input[type="number"], input[inputmode="numeric"]').first(), 2], [drawer.locator('button[type="submit"]'), 3]]);
await closeDrawer();

await go("promos"); await hideDemo();
await shot("11-promos", [[p.getByRole("button", { name: "New code" }), 1]]);
await go("marketing"); await hideDemo();
await shot("12-marketing", [[p.getByRole("button", { name: "Add a cost" }), 1]]);
await go("ratings"); await hideDemo();
await shot("21-ratings", [[p.locator("#main .seg"), 1, 4], [p.locator("#main .kpis"), 2, 6]]);
await p.locator("#main .section-h").evaluate((e) => e.scrollIntoView({ block: "start" })); await p.waitForTimeout(300);
await shot("22-ratings-list", [[p.locator("#main tbody tr").first(), 1, 2], [p.locator('[data-act="rt:del"]').first(), 2]]);
await go("dealers"); await hideDemo();
await shot("13-dealers", [[p.getByRole("button", { name: "Add dealer" }), 1], [p.locator('[data-act="dealer:qr"]').first(), 2]]);
await go("subscriptions"); await hideDemo();
await shot("14-subscriptions", [[p.getByRole("button", { name: "Add subscription" }), 1], [p.locator('tr[data-act="sub:open"]').first(), 2, 2]]);

// Emulators: sample data for the picture only (demo mode cannot run them).
await p.evaluate(async () => {
  const m = await import("/team/js/store.js");
  m.S.db.kind = "firebase";
  m.S.data.team.push({ id: "founder2@gmail.com", email: "founder2@gmail.com", name: "Second founder", role: "founder", active: true });
  m.S.data.emulators = [
    { id: "VG-EMU01", device_id: "VG-EMU01", code: "5QGB8XHQVRDM", kit: "complete", assigned_to: "oasisnextbd@gmail.com", ready: true },
    { id: "VG-EMU02", device_id: "VG-EMU02", code: "K7Q2M9XW4TPA", kit: "complete", assigned_to: "founder2@gmail.com", ready: true },
  ];
  const e = await import("/team/js/emulator.js");
  const fake = { async deviceSession() { return { set: async () => {}, push: async () => {}, remove: async () => {}, removeOnDisconnect: async () => {}, onValue: () => () => {}, onChildAdded: () => () => {}, serverTime: () => 0, close: async () => {} }; } };
  await e.startEmulator(fake, m.S.data.emulators[0]);
});
await go("emulators"); await hideDemo();
const card = p.locator('.emu[data-emu="VG-EMU01"]');
await shot("15-emulators", [[p.getByRole("button", { name: "Create emulator" }), 1], [card.locator(".sub").first(), 2, 2], [card.locator("select"), 3], [card.locator('[data-act="emu:power"]'), 4], [card.locator('[data-do="leak"]'), 5]]);
await p.evaluate(async () => { const e = await import("/team/js/emulator.js"); await e.act("VG-EMU01", "leak"); });
await p.waitForTimeout(10500);
await shot("16-emulator-leak", [[card.locator(".emu-read"), 1, 4], [card.locator('[data-f="conn"]'), 2], [card.locator(".emu-log"), 3, 2]]);

await go("settings"); await hideDemo();
await shot("17-settings", [[p.locator('[data-act="set:company"]'), 1], [p.locator('[data-act="set:sig"]'), 2], [p.locator('[data-act="set:website"]'), 3], [p.locator('[data-act="set:app"]'), 4]]);
await p.locator('[data-act="set:app"]').click(); await p.waitForTimeout(400);
await shot("18-app-notice", [[drawer.locator('input[name="notice_en"]'), 1], [drawer.locator('input[name="min_version"]'), 2], [drawer.locator('button[type="submit"]'), 3]]);
await closeDrawer();
const team = p.locator('[data-act="set:member"]');
await team.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await shot("19-team", [[team, 1], [p.locator('[data-act="set:memberedit"]').first(), 2]]);
await team.click(); await p.waitForTimeout(400);
await shot("20-add-person", [[drawer.locator('input[type="email"], input[name="email"]').first(), 1], [drawer.locator("select").first(), 2], [drawer.locator('button[type="submit"]'), 3]]);
await closeDrawer();

// Tasks (company account): review, people and online status, assign, HR summary
await go("tasks"); await hideDemo();
await shot("25-tasks", [[p.getByRole("button", { name: "Assign a task" }), 1], [p.locator('[data-act="task:approve"]').first(), 2], [p.locator('[data-act="task:back"]').first(), 3], [p.locator(".online-dot").first(), 4, 6]]);
await p.getByRole("button", { name: "Assign a task" }).click(); await p.waitForTimeout(400);
await p.fill("#f_title", "Prepare the BUET test samples"); await p.selectOption("#f_assignee", "support@example.com"); await p.selectOption("#f_kind", "milestone");
await shot("26-assign-task", [[drawer.locator("#f_title"), 1], [drawer.locator("#f_assignee"), 2], [drawer.locator("#f_kind"), 3], [drawer.locator("#f_due"), 4], [drawer.locator('button[type="submit"]'), 5]]);
await closeDrawer();
await p.locator('[data-change="task:month"]').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 200)); await p.waitForTimeout(300);
await shot("27-hr-summary", [[p.locator('[data-change="task:month"]'), 1], [p.locator('[data-act="task:csv"]'), 2]]);

// My work, as a support person (the menu label and Overview change for everyone but the company account)
await p.evaluate(async () => { const m = await import("/team/js/store.js"); m.S.me = { email: "support@example.com", name: "Support desk", role: "support", owner: false }; });
await go("overview"); await hideDemo();
await p.evaluate(async () => { const { R } = await import("/team/js/redraw.js"); R.renderMe(); });
await shot("23-mywork", [[p.locator('[data-act="task:submit"]').first(), 1]]);
await p.locator('[data-act="task:submit"]').first().click(); await p.waitForTimeout(400);
await p.fill("#f_note", "Called 6 leads; notes are in each order.");
await drawer.locator("#f_files").setInputFiles({ name: "call-log.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
await shot("24-submit", [[drawer.locator("#f_note"), 1], [drawer.locator("#f_files"), 2], [drawer.locator("#f_link"), 3], [drawer.locator('button[type="submit"]'), 4]]);
await closeDrawer();
await b.close();
