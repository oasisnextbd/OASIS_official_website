/* Business rules with no screen or database code, so they are easy to read and test
   (team-dashboard/tests/calc.test.mjs). Money is whole Bangladeshi taka. */

const toInt = (v) => Math.round(Number(v) || 0);

/** Why a promo code cannot be used today, or "" if it can. `day` is YYYY-MM-DD. */
export function promoProblem(p, day = new Date().toISOString().slice(0, 10)) {
  if (!p) return "This code does not exist.";
  if (!p.active) return "This code is switched off.";
  if (p.starts && day < p.starts) return "This code starts on " + p.starts + ".";
  if (p.ends && day > p.ends) return "This code ended on " + p.ends + ".";
  if (p.max_uses && (p.used || 0) >= p.max_uses) return "This code has been used its maximum number of times.";
  return "";
}

/** Discount a promo gives on an amount (never more than the amount). */
export function promoDiscount(p, amount) {
  if (!p) return 0;
  const d = p.type === "percent" ? Math.round((amount * Math.min(100, Math.max(0, Number(p.value) || 0))) / 100) : toInt(p.value);
  return Math.max(0, Math.min(amount, d));
}

/**
 * Totals of an invoice.
 *  lines: [{ qty, unit_price }], promo (optional), extra_discount, delivery, vat_rate (%), paid.
 * Order: subtotal - discounts = net; + delivery; VAT on that; total; due = total - paid.
 */
export function totals(inv) {
  const lines = (inv.lines || []).map((l) => ({ ...l, qty: toInt(l.qty), unit_price: toInt(l.unit_price) }));
  lines.forEach((l) => { l.amount = l.qty * l.unit_price; });
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const promo_discount = promoDiscount(inv.promo, subtotal);
  const extra_discount = Math.max(0, Math.min(subtotal - promo_discount, toInt(inv.extra_discount)));
  const net = subtotal - promo_discount - extra_discount;
  const delivery = Math.max(0, toInt(inv.delivery));
  const vat_rate = Math.max(0, Number(inv.vat_rate) || 0);
  const vat = Math.round(((net + delivery) * vat_rate) / 100);
  const total = net + delivery + vat;
  const paid = Math.max(0, toInt(inv.paid));
  return { lines, subtotal, promo_discount, extra_discount, discount: promo_discount + extra_discount, delivery, vat_rate, vat, total, paid, due: total - paid };
}

/**
 * Stock each invoice line takes, per inventory SKU.
 * A line with a product uses that product's components (e.g. complete kit = DET + VALVE + RELAY);
 * a line with a SKU uses that item directly; a free-text line uses no stock.
 */
export function stockNeeds(lines, products) {
  const need = {};
  for (const l of lines || []) {
    const q = toInt(l.qty);
    if (!q) continue;
    const p = l.product_id && products[l.product_id];
    if (p && p.components) for (const [sku, n] of Object.entries(p.components)) need[sku] = (need[sku] || 0) + q * toInt(n);
    else if (l.sku) need[l.sku] = (need[l.sku] || 0) + q;
  }
  return need;
}

/** Difference between what a revised invoice needs and what the old version took (positive = take more). */
export function stockDelta(oldNeed, newNeed) {
  const d = {};
  for (const k of new Set([...Object.keys(oldNeed), ...Object.keys(newNeed)])) {
    const v = (newNeed[k] || 0) - (oldNeed[k] || 0);
    if (v) d[k] = v;
  }
  return d;
}

/** Next invoice number, e.g. INV-2026-0007. */
export function invoiceNo(prefix, year, n) {
  return `${(prefix || "INV").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "INV"}-${year}-${String(n).padStart(4, "0")}`;
}

/** Marketing channel an order counts for, from what the website and the team recorded. */
export const CHANNELS = {
  facebook: "Facebook", instagram: "Instagram", google: "Google", youtube: "YouTube", whatsapp: "WhatsApp",
  fair: "Fairs & events", dealer: "Dealers", print: "Print & stickers", influencer: "Influencers", friend: "Word of mouth", other: "Other",
};
export function channelOf(o) {
  const s = String(o.utm_source || o.heard_from || "").toLowerCase();
  if (o.dealer_code || s === "qr" || s.includes("dealer")) return "dealer";
  if (/^(fb|facebook|meta)/.test(s) || s.includes("facebook")) return "facebook";
  if (s.includes("insta")) return "instagram";
  if (s.includes("youtube") || s === "yt") return "youtube";
  if (s.includes("google")) return "google";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("fair") || s.includes("event") || s === "walk_in") return "fair";
  if (s.includes("print") || s.includes("sticker") || s.includes("leaflet")) return "print";
  if (s.includes("influenc")) return "influencer";
  if (s.includes("friend") || s.includes("word")) return "friend";
  return s ? "other" : "";
}

/* ---------- subscriptions & renewals ---------- */
export const CYCLES = { monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly", two_years: "Every 2 years", once: "One-time", free: "Free" };
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12, two_years: 24 };

/** Days from `today` (YYYY-MM-DD) to `date`; negative when it has passed. */
export function daysUntil(date, today = new Date().toISOString().slice(0, 10)) {
  if (!date) return null;
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
}
/** The renewal date after `date` for a billing cycle (31 Jan + 1 month = 28/29 Feb). */
export function nextRenewal(date, cycle) {
  const m = MONTHS[cycle];
  if (!date || !m) return "";
  const [y, mo, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + m, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
/** What a subscription costs per month, in its own currency (0 for free or one-time). */
export function monthlyCost(s) {
  const m = MONTHS[s.cycle];
  return m ? (Number(s.cost) || 0) / m : 0;
}
/** "overdue" | "soon" (within its reminder window, 30 days by default) | "ok" | "none" (no date). */
export function renewalState(s, today) {
  const n = daysUntil(s.renews_on, today);
  if (n === null || s.cycle === "free" || s.cycle === "once") return "none";
  if (n < 0) return "overdue";
  return n <= (Number(s.remind_days) || 30) ? "soon" : "ok";
}
