// Firestore security rules for the team dashboard: who may read and change company data.
// Run: npm install && npm run test:firestore   (needs Java for the Firebase emulator)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";

const OWNER = "oasisnextbd@gmail.com";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-venguard",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "team/founder@gmail.com"), { email: "founder@gmail.com", name: "F", role: "founder", active: true });
    await setDoc(doc(db, "team/support@gmail.com"), { email: "support@gmail.com", name: "S", role: "support", active: true });
    await setDoc(doc(db, "team/marketing@gmail.com"), { email: "marketing@gmail.com", name: "M", role: "marketing", active: true });
    await setDoc(doc(db, "team/gone@gmail.com"), { email: "gone@gmail.com", name: "G", role: "founder", active: false });
    await setDoc(doc(db, "team/guest@gmail.com"), { email: "guest@gmail.com", name: "Guest", role: "guest", active: true, until: "2099-12-31", until_ms: 4102444799000 });
    await setDoc(doc(db, "team/expired@gmail.com"), { email: "expired@gmail.com", name: "Old guest", role: "guest", active: true, until: "2020-01-31", until_ms: 1580515199000 });
    await setDoc(doc(db, "orders/VG-261018-AAAA"), { name: "Rahim", phone: "01712345678", status: "new" });
    await setDoc(doc(db, "invoices/INV-2026-0001"), { status: "issued", total: 100 });
    await setDoc(doc(db, "inventory/DET"), { sku: "DET", name: "Detector", stock: 10, unit_cost: 900 });
    await setDoc(doc(db, "promos/EID10"), { code: "EID10", type: "percent", value: 10, active: true, used: 0 });
    await setDoc(doc(db, "promos/OLD5"), { code: "OLD5", type: "percent", value: 5, active: false, used: 3 });
    await setDoc(doc(db, "settings/website"), { preorder_open: true });
    await setDoc(doc(db, "settings/company"), { legal_name: "X" });
    await setDoc(doc(db, "signatories/s1"), { name: "A", title: "CEO", signature: "data:image/png;base64,AAAA", active: true });
  });
});

