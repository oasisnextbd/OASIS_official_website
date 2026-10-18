/* Orders & leads: everything customers sent (website, WhatsApp, calls, fairs). */

import { $, esc, fmtN, cap, when, toast, drawer, closeDrawer, on, busy, pill, opts, field, select, area, emptyRow, toCsv, parseCsv, download, copyText, money, ICON } from "../ui.js";
import { S, can, STATUSES, STATUS, TYPE, PACKAGE, addOrder, updateOrder, importOrders } from "../store.js";
import { CHANNELS, channelOf } from "../calc.js";
import { R } from "../redraw.js";
import { newInvoice } from "./invoices.js";

const F = { q: "", type: "", status: "", district: "", sort: "submitted_at", dir: -1 };
export const sourceLabel = (o) => CHANNELS[channelOf(o)] || (o.referrer && o.referrer !== "direct" ? o.referrer : "Direct");

function filtered() {
  const q = F.q.trim().toLowerCase().replace(/\s+/g, " ");
  return S.data.orders.filter((o) => {
    if (F.type && o.form_type !== F.type) return false;
    if (F.status && o.status !== F.status) return false;
    if (F.district && o.district !== F.district) return false;
    if (q && ![o.name, o.phone, o.id, o.area, o.district, o.organisation, o.dealer_code, o.email, o.promo_code].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    let x = a[F.sort] ?? "", y = b[F.sort] ?? "";
    if (F.sort === "units") { x = +x || 0; y = +y || 0; }
    return (x > y ? 1 : x < y ? -1 : 0) * F.dir;
  });
}

export default {
  id: "orders", label: "Orders & leads", icon: "orders", deps: ["orders", "invoices"],
  badge: () => S.data.orders.filter((o) => o.status === "new" || o.status === "payment_pending").length,
  render() {
    const rows = filtered(), all = S.data.orders;
    const districts = [...new Set(all.map((o) => o.district).filter(Boolean))].sort().map((d) => [d, d]);
    const th = (k, label) => `<th><button type="button" data-act="order:sort" data-k="${k}">${label}${F.sort === k ? (F.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`;
    return `<div class="topline"><div><h1>Orders &amp; leads</h1><div class="sub">${fmtN(rows.length)} of ${fmtN(all.length)} shown</div></div>
      <div class="actions">${can("orders") ? `<button class="btn primary" data-act="order:add">${ICON.plus}Add order</button>` : ""}
      <button class="btn" data-act="order:copycsv">${ICON.copy}Copy as CSV</button><button class="btn" data-act="order:csv">${ICON.down}Export CSV</button>
      ${can("orders") ? `<button class="btn" data-act="order:import">${ICON.up}Import CSV</button>` : ""}</div></div>
      <div class="toolbar"><label class="search">${ICON.search}<span hidden>Search</span><input id="orderQ" type="search" data-input="order:q" placeholder="Search name, phone, order no., area, dealer or promo code" value="${esc(F.q)}"></label>
      <select class="f" data-change="order:filter" data-k="type" aria-label="Type">${opts(Object.entries(TYPE), F.type, "All types")}</select>
      <select class="f" data-change="order:filter" data-k="status" aria-label="Status">${opts(STATUSES.map((s) => [s, STATUS[s]]), F.status, "All statuses")}</select>
      <select class="f" data-change="order:filter" data-k="district" aria-label="District">${opts(districts, F.district, "All districts")}</select></div>
      <div class="table-wrap"><table><thead><tr>${th("submitted_at", "Received")}${th("id", "Order")}${th("name", "Name")}<th>Phone</th>${th("form_type", "Type")}${th("district", "Area")}<th>Source</th>${th("status", "Status")}</tr></thead><tbody>
      ${rows.length ? rows.slice(0, 500).map((o) => `<tr data-act="order:open" data-id="${esc(o.id)}" tabindex="0">
        <td class="num">${when(o.submitted_at)}</td><td class="mono">${esc(o.id)}</td>
        <td class="name"><strong>${esc(o.name)}</strong>${o.organisation ? `<br><span class="type">${esc(o.organisation)}</span>` : ""}</td>
        <td class="num">${esc(o.phone)}</td><td>${esc(TYPE[o.form_type] || o.form_type || "")}${o.package ? `<br><span class="type">${esc(PACKAGE[o.package] || o.package)}</span>` : ""}</td>
        <td>${esc(o.area || "")}<br><span class="type">${esc(o.district || "")}</span></td>
        <td>${esc(sourceLabel(o))}${o.dealer_code ? `<br><span class="type mono">${esc(o.dealer_code)}</span>` : ""}${o.promo_code ? `<br><span class="type mono">${esc(o.promo_code)}</span>` : ""}</td>
        <td>${pill(o.status, STATUS[o.status])}</td></tr>`).join("")
        : emptyRow(8, all.length ? "No orders match these filters." : "No orders yet. Use Add order to record one from WhatsApp, email or a call.")}
      </tbody></table></div>${rows.length > 500 ? '<p class="sub">Showing the first 500. Narrow the search or export to see all.</p>' : ""}`;
  },
};

on.input("order:q", (t) => { F.q = t.value; R.draw(); });
on.input("order:filter", (t) => { F[t.dataset.k] = t.value; R.draw(); });
on.act("order:sort", (t) => { const k = t.dataset.k; F.dir = F.sort === k ? -F.dir : -1; F.sort = k; R.draw(); });

/* ---------- one order ---------- */
export function openOrder(id) {
  const o = S.data.orders.find((x) => x.id === id);
  if (!o) return;
  const wa = "https://wa.me/88" + String(o.phone || "").replace(/^\+?88/, "");
  const invs = S.data.invoices.filter((i) => i.order_id === id);
  const rows = [["Received", when(o.submitted_at)], ["Type", TYPE[o.form_type]], ["Package", PACKAGE[o.package] || o.package], ["Kitchen", cap(o.kitchen_type)], ["Units", o.units],
    ["Organisation", o.organisation], ["Address", o.address], ["Area", [o.area, o.district].filter(Boolean).join(", ")], ["Email", o.email], ["Cylinder", o.cylinder_brand],
    ["Dealer code", o.dealer_code], ["Promo code", o.promo_code], ["Source", sourceLabel(o) + (o.utm_campaign ? " · " + o.utm_campaign : "")], ["Message", o.message]];
  drawer(o.name, `
    <div class="panel tight"><div class="big num">${esc(o.phone)}</div><div class="actions" style="margin-top:10px">
      <a class="btn primary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="tel:${esc(o.phone)}">Call</a>
      <button class="btn" data-act="order:copyphone" data-phone="${esc(o.phone)}">${ICON.copy}Copy number</button></div></div>
    <dl class="dl">${rows.filter((r) => r[1]).map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>
    <section><h2>Invoices</h2>${invs.length ? `<ul class="plain">${invs.map((i) => `<li><button type="button" class="linkish" data-act="inv:open" data-id="${esc(i.id)}"><span class="mono">${esc(i.id)}</span></button> ${pill(i.status === "void" ? "void" : i.due > 0 ? "due" : "issued", i.status === "void" ? "Cancelled" : i.due > 0 ? money(i.due) + " due" : "Paid")}</li>`).join("")}</ul>` : '<p class="muted">No invoice yet.</p>'}
      ${can("invoices") ? `<button class="btn" data-act="order:invoice" data-id="${esc(o.id)}">${ICON.invoices}Create invoice</button>` : ""}</section>
    ${can("orders") ? `<form data-form="order:edit" data-id="${esc(o.id)}" class="stack">
      ${select("status", "Status", STATUSES.map((s) => [s, STATUS[s]]), o.status)}
      ${area("team_notes", "Team notes", o.team_notes, 'placeholder="e.g. Called 3 pm, will pay by bKash on Friday"')}
      ${field("address", "Delivery address", o.address, 'placeholder="House, road, area (for the invoice)"')}
      <div><button class="btn primary" type="submit">Save changes</button></div></form>`
    : `${o.team_notes ? `<div><h2>Team notes</h2><p>${esc(o.team_notes)}</p></div>` : ""}<p class="sub">Your role can view orders but not change them.</p>`}`,
  { kicker: o.id, after: pill(o.status, STATUS[o.status]) });
}
on.act("order:open", (t) => openOrder(t.dataset.id));
on.act("order:copyphone", (t) => copyText(t.dataset.phone, "Number copied"));
on.act("order:invoice", (t) => newInvoice(S.data.orders.find((o) => o.id === t.dataset.id)));

// Shown at once; saved in the background, and put back if the save fails.
on.form("order:edit", (f, d) => {
  const o = S.data.orders.find((x) => x.id === f.dataset.id);
  const before = { status: o.status, team_notes: o.team_notes, address: o.address };
  Object.assign(o, d); closeDrawer(); R.draw(); toast("Saving " + o.id + "…");
  updateOrder(o.id, d).then(() => toast("Saved " + o.id)).catch((e) => { Object.assign(o, before); R.draw(); toast("Not saved: " + (e.message || e)); });
});

/* ---------- add an order (WhatsApp / email / phone / in person) ----------
   The website's WhatsApp and email hand-off sends lines like "Name: Rahim" (English or Bangla labels),
   so pasting the message fills the form. Everything stays editable before saving. */
const MSG_TYPES = { "pre-order": "preorder", "প্রি-অর্ডার": "preorder", enquiry: "enquiry", "অনুসন্ধান": "enquiry", dealer: "dealer", "ডিলার": "dealer", waitlist: "waitlist", "অপেক্ষা": "waitlist", message: "contact", "বার্তা": "contact" };
const MSG_LABELS = { order: "order_id", reference: "order_id", "অর্ডার": "order_id", "রেফারেন্স": "order_id", name: "name", "নাম": "name", phone: "phone", "ফোন": "phone", email: "email", "ইমেইল": "email",
  organisation: "organisation", "প্রতিষ্ঠান": "organisation", area: "area", "এলাকা": "area", district: "district", "জেলা": "district", package: "package", "প্যাকেজ": "package",
  kitchen: "kitchen_type", "রান্নাঘর": "kitchen_type", business: "business_type", "ব্যবসা": "business_type", units: "units", "ইউনিট": "units", cylinder: "cylinder_brand", "সিলিন্ডার": "cylinder_brand",
  "dealer code": "dealer_code", "ডিলার কোড": "dealer_code", "promo code": "promo_code", "প্রোমো কোড": "promo_code", message: "message", "বার্তা": "message" };
export function parseMessage(text) {
  const o = {}, lines = String(text || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length) { const head = lines[0].toLowerCase(); for (const k of Object.keys(MSG_TYPES)) if (!o.form_type && head.includes("venguard") && head.includes(k)) o.form_type = MSG_TYPES[k]; }
  for (const ln of lines) {
    const m = ln.match(/^([^:：]{2,24})\s*[:：]\s*(.+)$/); if (!m) continue;
    const key = MSG_LABELS[m[1].trim().toLowerCase()]; if (key && !o[key]) o[key] = m[2].trim();
  }
  // Bangla digits in a phone number or order number become ASCII.
  for (const k of ["phone", "units", "order_id"]) if (o[k]) o[k] = o[k].replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));
  if (o.phone) o.phone = o.phone.replace(/[\s-]/g, "").replace(/^\+?88(?=01)/, "");
  return o;
}
const ADD_FIELDS = [["name", "Name"], ["phone", "Phone"], ["order_id", "Order number (if they have one)"], ["email", "Email"], ["area", "Area"], ["district", "District"],
  ["address", "Address"], ["organisation", "Organisation"], ["units", "Units"], ["kitchen_type", "Kitchen"], ["cylinder_brand", "Cylinder"], ["dealer_code", "Dealer code"], ["promo_code", "Promo code"]];
