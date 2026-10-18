/* Invoices: issue from an order, print or save as PDF, record payments, revise, re-sign when the
   authorised signatory changes, and cancel. Every change is a new revision with a history line. */

import { $, $$, esc, fmtN, money, day, when, toast, drawer, closeDrawer, on, busy, pill, opts, field, area, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, productMap, issueInvoice, reviseInvoice, resignInvoice, recordPayment, voidInvoice } from "../store.js";
import { totals, promoProblem } from "../calc.js";
import { R } from "../redraw.js";

const F = { q: "", show: "" };
const statusOf = (i) => (i.status === "void" ? ["void", "Cancelled"] : i.due > 0 ? ["due", money(i.due) + " due"] : ["issued", "Paid"]);
const thisMonth = (iso) => String(iso || "").slice(0, 7) === new Date().toISOString().slice(0, 7);

export default {
  id: "invoices", label: "Invoices", icon: "invoices", deps: ["invoices", "settings", "signatories", "products", "promos"],
  badge: () => S.data.invoices.filter((i) => i.status === "issued" && i.due > 0).length,
  render() {
    const all = S.data.invoices, live = all.filter((i) => i.status === "issued");
    const q = F.q.trim().toLowerCase();
    const rows = all.filter((i) => {
      if (F.show === "due" && !(i.status === "issued" && i.due > 0)) return false;
      if (F.show === "void" && i.status !== "void") return false;
      if (F.show === "paid" && !(i.status === "issued" && i.due <= 0)) return false;
      return !q || [i.id, i.order_id, i.customer?.name, i.customer?.phone, i.promo?.code].join(" ").toLowerCase().includes(q);
    });
    const company = S.data.settings.company || {};
    const setup = !company.legal_name || !company.address
      ? `<div class="banner">${ICON.info}<div><strong>Before the first invoice:</strong> add the company's legal name and address${can("settings") ? ` in <button class="linkish" data-act="nav" data-view="settings">Settings → Company</button>` : " (a founder does this in Settings)"}, and upload the authorised signature.</div></div>` : "";
    const month = live.filter((i) => thisMonth(i.issued_at));
    return `${setup}<div class="topline"><div><h1>Invoices</h1><div class="sub">${fmtN(all.length)} invoices</div></div>
      <div class="actions">${can("invoices") ? `<button class="btn primary" data-act="inv:new">${ICON.plus}New invoice</button>` : ""}</div></div>
      <div class="kpis">${kpi("Invoiced this month", money(month.reduce((s, i) => s + i.total, 0)), fmtN(month.length) + " invoices", true)}
        ${kpi("Collected this month", money(month.reduce((s, i) => s + (i.paid || 0), 0)), "on this month's invoices")}
        ${kpi("Still to collect", money(live.reduce((s, i) => s + Math.max(0, i.due || 0), 0)), fmtN(live.filter((i) => i.due > 0).length) + " invoices with money due")}
        ${kpi("Discounts given", money(live.reduce((s, i) => s + (i.promo_discount || 0) + (i.extra_discount || 0), 0)), "promo codes and manual discounts")}</div>
      <div class="toolbar"><label class="search">${ICON.search}<span hidden>Search</span><input id="invQ" type="search" data-input="inv:q" placeholder="Search invoice or order no., customer, phone, promo code" value="${esc(F.q)}"></label>
        <select class="f" data-change="inv:show" aria-label="Show">${opts([["due", "Money due"], ["paid", "Paid"], ["void", "Cancelled"]], F.show, "All invoices")}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>
      ${rows.length ? rows.map((i) => `<tr data-act="inv:open" data-id="${esc(i.id)}" tabindex="0"><td class="mono">${esc(i.id)}${i.rev > 1 ? `<br><span class="type">revision ${i.rev}</span>` : ""}</td>
        <td class="num">${day(i.issued_at)}</td><td class="name"><strong>${esc(i.customer?.name || "")}</strong><br><span class="type">${esc(i.customer?.phone || "")}</span></td>
        <td class="num">${money(i.total)}</td><td class="num">${money(i.paid)}</td><td>${pill(...statusOf(i))}</td></tr>`).join("")
        : emptyRow(6, all.length ? "No invoices match." : "No invoices yet. Open an order and choose Create invoice, or use New invoice.")}
      </tbody></table></div>`;
  },
};
on.input("inv:q", (t) => { F.q = t.value; R.draw(); });
on.input("inv:show", (t) => { F.show = t.value; R.draw(); });
on.act("inv:new", () => newInvoice());