// A Google sign-in for this email (what Firebase Auth gives the dashboard).
const as = (email, extra = {}) => env.authenticatedContext("uid-" + email, {
  email, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const owner = () => as(OWNER), founder = () => as("founder@gmail.com"), support = () => as("support@gmail.com"),
  marketing = () => as("marketing@gmail.com"), stranger = () => as("stranger@gmail.com"), gone = () => as("gone@gmail.com");
const order = { name: "Karim", phone: "01812345678", status: "new" };

test("strangers, signed-out visitors and removed members read nothing", async () => {
  for (const db of [anon(), stranger(), gone()]) {
    await assertFails(getDoc(doc(db, "orders/VG-261018-AAAA")));
    await assertFails(getDocs(collection(db, "orders")));
    await assertFails(getDoc(doc(db, "settings/company")));
    await assertFails(getDocs(collection(db, "team")));
  }
});

test("an unverified or non-Google sign-in with a team email is refused", async () => {
  await assertFails(getDoc(doc(as("founder@gmail.com", { email_verified: false }), "orders/VG-261018-AAAA")));
  await assertFails(getDoc(doc(as("founder@gmail.com", { firebase: { sign_in_provider: "password" } }), "orders/VG-261018-AAAA")));
  await assertFails(getDoc(doc(as(OWNER, { firebase: { sign_in_provider: "password" } }), "orders/VG-261018-AAAA")));
});

test("every team member can read company data", async () => {
  for (const db of [owner(), founder(), support(), marketing()]) {
    await assertSucceeds(getDocs(collection(db, "orders")));
    await assertSucceeds(getDocs(collection(db, "invoices")));
    await assertSucceeds(getDocs(collection(db, "promos")));
  }
});

test("only the company account adds or removes people, and nobody deletes a member", async () => {
  const m = { email: "new@gmail.com", name: "N", role: "support", active: true };
  await assertFails(setDoc(doc(founder(), "team/new@gmail.com"), m));
  await assertFails(updateDoc(doc(founder(), "team/support@gmail.com"), { active: false }));
  await assertFails(setDoc(doc(founder(), "team/founder@gmail.com"), { email: "founder@gmail.com", role: "founder", active: true, name: "me" }));
  await assertSucceeds(setDoc(doc(owner(), "team/new@gmail.com"), m));
  await assertSucceeds(updateDoc(doc(owner(), "team/support@gmail.com"), { active: false }));
  await assertFails(setDoc(doc(owner(), "team/x@gmail.com"), { ...m, email: "x@gmail.com", role: "boss" }));
  await assertFails(setDoc(doc(owner(), "team/Mixed@gmail.com"), { ...m, email: "Mixed@gmail.com" }));
  await assertFails(deleteDoc(doc(owner(), "team/support@gmail.com")));
});

test("the company account always gets in, even with no team row", async () => {
  await assertSucceeds(getDoc(doc(owner(), "orders/VG-261018-AAAA")));
  await assertSucceeds(setDoc(doc(owner(), "orders/VG-1"), order));
});

test("orders: founders and support write, marketing only reads", async () => {
  await assertSucceeds(setDoc(doc(support(), "orders/VG-2"), order));
  await assertSucceeds(updateDoc(doc(support(), "orders/VG-261018-AAAA"), { status: "contacted" }));
  await assertFails(updateDoc(doc(support(), "orders/VG-261018-AAAA"), { status: "whatever" }));
  await assertFails(setDoc(doc(marketing(), "orders/VG-3"), order));
  await assertFails(deleteDoc(doc(support(), "orders/VG-261018-AAAA")));
  await assertSucceeds(deleteDoc(doc(founder(), "orders/VG-261018-AAAA")));
});

test("website forms: a signed-out visitor can create a valid order and nothing else", async () => {
  const web = { order_id: "VG-261018-WEB1", source: "website", form_type: "preorder", status: "payment_pending", submitted_at: "2026-10-18T10:00:00Z",
    name: "Rahim", phone: "01712345678", area: "Mirpur", district: "Dhaka", package: "complete", units: "1", promo_code: "EID10", utm_source: "facebook" };
  await assertSucceeds(setDoc(doc(anon(), "orders/VG-261018-WEB1"), web));
  await assertFails(getDoc(doc(anon(), "orders/VG-261018-WEB1")));
  await assertFails(updateDoc(doc(anon(), "orders/VG-261018-WEB1"), { status: "paid" }));
  await assertFails(deleteDoc(doc(anon(), "orders/VG-261018-WEB1")));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-WEB2"), { ...web, order_id: "VG-261018-WEB2", status: "paid" }));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-WEB3"), { ...web, order_id: "VG-261018-WEB3", team_notes: "VIP" }));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-WEB4"), { ...web, order_id: "VG-261018-WEB4", phone: "12345" }));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-WEB5"), { ...web, order_id: "VG-261018-XXXX" }));
  await assertFails(setDoc(doc(anon(), "orders/hello"), { ...web, order_id: "hello" }));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-WEB6"), { ...web, order_id: "VG-261018-WEB6", message: "x".repeat(2001) }));
  await assertFails(setDoc(doc(anon(), "orders/VG-261018-AAAA"), { ...web, order_id: "VG-261018-AAAA" }));   // overwriting an order is an update
});

test("invoices: support issues and revises, only founders void, nobody deletes", async () => {
  await assertSucceeds(setDoc(doc(support(), "invoices/INV-2026-0002"), { status: "issued", total: 5 }));
  await assertFails(setDoc(doc(support(), "invoices/INV-2026-0003"), { status: "void" }));
  await assertSucceeds(updateDoc(doc(support(), "invoices/INV-2026-0001"), { total: 200 }));
  await assertFails(updateDoc(doc(support(), "invoices/INV-2026-0001"), { status: "void" }));
  await assertFails(updateDoc(doc(marketing(), "invoices/INV-2026-0001"), { total: 1 }));
  await assertSucceeds(updateDoc(doc(founder(), "invoices/INV-2026-0001"), { status: "void" }));
  await assertFails(updateDoc(doc(support(), "invoices/INV-2026-0001"), { status: "issued" }));
  await assertFails(deleteDoc(doc(founder(), "invoices/INV-2026-0001")));
});

