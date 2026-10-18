/* The dashboard's state and every change the team can make. Views read S.data and call the
   functions below; nothing else writes to the database. Live updates come in through watch(),
   so a change made by one person shows up for everyone straight away. */

import { promoProblem, totals, stockNeeds, stockDelta, invoiceNo, nextRenewal, CYCLES } from "./calc.js";
import { nowIso, today } from "./ui.js";

export const S = {
  db: null, cfg: {}, user: null, me: null,
  data: {
    orders: [], invoices: [], inventory: [], products: [], promos: [], marketing: [], dealers: [],
    team: [], signatories: [], activity: [], stockMoves: [], subscriptions: [], settings: { company: {}, website: {} },
  },
  loaded: new Set(),
};

export const STATUSES = ["new", "payment_pending", "contacted", "paid", "refunded", "installed", "not_interested"];
export const STATUS = { new: "New", payment_pending: "Payment pending", contacted: "Contacted", paid: "Deposit paid", refunded: "Refunded", installed: "Installed", not_interested: "Not interested" };
export const TYPE = { preorder: "Pre-order", enquiry: "Landlord / restaurant", dealer: "Dealer application", waitlist: "Agro / Marine waitlist", contact: "Contact message" };
export const PACKAGE = { complete: "Complete kit", detector_relay: "Detector + Relay" };
export const ROLES = { founder: "Founder", support: "Support", marketing: "Marketing" };

/* ---------- who may do what (the same rules are enforced in firestore.rules) ---------- */
const CAN = {
  orders: ["founder", "support"], invoices: ["founder", "support"], void: ["founder"], stock: ["founder", "support"],
  items: ["founder"], promos: ["founder", "marketing"], marketing: ["founder", "marketing"], dealers: ["founder"], settings: ["founder"], subscriptions: ["founder"],
};
export function can(what) {
  if (!S.me) return false;
  if (what === "team") return !!S.me.owner;
  return (CAN[what] || []).includes(S.me.role);
}

/* ---------- sign-in and the team list ---------- */
export async function whoAmI(user) {
  const owner = String(S.cfg.owner || "").toLowerCase();
  let row = null;
  try { row = await S.db.get("team", user.email); } catch (e) { row = null; }
  if (user.email === owner) {
    if (!row) await S.db.set("team", owner, { email: owner, name: user.name || "", role: "founder", active: true, updated_at: nowIso(), updated_by: owner });
    return { email: owner, name: (row && row.name) || user.name || "", role: "founder", owner: true };
  }
  if (!row || row.active !== true) throw new Error(`Your account (${user.email}) is not on the VenGuard team list. Ask ${owner} to add you.`);
  return { email: user.email, name: row.name || "", role: row.role, owner: false };
}

/* ---------- live data ---------- */
const WATCH = {
  orders: { orderBy: "submitted_at", desc: true }, invoices: { orderBy: "issued_at", desc: true },
  inventory: {}, products: {}, promos: {}, marketing: { orderBy: "date", desc: true }, dealers: {}, team: {}, signatories: {},
  activity: { orderBy: "at", desc: true, limit: 200 }, stockMoves: { orderBy: "at", desc: true, limit: 300 }, subscriptions: {},
};
let stops = [];
export function start(onChange, onError) {
  stop();
  for (const [col, o] of Object.entries(WATCH)) {
    stops.push(S.db.watch(col, (rows) => { S.data[col] = rows; S.loaded.add(col); onChange(col); }, o, onError));
  }
  for (const id of ["company", "website"]) {
    stops.push(S.db.watchDoc("settings", id, (d) => { S.data.settings[id] = d || {}; onChange("settings"); }, onError));
  }
}
export function stop() { stops.forEach((s) => s && s()); stops = []; S.loaded.clear(); }

const clean = (o) => JSON.parse(JSON.stringify(o));   // Firestore refuses `undefined`
const by = () => S.me.email;
export function log(action, ref, detail) {
  S.db.add("activity", { at: nowIso(), user: by(), action, ref: ref || "", detail: String(detail || "").slice(0, 300) }).catch(() => {});
}
export const productMap = () => Object.fromEntries(S.data.products.map((p) => [p.id, p]));
export const itemMap = () => Object.fromEntries(S.data.inventory.map((i) => [i.id, i]));