/* ---------- editor (new invoice or a revision) ---------- */
let editing = null;   // invoice number being revised, or null for a new one
function lineRow(l = {}) {
  const prods = S.data.products.filter((p) => p.active !== false), items = S.data.inventory;
  const val = l.product_id ? "p:" + l.product_id : l.sku ? "s:" + l.sku : "free";
  const choices = [...prods.map((p) => ["p:" + p.id, p.name]), ...items.map((i) => ["s:" + i.id, i.name + " (single)"]), ["free", "Other (type a name)"]];
  return `<div class="line"><select class="line-what" aria-label="Item" data-change="inv:item">${opts(choices, val)}</select>
    <input class="line-name" aria-label="Description" value="${esc(l.name || "")}" placeholder="Description" data-input="inv:calc">
    <input class="line-qty num" aria-label="Quantity" inputmode="numeric" value="${esc(l.qty ?? 1)}" data-input="inv:calc">
    <input class="line-price num" aria-label="Unit price (BDT)" inputmode="numeric" value="${esc(l.unit_price ?? "")}" placeholder="Price" data-input="inv:calc">
    <span class="line-amount num"></span><button type="button" class="x small" data-act="inv:rmline" aria-label="Remove line">✕</button></div>`;
}
export function newInvoice(order, inv) {
  if (!can("invoices")) return;
  editing = inv ? inv.id : null;
  const c = inv ? inv.customer : order ? { name: order.name, phone: order.phone, email: order.email, organisation: order.organisation, address: order.address, area: order.area, district: order.district } : {};
  const pm = productMap();
  const lines = inv ? inv.lines : order && order.package && pm[order.package] ? [{ product_id: order.package, name: pm[order.package].name, qty: Number(order.units) || 1, unit_price: pm[order.package].price || "" }] : [{}];
  const promo = inv ? inv.promo?.code || "" : (order && order.promo_code) || "";
  drawer(inv ? `Change ${inv.id}` : "New invoice", `
    <form data-form="inv:save" class="stack" novalidate>
      <input type="hidden" name="order_id" value="${esc(inv ? inv.order_id : order ? order.id : "")}">
      <fieldset><legend>Bill to</legend><div class="form-grid">
        ${field("c_name", "Name", c.name, "required")}${field("c_phone", "Phone", c.phone, 'inputmode="tel"')}
        ${field("c_organisation", "Organisation", c.organisation)}${field("c_email", "Email", c.email, 'type="email"')}
        ${field("c_address", "Address", c.address)}${field("c_area", "Area, district", [c.area, c.district].filter(Boolean).join(", "))}</div></fieldset>
      <fieldset><legend>Items</legend><div class="line head" aria-hidden="true"><span>Item</span><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span><span></span></div>
        <div id="lines">${lines.map(lineRow).join("")}</div>
        <button type="button" class="btn" data-act="inv:addline">${ICON.plus}Add line</button>
        ${!S.data.products.length && !S.data.inventory.length ? `<p class="sub">Tip: add the VenGuard devices and packages in Inventory so you can pick them here and stock goes down by itself.</p>` : ""}</fieldset>
      <fieldset><legend>Discounts, delivery, payment</legend><div class="form-grid">
        <label class="fl" for="f_promo_code">Promo code<input id="f_promo_code" name="promo_code" class="mono" value="${esc(promo)}" data-input="inv:calc" autocomplete="off"><span class="hint" id="promoNote"></span></label>
        ${field("extra_discount", "Other discount (BDT)", inv ? inv.extra_discount || "" : "", 'inputmode="numeric" data-input="inv:calc"')}
        ${field("delivery", "Delivery / installation (BDT)", inv ? inv.delivery || "" : "", 'inputmode="numeric" data-input="inv:calc"')}
        ${inv ? "" : field("paid", "Paid now (BDT)", "", 'inputmode="numeric" data-input="inv:calc"')}
        ${field("payment_method", "Payment method", inv ? inv.payment_method : "", 'placeholder="bKash, Nagad, cash, bank, card" list="payMethods"')}</div>
        <datalist id="payMethods"><option>bKash</option><option>Nagad</option><option>Cash</option><option>Bank transfer</option><option>Card</option></datalist>
        ${area("notes", "Note on the invoice", inv ? inv.notes : "", 'placeholder="e.g. Includes installation and one year warranty"')}
        ${inv ? field("reason", "Why are you changing it?", "", 'required placeholder="e.g. Customer added a second kit"') : ""}</fieldset>
      <div class="totals" id="invTotals"></div>
      <div class="actions"><button class="btn primary" type="submit">${inv ? "Save as revision " + ((inv.rev || 1) + 1) : "Issue invoice"}</button></div>
    </form>`, { wide: true, kicker: inv ? "Revision " + ((inv.rev || 1) + 1) : order ? "From order " + order.id : "" });
  recalc();
}
on.act("inv:addline", () => { $("#lines").insertAdjacentHTML("beforeend", lineRow({})); recalc(); });
on.act("inv:rmline", (t) => { t.closest(".line").remove(); if (!$$("#lines .line").length) $("#lines").insertAdjacentHTML("beforeend", lineRow({})); recalc(); });
on.input("inv:item", (t) => {
  const row = t.closest(".line"), [kind, id] = t.value.split(":");
  const p = kind === "p" ? productMap()[id] : null, it = kind === "s" ? S.data.inventory.find((x) => x.id === id) : null;
  if (p) { row.querySelector(".line-name").value = p.name; if (p.price) row.querySelector(".line-price").value = p.price; }
  if (it) row.querySelector(".line-name").value = it.name;
  recalc();
});
on.input("inv:calc", () => recalc());