test("stock: support changes only the count; founders manage items; moves are permanent", async () => {
  await assertSucceeds(updateDoc(doc(support(), "inventory/DET"), { stock: 9, updated_at: "now" }));
  await assertFails(updateDoc(doc(support(), "inventory/DET"), { unit_cost: 1 }));
  await assertSucceeds(updateDoc(doc(founder(), "inventory/DET"), { unit_cost: 950 }));
  await assertSucceeds(setDoc(doc(support(), "stockMoves/m1"), { sku: "DET", qty: -1, by: "support@gmail.com" }));
  await assertFails(setDoc(doc(support(), "stockMoves/m2"), { sku: "DET", qty: -1, by: "someone@gmail.com" }));
  await assertFails(updateDoc(doc(founder(), "stockMoves/m1"), { qty: 5 }));
});

test("promo codes: the website can check one active code, not list or see inactive ones", async () => {
  await assertSucceeds(getDoc(doc(anon(), "promos/EID10")));
  await assertFails(getDoc(doc(anon(), "promos/OLD5")));
  await assertFails(getDoc(doc(anon(), "promos/NOPE")));
  await assertFails(getDocs(collection(anon(), "promos")));
  await assertFails(updateDoc(doc(anon(), "promos/EID10"), { used: 0 }));
});

test("promo codes: founders and marketing manage them; support may only count a use", async () => {
  await assertSucceeds(setDoc(doc(marketing(), "promos/NEW20"), { code: "NEW20", active: true, used: 0 }));
  await assertFails(setDoc(doc(marketing(), "promos/lower"), { code: "lower", active: true }));
  await assertFails(setDoc(doc(support(), "promos/SUP"), { code: "SUP", active: true }));
  await assertSucceeds(updateDoc(doc(support(), "promos/EID10"), { used: 1 }));
  await assertFails(updateDoc(doc(support(), "promos/EID10"), { value: 90 }));
});

test("marketing costs: founders and marketing write, support only reads", async () => {
  await assertSucceeds(setDoc(doc(marketing(), "marketing/e1"), { amount: 5000, channel: "facebook" }));
  await assertFails(setDoc(doc(support(), "marketing/e2"), { amount: 1 }));
  await assertSucceeds(getDoc(doc(support(), "marketing/e1")));
});

test("signatures cannot be changed once saved; only founders add signatories", async () => {
  const sig = { name: "B", title: "MD", signature: "data:image/png;base64,BBBB", active: true };
  await assertFails(setDoc(doc(support(), "signatories/s2"), sig));
  await assertSucceeds(setDoc(doc(founder(), "signatories/s2"), sig));
  await assertFails(setDoc(doc(founder(), "signatories/s3"), { ...sig, signature: "javascript:alert(1)" }));
  await assertFails(updateDoc(doc(founder(), "signatories/s1"), { signature: "data:image/png;base64,CCCC" }));
  await assertSucceeds(updateDoc(doc(founder(), "signatories/s1"), { active: false }));
  await assertFails(deleteDoc(doc(founder(), "signatories/s1")));
});

test("settings: website and app settings are public to read; company settings are not; founders write", async () => {
  await assertSucceeds(getDoc(doc(anon(), "settings/website")));
  await assertSucceeds(getDoc(doc(anon(), "settings/app")));
  await assertFails(setDoc(doc(anon(), "settings/app"), { notice_en: "x" }));
  await assertFails(setDoc(doc(support(), "settings/app"), { notice_en: "x" }));
  await assertSucceeds(setDoc(doc(founder(), "settings/app"), { notice_en: "x", min_version: "0.3.0" }));
  await assertFails(getDoc(doc(anon(), "settings/company")));
  await assertFails(setDoc(doc(support(), "settings/website"), { preorder_open: false }));
  await assertSucceeds(setDoc(doc(founder(), "settings/company"), { legal_name: "Y" }));
});