on.act("order:add", () => {
  drawer("Add order", `
    <label class="fl" for="a_msg">Paste the WhatsApp or email message<textarea id="a_msg" autofocus placeholder="VenGuard pre-order&#10;Order: VG-261018-9B1O&#10;Name: &#8230;&#10;Phone: 01&#8230;"></textarea></label>
    <div><button class="btn" type="button" data-act="order:parse">Fill in from message</button></div>
    <form data-form="order:add" class="stack" novalidate><div class="form-grid">
      ${select("form_type", "Type", Object.entries(TYPE), "preorder")}
      ${select("heard_from", "Came by", [["whatsapp", "WhatsApp"], ["email", "Email"], ["phone_call", "Phone call"], ["fair", "In person / fair"], ["dealer", "Dealer"], ["facebook", "Facebook"]], "whatsapp")}
      ${ADD_FIELDS.map(([k, l]) => field(k, l, "", k === "phone" ? 'inputmode="tel"' : k === "order_id" || k === "promo_code" ? 'class="mono"' : "")).join("")}
      ${select("package", "Package", [["", "Not said"], ...Object.entries(PACKAGE)], "")}</div>
      ${area("message", "Message", "")}
      <div><button class="btn primary" type="submit">Save order</button></div></form>`);
});
on.act("order:parse", () => {
  const o = parseMessage($("#a_msg").value); let n = 0;
  for (const [k, v] of Object.entries(o)) { const el = $("#f_" + k); if (el && v) { el.value = v; n++; } }
  toast(n ? `Filled ${n} field${n > 1 ? "s" : ""}. Check them, then save.` : "Nothing recognised. Fill the form by hand.");
});
on.form("order:add", (f, d) => busy(f, async () => {
  try { const id = await addOrder(d); toast("Saved " + id); closeDrawer(); }
  catch (e) { toast(e.message || String(e)); }
}));

