/* The dashboard's state and every change the team can make. Views read S.data and call the
   functions below; nothing else writes to the database. Live updates come in through watch(),
   so a change made by one person shows up for everyone straight away. */

import { promoProblem, totals, stockNeeds, stockDelta, invoiceNo, nextRenewal, CYCLES, TASK_KINDS, endOfDayDhaka, INSTALL_STATUS, checklistDone, TICKET_KINDS, TICKET_STATUS, addMonths, samePhone, dhakaToday } from "./calc.js";
import { nowIso, today } from "./ui.js";

export const S = {
  db: null, cfg: {}, user: null, me: null,
  data: {
    orders: [], invoices: [], inventory: [], products: [], promos: [], marketing: [], dealers: [],
    team: [], signatories: [], activity: [], stockMoves: [], subscriptions: [], emulators: [], ratings: [], tasks: [], presence: [], technicians: [], installations: [], customers: [], tickets: [], settings: { company: {}, website: {}, app: {} },
  },
  loaded: new Set(),
};

export const STATUSES = ["new", "payment_pending", "contacted", "paid", "refunded", "installed", "not_interested"];
export const STATUS = { new: "New", payment_pending: "Payment pending", contacted: "Contacted", paid: "Deposit paid", refunded: "Refunded", installed: "Installed", not_interested: "Not interested" };
export const TYPE = { preorder: "Pre-order", enquiry: "Site assessment request", dealer: "Dealer application", waitlist: "Agro / Marine waitlist", contact: "Contact message" };
export const PACKAGE = { complete: "Complete kit", detector_relay: "Detector + Relay" };
export const ROLES = { founder: "Founder", support: "Support", marketing: "Marketing", guest: "Guest" };
/** What each role may do, in plain words (Profile and the team form). Same rules as firestore.rules. */
export const ROLE_INFO = {
  owner: "Everything, including the team list, assigning and reviewing tasks, and seeing who is online.",
  founder: "Everything except the team list: orders, invoices (including cancelling), stock, packages, promo codes, costs, dealers, settings, and an emulator.",
  support: "Orders and leads, invoices and payments, stock in and out. Sees the rest.",
  marketing: "Promo codes and marketing costs. Sees the rest.",
  guest: "Only your emulator, your tasks and the manual. No company data.",
};

/* ---------- who may do what (the same rules are enforced in firestore.rules) ---------- */
const CAN = {
  orders: ["founder", "support"], invoices: ["founder", "support"], void: ["founder"], stock: ["founder", "support"],
  items: ["founder"], promos: ["founder", "marketing"], marketing: ["founder", "marketing"], dealers: ["founder"], settings: ["founder"], subscriptions: ["founder"],
  ratings: ["founder", "support", "marketing"], "ratings:delete": ["founder"],
  aftersales: ["founder", "support"], "aftersales:delete": ["founder"],   // installations, technicians, customers, tickets
};
export function can(what) {
  if (!S.me) return false;
  if (what === "team" || what === "emulators:manage" || what === "tasks:manage" || what === "presence") return !!S.me.owner;
  // Guests (outside reviewers, testers): their assigned emulator, their tasks and the manual; no company data.
  if (what === "emulators") return S.me.role === "founder" || S.me.role === "guest";
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
  if (row.until_ms && Date.now() > row.until_ms) throw new Error(`Your access ended on ${row.until}. Ask ${owner} if you need it again.`);
  return { email: user.email, name: row.name || "", role: row.role, owner: false, until: row.until || "" };
}