test("subscriptions: founders keep the list, the team can read it", async () => {
  await assertSucceeds(setDoc(doc(founder(), "subscriptions/s1"), { name: "Domain", cost: 1800, cycle: "yearly" }));
  await assertSucceeds(getDoc(doc(support(), "subscriptions/s1")));
  await assertFails(setDoc(doc(support(), "subscriptions/s2"), { name: "x" }));
  await assertFails(updateDoc(doc(marketing(), "subscriptions/s1"), { cost: 1 }));
  await assertFails(getDoc(doc(anon(), "subscriptions/s1")));
});

test("activity log: members add their own entries only, and nobody edits it", async () => {
  await assertSucceeds(setDoc(doc(support(), "activity/a1"), { user: "support@gmail.com", action: "x" }));
  await assertFails(setDoc(doc(support(), "activity/a2"), { user: OWNER, action: "x" }));
  await assertFails(updateDoc(doc(founder(), "activity/a1"), { action: "y" }));
});

test("emulators: the company account manages them; a founder reads only their own; nobody else", async () => {
  const emu = { device_id: "VG-EMU01", email: "vg-emu01@x", password: "p", code: "ABCDEFGHJKMN", kit: "complete", assigned_to: "founder@gmail.com" };
  await assertSucceeds(setDoc(doc(owner(), "emulators/VG-EMU01"), emu));
  await assertSucceeds(setDoc(doc(owner(), "emulators/VG-EMU02"), { ...emu, device_id: "VG-EMU02", assigned_to: "" }));
  await assertFails(setDoc(doc(owner(), "emulators/VG-0001A3"), { ...emu, device_id: "VG-0001A3" }));
  await assertFails(setDoc(doc(owner(), "emulators/VG-EMU03"), { ...emu, device_id: "VG-EMU04" }));
  await assertSucceeds(getDoc(doc(founder(), "emulators/VG-EMU01")));
  await assertFails(getDoc(doc(founder(), "emulators/VG-EMU02")));
  const { query, where } = await import("firebase/firestore");
  await assertSucceeds(getDocs(query(collection(founder(), "emulators"), where("assigned_to", "==", "founder@gmail.com"))));
  await assertFails(getDocs(collection(founder(), "emulators")));
  await assertSucceeds(getDocs(collection(owner(), "emulators")));
  for (const db of [support(), marketing(), stranger(), gone(), anon()]) await assertFails(getDoc(doc(db, "emulators/VG-EMU01")));
  await assertFails(updateDoc(doc(founder(), "emulators/VG-EMU01"), { assigned_to: "x@gmail.com" }));
  await assertSucceeds(updateDoc(doc(owner(), "emulators/VG-EMU01"), { assigned_to: "support@gmail.com" }));
  await assertFails(getDoc(doc(support(), "emulators/VG-EMU01")));   // support is not a founder
  await assertFails(deleteDoc(doc(founder(), "emulators/VG-EMU01")));
  await assertSucceeds(deleteDoc(doc(owner(), "emulators/VG-EMU01")));
});