/* ---------- orders ---------- */
const ORDER_FIELDS = ["form_type", "name", "phone", "email", "organisation", "area", "district", "kitchen_type", "business_type", "units",
  "cylinder_brand", "heard_from", "dealer_code", "message", "package", "promo_code", "address"];
function newOrderId() {
  const d = new Date(Date.now() + 6 * 36e5).toISOString().slice(2, 10).replace(/-/g, "");   // Dhaka date
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return "VG-" + d + "-" + s;
}
export async function addOrder(d) {
  const phone = String(d.phone || "").replace(/[^\d+]/g, "");
  if (!d.name || phone.replace(/\D/g, "").length < 10) throw new Error("A name and a phone number are needed.");
  let id = String(d.order_id || "").trim().toUpperCase();
  if (!/^VG-\d{6}-[A-Z0-9]{4}$/.test(id)) id = newOrderId();
  if (await S.db.get("orders", id)) throw new Error(`Order ${id} is already in the list.`);
  const o = { order_id: id, submitted_at: nowIso(), status: "new", referrer: "added by team", created_by: by(), team_notes: "" };
  for (const k of ORDER_FIELDS) if (d[k]) o[k] = String(d[k]).trim().slice(0, 1000);
  o.phone = phone; o.form_type = TYPE[o.form_type] ? o.form_type : "preorder";
  if (o.promo_code) o.promo_code = o.promo_code.toUpperCase();
  await S.db.set("orders", id, clean(o));
  log("order_add", id, `${o.form_type} via ${o.heard_from || "team"}`);
  return id;
}
export async function updateOrder(id, ch) {
  await S.db.update("orders", id, clean({ ...ch, updated_at: nowIso(), updated_by: by() }));
  log("order_update", id, Object.entries(ch).map(([k, v]) => (k === "status" ? `status → ${v}` : k)).join(", "));
}
/** Orders from a CSV export of the old VenGuard Leads Sheet (same column names). Skips ones already here. */
export async function importOrders(rows) {
  let added = 0, skipped = 0;
  for (const r of rows) {
    const id = String(r.order_id || "").toUpperCase();
    if (!r.name || !r.phone || (id && S.data.orders.some((o) => o.id === id))) { skipped++; continue; }
    const o = { ...r, order_id: /^VG-\d{6}-[A-Z0-9]{4}$/.test(id) ? id : newOrderId() };
    o.status = STATUSES.includes(o.status) ? o.status : "new";
    o.submitted_at = isNaN(new Date(o.submitted_at)) ? nowIso() : new Date(o.submitted_at).toISOString();
    o.phone = String(o.phone).replace(/^'/, "");
    await S.db.set("orders", o.order_id, clean(o));
    added++;
  }
  log("order_import", "", `${added} added, ${skipped} skipped`);
  return { added, skipped };
}

/* ---------- invoices ---------- */
function companySnapshot() {
  const c = S.data.settings.company || {};
  if (!c.legal_name || !c.address) throw new Error("Add the company's name and address in Settings → Company before issuing invoices.");
  const keep = ["legal_name", "address", "phone", "email", "website", "bin", "trade_license", "terms"];
  return Object.fromEntries(keep.filter((k) => c[k]).map((k) => [k, c[k]]));
}
function currentSignatory() {
  const id = (S.data.settings.company || {}).default_signatory;
  const s = S.data.signatories.find((x) => x.id === id && x.active !== false);
  return s ? { id: s.id, name: s.name, title: s.title } : null;
}
function invoiceBody(draft, promo) {
  const t = totals({ ...draft, promo, vat_rate: (S.data.settings.company || {}).vat_rate });
  return {
    order_id: draft.order_id || "", customer: clean(draft.customer || {}),
    lines: t.lines.map((l) => clean({ product_id: l.product_id || null, sku: l.sku || null, name: String(l.name || "").slice(0, 200), qty: l.qty, unit_price: l.unit_price, amount: l.amount })),
    promo: promo ? { code: promo.code, type: promo.type, value: promo.value } : null,
    subtotal: t.subtotal, promo_discount: t.promo_discount, extra_discount: t.extra_discount, delivery: t.delivery,
    vat_rate: t.vat_rate, vat: t.vat, total: t.total, paid: t.paid, due: t.due,
    payment_method: draft.payment_method || "", notes: String(draft.notes || "").slice(0, 1000),
  };
}
function checkLines(lines) {
  const real = (lines || []).filter((l) => l.name && Number(l.qty) > 0);
  if (!real.length) throw new Error("Add at least one item with a quantity.");
  if (real.some((l) => !(Number(l.unit_price) >= 0))) throw new Error("Every item needs a price.");
  return real;
}
/** Moves stock inside a transaction and records each move. `delta` is what the invoice takes (+) or gives back (-). */
function applyStock(t, items, delta, ref, reason) {
  for (const [sku, take] of Object.entries(delta)) {
    const it = items[sku];
    if (!it) continue;   // a line that is not a stocked item
    const balance = (Number(it.stock) || 0) - take;
    t.update("inventory", sku, { stock: balance, updated_at: nowIso() });
    t.set("stockMoves", t.newId("stockMoves"), { at: nowIso(), sku, qty: -take, reason, ref, note: "", by: by(), balance });
  }
}

export async function issueInvoice(draft) {
  const lines = checkLines(draft.lines);
  const company = companySnapshot();
  const signatory = currentSignatory();
  const year = new Date().getFullYear();
  const code = String(draft.promo_code || "").trim().toUpperCase();
  const need = stockNeeds(lines, productMap());
  const no = await S.db.tx(async (t) => {
    const counter = await t.get("counters", "invoice-" + year);
    const promo = code ? await t.get("promos", code) : null;
    if (code) { const p = promoProblem(promo, today()); if (p) throw new Error(code + ": " + p); }
    const items = {};
    for (const sku of Object.keys(need)) items[sku] = await t.get("inventory", sku);
    const n = Number((counter && counter.next) || 1);
    const no = invoiceNo(S.data.settings.company.invoice_prefix, year, n);
    t.set("counters", "invoice-" + year, { next: n + 1 });
    applyStock(t, items, need, no, "sale");
    if (promo) t.update("promos", code, { used: (promo.used || 0) + 1 });
    t.set("invoices", no, clean({
      no, rev: 1, status: "issued", issued_at: nowIso(), ...invoiceBody({ ...draft, lines }, promo),
      company, signatory, stock: need, payments: Number(draft.paid) > 0 ? [{ at: nowIso(), amount: Math.round(draft.paid), method: draft.payment_method || "", by: by() }] : [],
      created_by: by(), history: [{ rev: 1, at: nowIso(), by: by(), what: "Issued" + (signatory ? " · signed by " + signatory.name : "") }],
    }));
    return no;
  });
  log("invoice_issue", no, draft.order_id || "");
  return no;
}

/** Saves changes to an issued invoice as a new revision; stock and promo use follow the change. */
export async function reviseInvoice(no, draft, reason) {
  const lines = checkLines(draft.lines);
  const code = String(draft.promo_code || "").trim().toUpperCase();
  const newNeed = stockNeeds(lines, productMap());
  await S.db.tx(async (t) => {
    const inv = await t.get("invoices", no);
    if (!inv || inv.status !== "issued") throw new Error("Only an issued invoice can be changed.");
    const oldCode = inv.promo ? inv.promo.code : "";
    const oldPromo = oldCode && oldCode !== code ? await t.get("promos", oldCode) : null;
    const promo = code ? await t.get("promos", code) : null;
    if (code && code !== oldCode) { const p = promoProblem(promo, today()); if (p) throw new Error(code + ": " + p); }
    const delta = stockDelta(inv.stock || {}, newNeed);
    const items = {};
    for (const sku of Object.keys(delta)) items[sku] = await t.get("inventory", sku);
    applyStock(t, items, delta, no, "invoice change");
    if (oldPromo) t.update("promos", oldCode, { used: Math.max(0, (oldPromo.used || 0) - 1) });
    if (promo && code !== oldCode) t.update("promos", code, { used: (promo.used || 0) + 1 });
    const rev = (inv.rev || 1) + 1;
    t.update("invoices", no, clean({
      ...invoiceBody({ ...draft, lines, paid: inv.paid }, promo || (code === oldCode ? inv.promo : null)), stock: newNeed, rev, updated_at: nowIso(),
      history: [...(inv.history || []), { rev, at: nowIso(), by: by(), what: reason || "Edited" }],
    }));
  });
  log("invoice_revise", no, reason || "edited");
}

/** New revision with today's company details and the current authorised signatory (e.g. after a management change). */
export async function resignInvoice(no) {
  const sig = currentSignatory();
  if (!sig) throw new Error("Choose the authorised signatory in Settings → Company first.");
  const company = companySnapshot();
  await S.db.tx(async (t) => {
    const inv = await t.get("invoices", no);
    if (!inv || inv.status !== "issued") throw new Error("Only an issued invoice can be re-signed.");
    const rev = (inv.rev || 1) + 1;
    t.update("invoices", no, { signatory: sig, company, rev, updated_at: nowIso(), history: [...(inv.history || []), { rev, at: nowIso(), by: by(), what: `Re-signed by ${sig.name}${sig.title ? " (" + sig.title + ")" : ""}` }] });
  });
  log("invoice_resign", no, sig.name);
}

export async function recordPayment(no, amount, method) {
  amount = Math.round(Number(amount) || 0);
  if (amount <= 0) throw new Error("Enter the amount received.");
  await S.db.tx(async (t) => {
    const inv = await t.get("invoices", no);
    if (!inv || inv.status !== "issued") throw new Error("Payments can only be added to an issued invoice.");
    const paid = (inv.paid || 0) + amount;
    t.update("invoices", no, { paid, due: inv.total - paid, payment_method: method || inv.payment_method || "", updated_at: nowIso(),
      payments: [...(inv.payments || []), { at: nowIso(), amount, method: method || "", by: by() }] });
  });
  log("invoice_payment", no, `${amount} ${method || ""}`);
}

/** Founders only: cancels an invoice, puts its stock back and frees its promo use. The number is never reused. */
export async function voidInvoice(no, reason) {
  if (!reason) throw new Error("Write why the invoice is cancelled.");
  await S.db.tx(async (t) => {
    const inv = await t.get("invoices", no);
    if (!inv || inv.status !== "issued") throw new Error("This invoice is already cancelled.");
    const back = Object.fromEntries(Object.entries(inv.stock || {}).map(([k, v]) => [k, -v]));
    const items = {};
    for (const sku of Object.keys(back)) items[sku] = await t.get("inventory", sku);
    const promo = inv.promo ? await t.get("promos", inv.promo.code) : null;
    applyStock(t, items, back, no, "invoice cancelled");
    if (promo) t.update("promos", promo.id, { used: Math.max(0, (promo.used || 0) - 1) });
    const rev = (inv.rev || 1) + 1;
    t.update("invoices", no, { status: "void", void_reason: reason, voided_at: nowIso(), voided_by: by(), stock: {}, rev,
      history: [...(inv.history || []), { rev, at: nowIso(), by: by(), what: "Cancelled: " + reason }] });
  });
  log("invoice_void", no, reason);
}

/* ---------- inventory ---------- */
export async function saveItem(it, isNew) {
  const sku = String(it.sku || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!sku || !it.name) throw new Error("An item needs a code (e.g. DET) and a name.");
  if (isNew && S.data.inventory.some((i) => i.id === sku)) throw new Error(`Item ${sku} already exists.`);
  const v = { sku, name: it.name, low_at: Math.max(0, Math.round(Number(it.low_at) || 0)), unit_cost: Math.max(0, Math.round(Number(it.unit_cost) || 0)), updated_at: nowIso() };
  if (isNew) v.stock = 0;
  await S.db.set("inventory", sku, v, !isNew);
  log(isNew ? "item_add" : "item_update", sku, it.name);
  return sku;
}
export async function moveStock(m) {
  const qty = Math.round(Number(m.qty) || 0);
  if (!m.sku || !qty) throw new Error("Choose an item and a quantity.");
  const sign = ["sale", "damaged", "sample", "adjust_down"].includes(m.reason) ? -1 : 1;
  await S.db.tx(async (t) => {
    const it = await t.get("inventory", m.sku);
    if (!it) throw new Error("Unknown item.");
    const balance = (Number(it.stock) || 0) + sign * Math.abs(qty);
    t.update("inventory", m.sku, { stock: balance, updated_at: nowIso() });
    t.set("stockMoves", t.newId("stockMoves"), { at: nowIso(), sku: m.sku, qty: sign * Math.abs(qty), reason: m.reason, ref: m.ref || "", note: m.note || "", by: by(), balance });
  });
  log("stock_move", m.sku, `${sign * Math.abs(qty)} ${m.reason}`);
}
export async function saveProduct(id, p) {
  const comps = {};
  for (const [sku, n] of Object.entries(p.components || {})) if (Math.round(Number(n)) > 0) comps[sku] = Math.round(Number(n));
  if (!p.name) throw new Error("A product needs a name.");
  id = id || String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "product";
  await S.db.set("products", id, { name: p.name, price: Math.max(0, Math.round(Number(p.price) || 0)), components: comps, active: p.active !== false, updated_at: nowIso() });
  log("product_save", id, p.name);
  return id;
}
/** The three VenGuard devices and what the website sells, at the prices confirmed by the founders
    (October 2026, venguard/site.json "preorder"). Change prices later in Inventory → Packages. */
export async function addVenGuardDefaults() {
  const items = [["DET", "Gas detector"], ["VALVE", "Smart valve"], ["RELAY", "Smart relay"]];
  for (const [sku, name] of items) if (!S.data.inventory.some((i) => i.id === sku)) await S.db.set("inventory", sku, { sku, name, stock: 0, low_at: 10, unit_cost: 0, updated_at: nowIso() });
  const prods = {
    complete: ["VenGuard complete kit (detector, valve, relay)", 3500, { DET: 1, VALVE: 1, RELAY: 1 }],
    detector_relay: ["VenGuard detector + relay", 1900, { DET: 1, RELAY: 1 }],
    valve_addon: ["VenGuard smart valve (add-on)", 1700, { VALVE: 1 }],
  };
  for (const [id, [name, price, components]] of Object.entries(prods)) if (!S.data.products.some((p) => p.id === id)) await S.db.set("products", id, { name, price, components, active: true, updated_at: nowIso() });
  log("inventory_defaults", "", "detector, valve, relay and three packages");
}

/* ---------- promo codes ---------- */
export async function savePromo(p, isNew) {
  const code = String(p.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  if (code.length < 3) throw new Error("A code needs at least 3 letters or numbers.");
  if (isNew && S.data.promos.some((x) => x.id === code)) throw new Error(`Code ${code} already exists.`);
  const value = Math.round(Number(p.value) || 0);
  if (value <= 0 || (p.type === "percent" && value > 100)) throw new Error(p.type === "percent" ? "Enter a percentage from 1 to 100." : "Enter the discount in taka.");
  if (p.starts && p.ends && p.ends < p.starts) throw new Error("The end date is before the start date.");
  const old = S.data.promos.find((x) => x.id === code);
  await S.db.set("promos", code, clean({ code, type: p.type === "amount" ? "amount" : "percent", value, starts: p.starts || "", ends: p.ends || "",
    max_uses: Math.max(0, Math.round(Number(p.max_uses) || 0)), used: (old && old.used) || 0, active: p.active !== false, note: p.note || "",
    channel: p.channel || "", created_at: (old && old.created_at) || nowIso(), updated_by: by() }));
  log(isNew ? "promo_add" : "promo_update", code, p.type === "amount" ? `BDT ${value} off` : `${value}% off`);
  return code;
}
export async function setPromoActive(code, active) {
  await S.db.update("promos", code, { active, updated_by: by() });
  log("promo_" + (active ? "on" : "off"), code, "");
}

/* ---------- marketing costs ---------- */
export async function saveSpend(id, e) {
  const amount = Math.round(Number(e.amount) || 0);
  if (!e.date || !e.channel || amount <= 0) throw new Error("Enter a date, a channel and the amount spent.");
  const v = { date: e.date, channel: e.channel, campaign: e.campaign || "", amount, note: e.note || "", by: by(), updated_at: nowIso() };
  if (id) await S.db.set("marketing", id, v); else id = await S.db.add("marketing", v);
  log("spend_save", e.channel, `${amount} ${e.campaign || ""}`);
  return id;
}
export async function deleteSpend(id) { await S.db.del("marketing", id); log("spend_delete", id, ""); }

/* ---------- dealers ---------- */
export async function saveDealer(d) {
  const code = String(d.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!code) throw new Error("A dealer code is needed, e.g. DH-042.");
  const old = S.data.dealers.find((x) => x.id === code);
  await S.db.set("dealers", code, clean({ ...(old || {}), ...d, code, created_at: (old && old.created_at) || nowIso(), id: undefined }));
  log(old ? "dealer_update" : "dealer_add", code, d.shop_name || "");
  return code;
}

/* ---------- settings, signatories, team ---------- */
export async function saveSettings(id, v) {
  await S.db.set("settings", id, clean({ ...v, updated_at: nowIso(), updated_by: by() }), true);
  log("settings_" + id, "", Object.keys(v).join(", "));
}
export async function addSignatory(s, makeDefault) {
  if (!s.name || !s.signature) throw new Error("Add the person's name and a signature image.");
  const id = await S.db.add("signatories", { name: s.name, title: s.title || "", signature: s.signature, active: true, created_at: nowIso(), created_by: by() });
  if (makeDefault || !(S.data.settings.company || {}).default_signatory) await saveSettings("company", { default_signatory: id });
  log("signatory_add", id, s.name);
  return id;
}
export async function setSignatoryActive(id, active) {
  await S.db.update("signatories", id, { active });
  if (!active && S.data.settings.company.default_signatory === id) await saveSettings("company", { default_signatory: "" });
  log("signatory_" + (active ? "on" : "off"), id, "");
}
export async function saveMember(m) {
  const email = String(m.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (email === String(S.cfg.owner).toLowerCase()) throw new Error("The company account always stays on the team as founder.");
  if (!ROLES[m.role]) throw new Error("Choose a role.");
  await S.db.set("team", email, { email, name: m.name || "", role: m.role, active: m.active !== false, updated_at: nowIso(), updated_by: by() });
  log("team_update", email, m.role + (m.active === false ? " (removed)" : ""));
}

/* ---------- subscriptions & renewals ---------- */
const SUB_FIELDS = ["name", "category", "currency", "cycle", "renews_on", "paid_by", "payment_method", "account", "url", "notes"];
export async function saveSub(id, v) {
  if (!v.name) throw new Error("Give the service a name.");
  if (!CYCLES[v.cycle]) throw new Error("Choose how often it is paid.");
  const cost = Math.max(0, Number(v.cost) || 0);
  if (v.cycle !== "free" && v.cycle !== "once" && !v.renews_on) throw new Error("Enter the next renewal date.");
  const o = { cost: v.cycle === "free" ? 0 : cost, auto_renew: !!v.auto_renew, remind_days: Math.max(1, Math.min(120, Math.round(Number(v.remind_days) || 30))),
    active: v.active !== false, updated_at: nowIso(), updated_by: by() };
  for (const k of SUB_FIELDS) o[k] = String(v[k] || "").trim().slice(0, k === "notes" ? 1000 : 200);
  if (o.url && !/^https?:\/\//i.test(o.url)) o.url = "https://" + o.url;
  if (!o.currency) o.currency = "BDT";
  if (id) await S.db.update("subscriptions", id, clean(o));
  else id = await S.db.add("subscriptions", clean({ ...o, history: [], created_at: nowIso() }));
  log("subscription_save", id, o.name);
  return id;
}
/** Records a renewal payment and moves the date on by one billing cycle. */
export async function renewSub(id, amount, note) {
  await S.db.tx(async (t) => {
    const s = await t.get("subscriptions", id);
    if (!s) throw new Error("Unknown subscription.");
    const next = nextRenewal(s.renews_on, s.cycle);
    if (!next) throw new Error("This one has no renewal date.");
    const paid = amount === "" || amount == null ? s.cost : Math.max(0, Number(amount) || 0);
    t.update("subscriptions", id, { renews_on: next, updated_at: nowIso(), updated_by: by(),
      history: [...(s.history || []), { at: nowIso(), period_from: s.renews_on, amount: paid, currency: s.currency || "BDT", note: String(note || "").slice(0, 200), by: by() }] });
  });
  log("subscription_renew", id, "");
}
export async function setSubActive(id, active) { await S.db.update("subscriptions", id, { active, updated_at: nowIso(), updated_by: by() }); log("subscription_" + (active ? "on" : "off"), id, ""); }
/** The services VenGuard uses today, all free (no invented prices or dates). */
export async function addCurrentServices() {
  const have = new Set(S.data.subscriptions.map((x) => x.name));
  const list = [
    ["GitHub (website hosting, code)", "Hosting", "https://github.com/oasisnextbd", "Website and dashboard are published by GitHub Pages."],
    ["Firebase, Spark plan (dashboard data, app, sign-in)", "Hosting", "https://console.firebase.google.com/project/venguard-connected", "Free plan. Blaze (pay as you go) is only needed for Cloud Functions or backups."],
    ["Google account oasisnextbd@gmail.com", "Accounts", "https://myaccount.google.com", "Owns Firebase, Search Console and the dashboard. Keep 2-step verification on."],
  ];
  for (const [name, category, url, notes] of list) if (!have.has(name)) await saveSub(null, { name, category, cycle: "free", currency: "BDT", url, notes, remind_days: 30 });
}