/* ---------- live data ---------- */
const WATCH = {
  orders: { orderBy: "submitted_at", desc: true }, invoices: { orderBy: "issued_at", desc: true },
  inventory: {}, products: {}, promos: {}, marketing: { orderBy: "date", desc: true }, dealers: {}, team: {}, signatories: {},
  activity: { orderBy: "at", desc: true, limit: 200 }, stockMoves: { orderBy: "at", desc: true, limit: 300 }, subscriptions: {},
  ratings: { orderBy: "updated_at", desc: true, limit: 2000 },
  technicians: {}, installations: { orderBy: "updated_at", desc: true }, customers: { orderBy: "updated_at", desc: true },
  tickets: { orderBy: "updated_at", desc: true },
};
let stops = [];
export function start(onChange, onError) {
  stop();
  const keep = (col) => (rows) => { S.data[col] = rows; S.loaded.add(col); onChange(col); };
  if (S.me.role === "guest") {
    // Guests read no company data (the rules refuse it); only their own team row, to notice removal.
    stops.push(S.db.watchDoc("team", S.me.email, (d) => keep("team")(d ? [d] : []), onError));
  } else {
    for (const [col, o] of Object.entries(WATCH)) stops.push(S.db.watch(col, keep(col), o, onError));
    for (const id of ["company", "website", "app"]) {
      stops.push(S.db.watchDoc("settings", id, (d) => { S.data.settings[id] = d || {}; onChange("settings"); }, onError));
    }
  }
  // Tasks: the company account sees all; everyone else only their own (the rules allow no more).
  stops.push(S.db.watch("tasks", keep("tasks"), S.me.owner ? {} : { where: ["assignee", "==", S.me.email] }, onError));
  if (can("presence")) stops.push(S.db.watch("presence", keep("presence"), {}, onError));
  // Emulators: the company account sees all; a founder only the ones assigned to them (the rules allow no more).
  if (can("emulators")) {
    const o = S.me.owner ? {} : { where: ["assigned_to", "==", S.me.email] };
    stops.push(S.db.watch("emulators", (rows) => { S.data.emulators = rows; S.loaded.add("emulators"); onChange("emulators"); }, o, onError));
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

export async function recordPayment(no, amount, method, ref) {
  amount = Math.round(Number(amount) || 0);
  if (amount <= 0) throw new Error("Enter the amount received.");
  await S.db.tx(async (t) => {
    const inv = await t.get("invoices", no);
    if (!inv || inv.status !== "issued") throw new Error("Payments can only be added to an issued invoice.");
    const paid = (inv.paid || 0) + amount;
    t.update("invoices", no, { paid, due: inv.total - paid, payment_method: method || inv.payment_method || "", updated_at: nowIso(),
      payments: [...(inv.payments || []), clean({ at: nowIso(), amount, method: method || "", ref: String(ref || "").trim().slice(0, 60) || undefined, by: by() })] });
  });
  log("invoice_payment", no, `${amount} ${method || ""}${ref ? " " + ref : ""}`);
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
/** Website star ratings: founders remove spam (firestore.rules allows nobody else). */
export async function deleteRating(id) { await S.db.del("ratings", id); log("rating_delete", id, ""); }

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
  const row = { email, name: m.name || "", role: m.role, active: m.active !== false, updated_at: nowIso(), updated_by: by() };
  // Optional last day of access (guests especially): after it, the rules let them read nothing.
  if (m.until) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.until)) throw new Error("Choose a valid end date.");
    Object.assign(row, { until: m.until, until_ms: endOfDayDhaka(m.until) });
  }
  await S.db.set("team", email, row);
  log("team_update", email, m.role + (m.until ? " until " + m.until : "") + (m.active === false ? " (removed)" : ""));
}

/** Profile: correct your own display name (the rules allow nothing else on your team row). */
export async function saveMyName(name) {
  name = String(name || "").trim().slice(0, 80);
  if (!name) throw new Error("Type your name.");
  await S.db.update("team", S.me.email, { name, updated_at: nowIso(), updated_by: by() });
  S.me.name = name;
  log("profile_name", S.me.email, name);
}