test("ratings: a signed-out visitor can give and change stars, never read them; the team reads; founders delete", async () => {
  const id = "ratings/R-abcdefghij0123456789";
  const r = { source: "website", website: 5, created_at: "2026-10-19T10:00:00Z", updated_at: "2026-10-19T10:00:00Z", lang: "en", page: "/VENGuard/" };
  await assertSucceeds(setDoc(doc(anon(), id), r));
  await assertSucceeds(setDoc(doc(anon(), id), { ...r, product: 4, service: 3, updated_at: "2026-10-19T10:05:00Z" }));
  await assertFails(setDoc(doc(anon(), id), { ...r, created_at: "2020-01-01T00:00:00Z" }));          // created_at is fixed
  await assertFails(getDoc(doc(anon(), id)));
  await assertFails(getDocs(collection(anon(), "ratings")));
  const bad = [{ ...r, website: 6 }, { ...r, website: 0 }, { ...r, website: "5" }, { ...r, website: 4.5 }, { ...r, name: "Rahim" },
    { ...r, source: "team" }, { ...r, lang: "fr" }, { source: "website", created_at: r.created_at, updated_at: r.updated_at, lang: "en" }];
  for (const b of bad) await assertFails(setDoc(doc(anon(), "ratings/R-zzzzzzzzzz0123456789"), b));
  await assertFails(setDoc(doc(anon(), "ratings/anything"), r));                                     // ID shape
  for (const db of [founder(), support(), marketing()]) await assertSucceeds(getDocs(collection(db, "ratings")));
  for (const db of [stranger(), gone()]) await assertFails(getDocs(collection(db, "ratings")));
  await assertFails(deleteDoc(doc(support(), id)));
  await assertSucceeds(deleteDoc(doc(founder(), id)));
});


const guest = () => as("guest@gmail.com"), expired = () => as("expired@gmail.com");

test("guests: no company data at all; only their own team row and their assigned emulator", async () => {
  for (const path of ["orders/VG-261018-AAAA", "invoices/INV-2026-0001", "inventory/DET", "settings/company", "signatories/s1", "promos/OLD5", "team/founder@gmail.com"]) {
    await assertFails(getDoc(doc(guest(), path)));
  }
  for (const col of ["orders", "invoices", "inventory", "marketing", "dealers", "ratings", "subscriptions", "activity", "team"]) {
    await assertFails(getDocs(collection(guest(), col)));
  }
  await assertSucceeds(getDoc(doc(guest(), "team/guest@gmail.com")));
  await assertFails(updateDoc(doc(guest(), "orders/VG-261018-AAAA"), { status: "paid" }));
  await assertFails(setDoc(doc(guest(), "team/guest@gmail.com"), { email: "guest@gmail.com", name: "G", role: "founder", active: true }));
  const emu = { device_id: "VG-EMU05", email: "e@x", password: "p", code: "ABCDEFGHJKMN", kit: "complete", assigned_to: "guest@gmail.com" };
  await assertSucceeds(setDoc(doc(owner(), "emulators/VG-EMU05"), emu));
  await assertSucceeds(setDoc(doc(owner(), "emulators/VG-EMU06"), { ...emu, device_id: "VG-EMU06", assigned_to: "founder@gmail.com" }));
  await assertSucceeds(getDoc(doc(guest(), "emulators/VG-EMU05")));
  await assertFails(getDoc(doc(guest(), "emulators/VG-EMU06")));
  const { query, where } = await import("firebase/firestore");
  await assertSucceeds(getDocs(query(collection(guest(), "emulators"), where("assigned_to", "==", "guest@gmail.com"))));
});

test("an expired guest (past the end date) gets nothing, not even their emulator", async () => {
  await assertSucceeds(setDoc(doc(owner(), "emulators/VG-EMU07"), { device_id: "VG-EMU07", email: "e@x", password: "p", code: "ABCDEFGHJKMN", kit: "complete", assigned_to: "expired@gmail.com" }));
  await assertFails(getDoc(doc(expired(), "emulators/VG-EMU07")));
  await assertFails(setDoc(doc(expired(), "presence/expired@gmail.com"), { email: "expired@gmail.com", last_seen: "2026-10-21T10:00:00Z", online: true }));
});