function readLines() {
  return $$("#lines .line").map((row) => {
    const [kind, id] = row.querySelector(".line-what").value.split(":");
    return { product_id: kind === "p" ? id : null, sku: kind === "s" ? id : null, name: row.querySelector(".line-name").value.trim(),
      qty: row.querySelector(".line-qty").value, unit_price: row.querySelector(".line-price").value };
  }).filter((l) => l.name || Number(l.unit_price));
}
function promoFor(code) {
  code = String(code || "").trim().toUpperCase();
  if (!code) return { promo: null, note: "" };
  const p = S.data.promos.find((x) => x.id === code);
  const old = editing && S.data.invoices.find((i) => i.id === editing)?.promo?.code === code;
  const problem = old ? "" : promoProblem(p);
  return problem ? { promo: null, note: problem, bad: true } : { promo: p, note: p.type === "percent" ? `${p.value}% off the items` : `${money(p.value)} off` };
}
function recalc() {
  const box = $("#invTotals"); if (!box) return;
  const f = box.closest("form");
  const { promo, note, bad } = promoFor(f.promo_code.value);
  const pn = $("#promoNote"); pn.textContent = note; pn.classList.toggle("bad", !!bad);
  const t = totals({ lines: readLines(), promo, extra_discount: f.extra_discount.value, delivery: f.delivery.value, vat_rate: (S.data.settings.company || {}).vat_rate, paid: f.paid ? f.paid.value : (S.data.invoices.find((i) => i.id === editing) || {}).paid });
  $$("#lines .line").forEach((row) => { row.querySelector(".line-amount").textContent = money((parseInt(row.querySelector(".line-qty").value, 10) || 0) * (parseInt(row.querySelector(".line-price").value, 10) || 0)); });
  box.innerHTML = totalsTable(t, promo && promo.code);
}
function totalsTable(t, code) {
  const r = (k, v, cls = "") => `<tr class="${cls}"><th scope="row">${k}</th><td class="num">${v}</td></tr>`;
  return `<table class="tot">${r("Subtotal", money(t.subtotal))}${t.promo_discount ? r(`Promo ${esc(code || "")}`, "− " + money(t.promo_discount)) : ""}${t.extra_discount ? r("Discount", "− " + money(t.extra_discount)) : ""}
    ${t.delivery ? r("Delivery / installation", money(t.delivery)) : ""}${t.vat ? r(`VAT ${t.vat_rate}%`, money(t.vat)) : ""}${r("Total", money(t.total), "grand")}
    ${t.paid ? r("Paid", money(t.paid)) : ""}${r(t.due < 0 ? "Paid in advance" : "Balance due", money(Math.abs(t.due)), "due")}</table>`;
}
on.form("inv:save", (f, d) => busy(f, async () => {
  const [area_, district] = String(d.c_area || "").split(/,\s*/);
  const draft = { order_id: d.order_id, customer: { name: d.c_name, phone: d.c_phone, organisation: d.c_organisation, email: d.c_email, address: d.c_address, area: area_ || "", district: district || "" },
    lines: readLines(), promo_code: d.promo_code, extra_discount: d.extra_discount, delivery: d.delivery, paid: d.paid, payment_method: d.payment_method, notes: d.notes };
  if (!draft.customer.name) return toast("Write who the invoice is for.");
  if (editing && !d.reason) return toast("Write why you are changing the invoice.");
  try {
    const no = editing ? (await reviseInvoice(editing, draft, d.reason), editing) : await issueInvoice(draft);
    toast((editing ? "Saved " : "Issued ") + no); editing = null;
    setTimeout(() => openInvoice(no), 50);
  } catch (e) { toast(e.message || String(e)); }
}));

