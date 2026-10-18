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

test("settings: website settings are public to read; company settings are not; founders write", async () => {
  await assertSucceeds(getDoc(doc(anon(), "settings/website")));
  await assertFails(getDoc(doc(anon(), "settings/company")));
  await assertFails(setDoc(doc(support(), "settings/website"), { preorder_open: false }));
  await assertSucceeds(setDoc(doc(founder(), "settings/company"), { legal_name: "Y" }));
});

test("activity log: members add their own entries only, and nobody edits it", async () => {
  await assertSucceeds(setDoc(doc(support(), "activity/a1"), { user: "support@gmail.com", action: "x" }));
  await assertFails(setDoc(doc(support(), "activity/a2"), { user: OWNER, action: "x" }));
  await assertFails(updateDoc(doc(founder(), "activity/a1"), { action: "y" }));
});