test("team list: only the company account adds a guest, with an end date", async () => {
  const g = { email: "friend@gmail.com", name: "Friend", role: "guest", active: true, until: "2026-11-30", until_ms: 1764525599000 };
  await assertSucceeds(setDoc(doc(owner(), "team/friend@gmail.com"), g));
  await assertFails(setDoc(doc(founder(), "team/friend2@gmail.com"), { ...g, email: "friend2@gmail.com" }));
  await assertFails(setDoc(doc(owner(), "team/friend3@gmail.com"), { ...g, email: "friend3@gmail.com", until_ms: "soon" }));
  await assertFails(setDoc(doc(owner(), "team/friend4@gmail.com"), { ...g, email: "friend4@gmail.com", role: "boss" }));
});

test("online status: each person writes only their own; only the company account reads them", async () => {
  const p = (e) => ({ email: e, last_seen: "2026-10-21T10:00:00Z", online: true });
  await assertSucceeds(setDoc(doc(support(), "presence/support@gmail.com"), p("support@gmail.com")));
  await assertSucceeds(setDoc(doc(guest(), "presence/guest@gmail.com"), p("guest@gmail.com")));
  await assertFails(setDoc(doc(support(), "presence/founder@gmail.com"), p("founder@gmail.com")));
  await assertFails(setDoc(doc(support(), "presence/support@gmail.com"), { ...p("support@gmail.com"), page: "orders" }));
  await assertFails(setDoc(doc(stranger(), "presence/stranger@gmail.com"), p("stranger@gmail.com")));
  await assertSucceeds(getDocs(collection(owner(), "presence")));
  for (const db of [founder(), support(), marketing(), guest()]) await assertFails(getDocs(collection(db, "presence")));
});

test("tasks: the company account assigns and reviews; each person sees and submits only their own", async () => {
  const t = { title: "Call 10 leads", details: "From the website", assignee: "support@gmail.com", assignee_name: "S", kind: "daily",
    due: "2026-10-21", status: "open", created_at: "2026-10-21T08:00:00Z", created_by: "oasisnextbd@gmail.com", returned_count: 0 };
  await assertSucceeds(setDoc(doc(owner(), "tasks/t1"), t));
  await assertSucceeds(setDoc(doc(owner(), "tasks/t2"), { ...t, assignee: "guest@gmail.com", kind: "milestone", due: "2026-11-30" }));
  await assertFails(setDoc(doc(founder(), "tasks/t3"), t));                                   // founders do not assign
  await assertFails(setDoc(doc(owner(), "tasks/t4"), { ...t, kind: "yearly" }));
  await assertFails(setDoc(doc(owner(), "tasks/t5"), { ...t, due: "21/10/2026" }));
  const { query, where } = await import("firebase/firestore");
  await assertSucceeds(getDocs(query(collection(support(), "tasks"), where("assignee", "==", "support@gmail.com"))));
  await assertFails(getDocs(collection(support(), "tasks")));
  await assertFails(getDoc(doc(support(), "tasks/t2")));
  await assertSucceeds(getDoc(doc(guest(), "tasks/t2")));
  await assertFails(getDoc(doc(founder(), "tasks/t1")));
  // submit: only status → submitted, a note and the time
  await assertFails(updateDoc(doc(support(), "tasks/t1"), { status: "approved" }));
  await assertFails(updateDoc(doc(support(), "tasks/t1"), { status: "submitted", submitted_at: "2026-10-21T17:00:00Z", due: "2026-12-31" }));
  await assertFails(updateDoc(doc(founder(), "tasks/t1"), { status: "submitted", submitted_at: "2026-10-21T17:00:00Z" }));
  await assertSucceeds(updateDoc(doc(support(), "tasks/t1"), { status: "submitted", submitted_at: "2026-10-21T17:00:00Z", submit_note: "Done, 10 called" }));
  await assertFails(updateDoc(doc(support(), "tasks/t1"), { status: "submitted", submit_note: "again" }));   // already submitted
  // review by the company account; a returned task can be submitted again
  await assertSucceeds(updateDoc(doc(owner(), "tasks/t1"), { status: "returned", review_note: "Add the notes", reviewed_at: "2026-10-21T18:00:00Z", returned_count: 1 }));
  await assertSucceeds(updateDoc(doc(support(), "tasks/t1"), { status: "submitted", submitted_at: "2026-10-21T19:00:00Z", submit_note: "Notes added" }));
  await assertSucceeds(updateDoc(doc(owner(), "tasks/t1"), { status: "approved", reviewed_at: "2026-10-21T20:00:00Z" }));
  await assertFails(deleteDoc(doc(support(), "tasks/t1")));
  await assertSucceeds(deleteDoc(doc(owner(), "tasks/t1")));
});