/* ---------- tasks (company account assigns and reviews; each person submits their own) ---------- */
export async function saveTask(id, v) {
  if (!can("tasks:manage")) throw new Error("Only the company account assigns tasks.");
  const title = String(v.title || "").trim();
  if (!title) throw new Error("Give the task a title.");
  const person = S.data.team.find((m) => m.id === v.assignee && m.active === true);
  if (!person) throw new Error("Choose who the task is for.");
  if (!TASK_KINDS[v.kind]) throw new Error("Choose daily, weekly, monthly or milestone.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.due || "")) throw new Error("Choose a due date.");
  const data = { title: title.slice(0, 200), details: String(v.details || "").slice(0, 2000), assignee: person.id, assignee_name: (person.name || "").slice(0, 80), kind: v.kind, due: v.due };
  if (id) { await S.db.update("tasks", id, data); log("task_edit", id, title); return id; }
  const nid = await S.db.add("tasks", { ...data, status: "open", created_at: nowIso(), created_by: by(), returned_count: 0 });
  log("task_assign", nid, `${title} → ${person.id}`);
  return nid;
}
/** Max files per task and bytes per file: each file is one database document (1 MB limit, data: URL ≈ +33 %). */
export const TASK_FILES_MAX = 5, TASK_FILE_BYTES = 700 * 1024;
/** Submit a task as done: a note, an optional link (e.g. Google Drive) and files ({name, type, size, data}). */
export async function submitTask(id, note, link, files = []) {
  const t = S.data.tasks.find((x) => x.id === id);
  if (!t || t.assignee !== S.me.email) throw new Error("This task is not yours.");
  const had = t.files || [];
  if (had.length + files.length > TASK_FILES_MAX) throw new Error(`Up to ${TASK_FILES_MAX} files per task.`);
  link = String(link || "").trim();
  if (link && !/^https?:\/\//i.test(link)) throw new Error("The link must start with https://");
  const added = [];
  for (const f of files) {
    if (f.size > TASK_FILE_BYTES) throw new Error(`${f.name} is too large (max 700 KB). Share a link instead.`);
    const fid = await S.db.add("taskFiles", { task_id: id, name: f.name.slice(0, 160), type: (f.type || "application/octet-stream").slice(0, 120), size: f.size, data: f.data, assignee: S.me.email, uploaded_by: S.me.email, uploaded_at: nowIso() });
    added.push({ id: fid, name: f.name.slice(0, 160), type: f.type || "", size: f.size });
  }
  await S.db.update("tasks", id, clean({ status: "submitted", submitted_at: nowIso(), submit_note: String(note || "").slice(0, 1000), link: link.slice(0, 500), files: [...had, ...added] }));
  log("task_submit", id, t.title + (added.length ? ` (${added.length} file${added.length > 1 ? "s" : ""})` : ""));
}
/** One attached file as a data: URL (the company account, or the person who attached it). */
export async function taskFile(fileId) {
  const f = await S.db.get("taskFiles", fileId);
  if (!f) throw new Error("This file is no longer available.");
  return f;
}
export async function reviewTask(id, approve, note) {
  if (!can("tasks:manage")) throw new Error("Only the company account reviews tasks.");
  const t = S.data.tasks.find((x) => x.id === id);
  if (!t) return;
  const v = { status: approve ? "approved" : "returned", reviewed_at: nowIso(), review_note: String(note || "").slice(0, 1000) };
  if (!approve) v.returned_count = (t.returned_count || 0) + 1;
  await S.db.update("tasks", id, v);
  log(approve ? "task_approve" : "task_send_back", id, t.title);
}
export async function deleteTask(id) {
  if (!can("tasks:manage")) throw new Error("Only the company account deletes tasks.");
  const t = S.data.tasks.find((x) => x.id === id);
  for (const f of (t && t.files) || []) await S.db.del("taskFiles", f.id).catch(() => {});
  await S.db.del("tasks", id);
  log("task_delete", id, "");
}

/* ---------- who is at the dashboard (read by the company account only) ---------- */
let presenceTimer = 0;
const beat = (online) => S.me ? S.db.set("presence", S.me.email, { email: S.me.email, last_seen: nowIso(), online }).catch(() => {}) : Promise.resolve();
const bye = () => { beat(false); };
export function startPresence() {
  stopPresenceTimer();
  beat(true);
  presenceTimer = setInterval(() => beat(true), 60000);
  window.addEventListener("pagehide", bye);
}
function stopPresenceTimer() { if (presenceTimer) clearInterval(presenceTimer); presenceTimer = 0; window.removeEventListener("pagehide", bye); }
/** On sign-out: say "offline" while still signed in. */
export async function stopPresence() { stopPresenceTimer(); await beat(false); }

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

/* ---------- device emulators (founders' tests) ----------
   An emulator is a test device that runs in the dashboard (js/emulator.js) and behaves like a real one,
   through the same device database and rules. The company account creates one: a device sign-in, its
   sticker code and kit in the device database (rules: only IDs VG-EMU01 to VG-EMU99), and a record here
   that only the company account and the assigned founder can read. Never for real customers' devices. */
const DEVICE_DOMAIN = "venguard-connected.firebaseapp.com";
function randomText(alphabet, n) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join("");
}
export async function createEmulator(kit) {
  if (!can("emulators:manage")) throw new Error("Only the company account creates emulators.");
  kit = kit === "detector_relay" ? "detector_relay" : "complete";
  const taken = new Set(S.data.emulators.map((e) => e.id));
  for (let n = 1; n <= 99; n++) {
    const id = "VG-EMU" + String(n).padStart(2, "0");
    if (taken.has(id)) continue;
    const email = `${id.toLowerCase()}@${DEVICE_DOMAIN}`;
    const password = randomText("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 32);
    const code = randomText("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 12);   // no 0/O/1/I/L: easy to type
    let uid;
    try { uid = await S.db.createDeviceUser(email, password); }
    catch (e) { if (e && e.code === "auth/email-already-in-use") continue; throw e; }
    await S.db.set("emulators", id, { device_id: id, email, password, code, kit, uid, assigned_to: "", ready: false, created_at: nowIso(), created_by: by() });
    await finishEmulator(id);
    log("emulator_create", id, kit);
    return id;
  }
  throw new Error("All emulator IDs are in use. Remove one first.");
}
/** Registers the device in the device database (also used to retry if that step failed). */
export async function finishEmulator(id) {
  const e = S.data.emulators.find((x) => x.id === id) || await S.db.get("emulators", id);
  if (!e) throw new Error("Emulator not found.");
  try {
    await S.db.rtdbUpdate({ [`deviceAuth/${id}`]: e.uid, [`claimCodes/${id}`]: e.code, [`devices/${id}/meta`]: { kit: e.kit } });
  } catch (err) {
    throw new Error("The device database refused it. Publish the latest backend/connected-firebase/database.rules.json (Firebase console → Realtime Database → Rules), then press Finish setup.");
  }
  await S.db.update("emulators", id, { ready: true });
}
export async function assignEmulator(id, email) {
  if (!can("emulators:manage")) throw new Error("Only the company account assigns emulators.");
  await S.db.update("emulators", id, { assigned_to: String(email || "").toLowerCase(), updated_at: nowIso(), updated_by: by() });
  log("emulator_assign", id, email || "nobody");
}
/** Removes the device sign-in, its database entries and the record. Apps that added it see it offline. */
export async function removeEmulator(id) {
  if (!can("emulators:manage")) throw new Error("Only the company account removes emulators.");
  const e = S.data.emulators.find((x) => x.id === id);
  if (!e) return;
  try { const s = await S.db.deviceSession(e.email, e.password); await s.deleteUser(); await s.close(); } catch (err) { /* sign-in already gone */ }
  try { await S.db.rtdbUpdate({ [`deviceAuth/${id}`]: null, [`claimCodes/${id}`]: null, [`devices/${id}/meta`]: null }); } catch (err) { /* rules not published: entries stay, harmless */ }
  await S.db.del("emulators", id);
  log("emulator_remove", id, "");
}

/* ---------- after-sales: technicians, installations, customers, support tickets ---------- */
const stamp = () => ({ updated_at: nowIso(), updated_by: by() });
const text = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
function needAftersales() { if (!can("aftersales")) throw new Error("Only founders and support change after-sales records."); }
function personFields(v) {
  const name = text(v.name, 120);
  if (!name) throw new Error("Type the customer's name.");
  return { name, phone: text(v.phone, 20), email: text(v.email, 120), address: text(v.address, 300), area: text(v.area, 100), district: text(v.district, 60) };
}

export async function saveTechnician(id, v) {
  needAftersales();
  const name = text(v.name, 120);
  if (!name) throw new Error("Type the technician's name.");
  const data = { name, phone: text(v.phone, 20), area: text(v.area, 100), district: text(v.district, 60), dealer_code: text(v.dealer_code, 40).toUpperCase(),
    active: v.active !== false && v.active !== "false", notes: text(v.notes, 1000), ...stamp() };
  if (id) await S.db.update("technicians", id, data); else id = await S.db.add("technicians", { ...data, created_at: nowIso() });
  log("technician_save", id, name);
  return id;
}

/** An installation visit, usually started from an order (its name, phone, address and kit are copied). */
export async function saveInstallation(id, v) {
  needAftersales();
  const tech = S.data.technicians.find((t) => t.id === v.technician_id);
  const status = id ? (S.data.installations.find((x) => x.id === id) || {}).status || "to_schedule" : "to_schedule";
  const data = { ...personFields(v), order_id: text(v.order_id, 40), package: text(v.package, 40), units: Math.max(1, parseInt(v.units, 10) || 1),
    scheduled_date: isDate(v.scheduled_date) ? v.scheduled_date : "", slot: text(v.slot, 40), technician_id: tech ? tech.id : "", technician_name: tech ? tech.name : "",
    notes: text(v.notes, 2000), ...stamp() };
  // Choosing a date moves a new visit to "Scheduled"; removing it moves it back.
  data.status = ["installed", "tested", "cancelled"].includes(status) ? status : data.scheduled_date ? "scheduled" : "to_schedule";
  if (id) await S.db.update("installations", id, data);
  else id = await S.db.add("installations", { ...data, checklist: {}, device_ids: [], created_at: nowIso(), created_by: by() });
  log("installation_save", id, `${data.name} ${data.scheduled_date || "(no date yet)"}`);
  return id;
}
export async function setInstallChecklist(id, checklist, deviceIds) {
  needAftersales();
  const ids = String(deviceIds || "").toUpperCase().split(/[\s,]+/).filter(Boolean).slice(0, 50);
  await S.db.update("installations", id, { checklist, device_ids: ids, ...stamp() });
}
/** installed → after the visit; tested → every checklist item ticked: the customer record is created or
    updated (warranty from Settings → company details), and the order is marked Installed. */
export async function setInstallStatus(id, status) {
  needAftersales();
  if (!INSTALL_STATUS[status]) throw new Error("Unknown status.");
  const i = S.data.installations.find((x) => x.id === id);
  if (!i) return;
  if (status === "tested" && !checklistDone(i.checklist)) throw new Error("Tick every item of the checklist first.");
  const ch = { status, ...stamp() };
  if (status === "installed" || status === "tested") ch.done_at = i.done_at || nowIso();
  if (status === "tested") ch.customer_id = await customerFromInstallation(i);
  await S.db.update("installations", id, ch);
  if (status === "tested" && i.order_id && S.data.orders.some((o) => o.id === i.order_id)) await updateOrder(i.order_id, { status: "installed" });
  log("installation_" + status, id, i.name);
}
async function customerFromInstallation(i) {
  const day = String(i.done_at || nowIso()).slice(0, 10), months = Number((S.data.settings.company || {}).warranty_months) || 0;
  const old = S.data.customers.find((c) => (i.customer_id && c.id === i.customer_id) || samePhone(c.phone, i.phone));
  const base = { name: i.name, phone: i.phone || "", email: i.email || "", address: i.address || "", area: i.area || "", district: i.district || "",
    package: i.package || "", units: i.units || 1, order_id: i.order_id || "", installation_id: i.id, ...stamp() };
  if (old) {
    const devices = [...new Set([...(old.device_ids || []), ...(i.device_ids || [])])];
    await S.db.update("customers", old.id, clean({ ...base, device_ids: devices, install_date: old.install_date || day,
      warranty_until: old.warranty_until || addMonths(day, months) }));
    return old.id;
  }
  return S.db.add("customers", clean({ ...base, device_ids: i.device_ids || [], install_date: day, warranty_until: addMonths(day, months), plan_until: "",
    notes: "", created_at: nowIso(), created_by: by() }));
}

export async function saveCustomer(id, v) {
  needAftersales();
  const data = { ...personFields(v), package: text(v.package, 40), install_date: isDate(v.install_date) ? v.install_date : "",
    warranty_until: isDate(v.warranty_until) ? v.warranty_until : "", plan_until: isDate(v.plan_until) ? v.plan_until : "",
    device_ids: String(v.device_ids || "").toUpperCase().split(/[\s,]+/).filter(Boolean).slice(0, 50), notes: text(v.notes, 2000), ...stamp() };
  if (!id && S.data.customers.some((c) => samePhone(c.phone, data.phone))) throw new Error("A customer with this phone number is already in the list.");
  if (id) await S.db.update("customers", id, data); else id = await S.db.add("customers", { ...data, created_at: nowIso(), created_by: by() });
  log("customer_save", id, data.name);
  return id;
}

export async function saveTicket(id, v) {
  needAftersales();
  if (!TICKET_KINDS[v.kind]) throw new Error("Choose what the ticket is about.");
  const subject = text(v.subject, 200);
  if (!subject) throw new Error("Write a short subject.");
  const cust = S.data.customers.find((c) => c.id === v.customer_id);
  const who = cust ? { name: cust.name, phone: cust.phone || "", email: cust.email || "", address: cust.address || "", area: cust.area || "", district: cust.district || "" } : personFields(v);
  const data = { ...who, customer_id: cust ? cust.id : "", kind: v.kind, subject, details: text(v.details, 3000),
    priority: v.kind === "safety" || v.priority === "urgent" ? "urgent" : "normal", assigned_to: text(v.assigned_to, 120), ...stamp() };
  if (id) await S.db.update("tickets", id, data);
  else id = await S.db.add("tickets", { ...data, status: "open", notes: [], created_at: nowIso(), created_by: by() });
  log("ticket_save", id, subject);
  return id;
}
/** A line on the ticket's history, optionally with a new status. */
export async function addTicketNote(id, note, status) {
  needAftersales();
  const t = S.data.tickets.find((x) => x.id === id);
  if (!t) return;
  note = text(note, 1000);
  if (!note && !status) throw new Error("Write a note or choose a new status.");
  if (status && !TICKET_STATUS[status]) throw new Error("Unknown status.");
  const notes = [...(t.notes || []), clean({ at: nowIso(), by: by(), note: note || undefined, status: status || undefined })].slice(-200);
  const ch = { notes, ...stamp() };
  if (status) { ch.status = status; ch.resolved_at = status === "resolved" ? nowIso() : null; }
  await S.db.update("tickets", id, clean(ch));
  log("ticket_" + (status || "note"), id, t.subject);
}
export async function deleteAftersales(col, id) {
  if (!can("aftersales:delete")) throw new Error("Only founders delete.");
  await S.db.del(col, id);
  log(col.replace(/s$/, "") + "_delete", id, "");
}