/* ---------- one invoice ---------- */
export function openInvoice(no) {
  const i = S.data.invoices.find((x) => x.id === no);
  if (!i) { toast("Opening " + no + "…"); return setTimeout(() => S.data.invoices.find((x) => x.id === no) && openInvoice(no), 600); }
  const sig = i.signatory;
  const current = S.data.signatories.find((s) => s.id === (S.data.settings.company || {}).default_signatory && s.active !== false);
  const stale = i.status === "issued" && current && (!sig || sig.id !== current.id);
  const live = i.status === "issued";
  drawer(i.customer?.name || i.id, `
    <div class="actions"><button class="btn primary" data-act="inv:print" data-id="${esc(i.id)}">${ICON.print}Print / save PDF</button>
      ${live && can("invoices") ? `<button class="btn" data-act="inv:edit" data-id="${esc(i.id)}">${ICON.pen}Change</button>` : ""}
      ${i.order_id ? `<button class="btn" data-act="order:open" data-id="${esc(i.order_id)}">Order ${esc(i.order_id)}</button>` : ""}</div>
    ${stale && can("invoices") ? `<div class="banner">${ICON.info}<div>Signed by <strong>${esc(sig ? sig.name : "nobody")}</strong>. The authorised signatory is now <strong>${esc(current.name)}</strong>.
      <div style="margin-top:8px"><button class="btn" data-act="inv:resign" data-id="${esc(i.id)}">Re-issue with ${esc(current.name)}'s signature</button></div></div></div>` : ""}
    ${i.status === "void" ? `<div class="banner error">${ICON.info}<div><strong>Cancelled</strong> ${day(i.voided_at)}: ${esc(i.void_reason || "")}</div></div>` : ""}
    <div class="totals">${totalsTable(i, i.promo && i.promo.code)}</div>
    <dl class="dl"><dt>Issued</dt><dd>${when(i.issued_at)}</dd><dt>Phone</dt><dd>${esc(i.customer?.phone || "")}</dd>
      ${i.customer?.address ? `<dt>Address</dt><dd>${esc(i.customer.address)}</dd>` : ""}<dt>Items</dt><dd>${(i.lines || []).map((l) => `${esc(l.qty)} × ${esc(l.name)}`).join("<br>")}</dd>
      <dt>Signed by</dt><dd>${sig ? esc(sig.name + (sig.title ? ", " + sig.title : "")) : "No signature"}</dd></dl>
    ${live && can("invoices") && i.due > 0 ? `<form data-form="inv:pay" data-id="${esc(i.id)}" class="panel tight stack"><h2>Record a payment</h2><div class="form-grid">
      ${field("amount", "Amount received (BDT)", i.due, 'inputmode="numeric" required')}${field("method", "Method", i.payment_method, 'list="payMethods2" placeholder="bKash, Nagad, cash…"')}</div>
      <datalist id="payMethods2"><option>bKash</option><option>Nagad</option><option>Cash</option><option>Bank transfer</option><option>Card</option></datalist>
      <div><button class="btn primary" type="submit">Add payment</button></div></form>` : ""}
    ${(i.payments || []).length ? `<section><h2>Payments</h2><ul class="plain">${i.payments.map((p) => `<li class="num">${when(p.at)} · ${money(p.amount)} ${esc(p.method || "")}</li>`).join("")}</ul></section>` : ""}
    <section><h2>History</h2><ul class="plain history">${(i.history || []).slice().reverse().map((h) => `<li><span class="num muted">${when(h.at)}</span> <strong>Rev ${h.rev}</strong> ${esc(h.what)} <span class="muted">· ${esc(h.by)}</span></li>`).join("")}</ul></section>
    ${live && can("void") ? `<details class="danger"><summary>Cancel this invoice</summary><form data-form="inv:void" data-id="${esc(i.id)}" class="stack">
      <p class="sub">Stock goes back and its promo use is freed. The number is kept, marked as cancelled.</p>${field("reason", "Reason", "", 'required placeholder="e.g. Order cancelled by customer"')}
      <div><button class="btn" type="submit">Cancel invoice</button></div></form></details>` : ""}`,
  { kicker: i.id + (i.rev > 1 ? " · revision " + i.rev : ""), after: pill(...statusOf(i)), wide: false });
}
on.act("inv:open", (t) => openInvoice(t.dataset.id));
on.act("inv:edit", (t) => newInvoice(null, S.data.invoices.find((x) => x.id === t.dataset.id)));
on.act("inv:resign", async (t) => {
  t.disabled = true;
  try { await resignInvoice(t.dataset.id); toast("Re-issued with the new signature"); setTimeout(() => openInvoice(t.dataset.id), 50); }
  catch (e) { t.disabled = false; toast(e.message || String(e)); }
});
on.form("inv:pay", (f, d) => busy(f, async () => {
  try { await recordPayment(f.dataset.id, d.amount, d.method); toast("Payment added"); setTimeout(() => openInvoice(f.dataset.id), 50); }
  catch (e) { toast(e.message || String(e)); }
}));
on.form("inv:void", (f, d) => busy(f, async () => {
  try { await voidInvoice(f.dataset.id, d.reason); toast("Invoice cancelled"); setTimeout(() => openInvoice(f.dataset.id), 50); }
  catch (e) { toast(e.message || String(e)); }
}));

/* ---------- printable invoice (the browser's Print dialog also saves it as PDF) ---------- */
on.act("inv:print", (t) => printInvoice(t.dataset.id));
export function printInvoice(no) {
  const i = S.data.invoices.find((x) => x.id === no); if (!i) return;
  const c = i.company || {}, cu = i.customer || {};
  const sigImg = i.signatory && (S.data.signatories.find((s) => s.id === i.signatory.id) || {}).signature;
  const line = (k, v) => (v ? `<div>${k ? `<span class="k">${k}</span> ` : ""}${esc(v)}</div>` : "");
  $("#printRoot").innerHTML = `<article class="invoice-doc${i.status === "void" ? " is-void" : ""}">
    <header class="inv-head"><div><img class="inv-logo" src="../VENGuard/assets/img/logo/VenGuard_Logo_Primary_FullColour_RGB.svg" alt="VenGuard">
      <div class="inv-co"><strong>${esc(c.legal_name || "")}</strong>${line("", c.address)}${line("", [c.phone, c.email].filter(Boolean).join(" · "))}${line("", c.website)}${line("BIN", c.bin)}${line("Trade licence", c.trade_license)}</div></div>
      <div class="inv-meta"><h1>Invoice</h1>${line("No.", i.id)}${line("Date", day(i.issued_at))}${i.rev > 1 ? line("Revision", String(i.rev)) : ""}${line("Order", i.order_id)}</div></header>
    <section class="inv-bill"><div class="k">Bill to</div><strong>${esc(cu.name || "")}</strong>${line("", cu.organisation)}${line("", cu.address)}${line("", [cu.area, cu.district].filter(Boolean).join(", "))}${line("", [cu.phone, cu.email].filter(Boolean).join(" · "))}</section>
    <table class="inv-lines"><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
      <tbody>${(i.lines || []).map((l, n) => `<tr><td>${n + 1}</td><td>${esc(l.name)}</td><td class="r">${fmtN(l.qty)}</td><td class="r">${money(l.unit_price)}</td><td class="r">${money(l.amount)}</td></tr>`).join("")}</tbody></table>
    <div class="inv-sum">${totalsTable(i, i.promo && i.promo.code)}</div>
    ${i.payment_method || (i.payments || []).length ? `<p class="inv-note"><span class="k">Payment</span> ${esc([...new Set((i.payments || []).map((p) => p.method).concat(i.payment_method).filter(Boolean))].join(", "))}</p>` : ""}
    ${i.notes ? `<p class="inv-note">${esc(i.notes)}</p>` : ""}
    ${c.terms ? `<p class="inv-terms">${esc(c.terms)}</p>` : ""}
    <footer class="inv-foot"><div class="inv-sign">${sigImg ? `<img src="${esc(sigImg)}" alt="Signature">` : '<div class="sig-space"></div>'}
      <div class="sig-line">${esc(i.signatory ? i.signatory.name : "")}${i.signatory && i.signatory.title ? `<br><span>${esc(i.signatory.title)}</span>` : ""}<br><span>Authorised signature</span></div></div>
      <div class="inv-small">${esc(i.id)}${i.rev > 1 ? " · revision " + i.rev : ""} · printed ${day(new Date().toISOString())}</div></footer>
    ${i.status === "void" ? '<div class="void-stamp">Cancelled</div>' : ""}</article>`;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  const img = $("#printRoot .inv-logo");
  const go = () => setTimeout(() => window.print(), 50);
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
}