test("task files: the assignee attaches proof while the task is open; only they and the company account read it", async () => {
  const t = { title: "Stock count", assignee: "support@gmail.com", kind: "weekly", due: "2026-10-24", status: "open", created_at: "x", created_by: "oasisnextbd@gmail.com", returned_count: 0 };
  await assertSucceeds(setDoc(doc(owner(), "tasks/tf"), t));
  const f = { task_id: "tf", name: "count.pdf", type: "application/pdf", size: 1200, data: "data:application/pdf;base64,AAAA", assignee: "support@gmail.com", uploaded_by: "support@gmail.com", uploaded_at: "2026-10-21T10:00:00Z" };
  await assertSucceeds(setDoc(doc(support(), "taskFiles/f1"), f));
  await assertFails(setDoc(doc(marketing(), "taskFiles/f2"), { ...f, assignee: "marketing@gmail.com", uploaded_by: "marketing@gmail.com" }));   // not their task
  await assertFails(setDoc(doc(support(), "taskFiles/f3"), { ...f, data: "x".repeat(1000001) }));                                          // too big
  await assertFails(setDoc(doc(support(), "taskFiles/f4"), { ...f, task_id: "nope" }));                                                   // no such task
  await assertSucceeds(getDoc(doc(support(), "taskFiles/f1")));
  await assertSucceeds(getDoc(doc(owner(), "taskFiles/f1")));
  await assertFails(getDoc(doc(marketing(), "taskFiles/f1")));
  await assertFails(getDoc(doc(founder(), "taskFiles/f1")));
  await assertSucceeds(updateDoc(doc(support(), "tasks/tf"), { status: "submitted", submitted_at: "2026-10-21T10:01:00Z", submit_note: "Done", link: "https://drive.google.com/x",
    files: [{ id: "f1", name: "count.pdf", type: "application/pdf", size: 1200 }] }));
  await assertFails(setDoc(doc(support(), "taskFiles/f5"), f));                                                                           // already submitted
  await assertFails(deleteDoc(doc(support(), "taskFiles/f1")));
  await assertSucceeds(deleteDoc(doc(owner(), "taskFiles/f1")));
});

test("profile: each person may change only their own display name", async () => {
  const by = (e) => ({ updated_at: "2026-10-21T10:00:00Z", updated_by: e });
  await assertSucceeds(updateDoc(doc(support(), "team/support@gmail.com"), { name: "Support Desk", ...by("support@gmail.com") }));
  await assertSucceeds(updateDoc(doc(guest(), "team/guest@gmail.com"), { name: "Friend (engineer)", ...by("guest@gmail.com") }));
  await assertFails(updateDoc(doc(support(), "team/support@gmail.com"), { role: "founder", ...by("support@gmail.com") }));
  await assertFails(updateDoc(doc(support(), "team/support@gmail.com"), { name: "S", active: true, until_ms: 9e15, ...by("support@gmail.com") }));
  await assertFails(updateDoc(doc(guest(), "team/guest@gmail.com"), { until_ms: 9999999999999, ...by("guest@gmail.com") }));
  await assertFails(updateDoc(doc(support(), "team/marketing@gmail.com"), { name: "X", ...by("support@gmail.com") }));
  await assertFails(updateDoc(doc(expired(), "team/expired@gmail.com"), { name: "Still here", ...by("expired@gmail.com") }));
  await assertFails(updateDoc(doc(support(), "team/support@gmail.com"), { name: "", ...by("support@gmail.com") }));
});