/* ---------- export / import ---------- */
const CSV_COLS = ["submitted_at", "order_id", "form_type", "status", "name", "phone", "email", "organisation", "address", "area", "district", "package", "kitchen_type", "units",
  "cylinder_brand", "heard_from", "utm_source", "utm_campaign", "dealer_code", "promo_code", "message", "team_notes"];
const csvRows = () => filtered().map((o) => ({ ...o, order_id: o.id }));
on.act("order:csv", () => { download("venguard-orders-" + new Date().toISOString().slice(0, 10) + ".csv", toCsv(csvRows(), CSV_COLS)); toast("CSV downloaded."); });
on.act("order:copycsv", () => copyText(toCsv(csvRows(), CSV_COLS), "CSV copied. Paste it into a spreadsheet."));
on.act("order:import", () => drawer("Import orders from CSV", `
  <p class="sub">For orders kept in the old VenGuard Leads Google Sheet: open it, File → Download → Comma-separated values, then choose that file here. Column names stay the same; orders already here are skipped.</p>
  <form data-form="order:import" class="stack"><label class="fl" for="csvFile">CSV file<input id="csvFile" name="file" type="file" accept=".csv,text/csv" required></label>
  <div><button class="btn primary" type="submit">Import</button></div></form>`));
on.form("order:import", (f) => busy(f, async () => {
  const file = f.querySelector("#csvFile").files[0];
  if (!file) return toast("Choose a CSV file.");
  try { const r = await importOrders(parseCsv(await file.text())); toast(`${r.added} added, ${r.skipped} skipped.`); closeDrawer(); }
  catch (e) { toast(e.message || String(e)); }
}, "Importing…"));
