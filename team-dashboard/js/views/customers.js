/* Customers: everyone with a VenGuard installed. Added automatically when an installation is "Tested &
   handed over" (or by hand). One card per customer brings together their orders, invoices, installation
   visits and support tickets, with the warranty and Connected plan end dates (flagged 30 days before they end). */

import { esc, fmtN, money, day, ago, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, toCsv, download, ICON } from "../ui.js";
import { S, can, PACKAGE, STATUS, saveCustomer, deleteAftersales } from "../store.js";
import { untilState, samePhone, dhakaToday, TICKET_KINDS } from "../calc.js";
import { R } from "../redraw.js";

let F = { q: "", district: "", show: "" };
const UNTIL = { active: ["paid", "Active"], ending: ["due", "Ending soon"], ended: ["void", "Ended"], none: ["off", "Not set"] };
const untilPill = (d) => { const s = untilState(d, dhakaToday()), [k, l] = UNTIL[s]; return `${pill(k, l)}${d ? `<br><span class="type">${esc(day(d))}</span>` : ""}`; };
const openTickets = (c) => S.data.tickets.filter((t) => t.status !== "resolved" && (t.customer_id === c.id || (!t.customer_id && samePhone(t.phone, c.phone))));

export default {
  id: "customers", label: "Customers", icon: "customers", deps: ["customers", "tickets", "orders", "invoices", "installations", "settings"],
  render() {
    const t0 = dhakaToday(), all = S.data.customers, q = F.q.trim().toLowerCase();
    const list = all.filter((c) => (!F.district || c.district === F.district)
      && (!q || [c.name, c.phone, c.email, c.area, ...(c.device_ids || [])].some((v) => String(v || "").toLowerCase().includes(q)))
      && (!F.show || (F.show === "warranty" ? ["ending", "ended"].includes(untilState(c.warranty_until, t0)) : F.show === "plan" ? ["ending", "ended"].includes(untilState(c.plan_until, t0)) : openTickets(c).length > 0)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const districts = [...new Set(all.map((c) => c.district).filter(Boolean))].sort();
    const warrantyMonths = Number((S.data.settings.company || {}).warranty_months) || 0;
    return `<div class="topline"><div><h1>Customers</h1><div class="sub">Everyone with a VenGuard installed. Added when an installation is tested and handed over, or by hand.</div></div>
        <div class="actions">${can("aftersales") ? `<button class="btn primary" data-act="cus:new">${ICON.plus}Add customer</button>` : ""}<button class="btn" data-act="cus:csv">${ICON.down}Export CSV</button></div></div>
      ${warrantyMonths ? "" : `<div class="banner">${ICON.info}<div><strong>Warranty length not set.</strong> Once the founders decide it, a founder sets it in Settings → Company details; new customers then get their warranty end date by themselves.</div></div>`}
      <div class="kpis">${kpi("Customers", fmtN(all.length), fmtN(all.reduce((s, c) => s + (c.device_ids || []).length, 0)) + " devices", true)}
        ${kpi("Warranty ending", fmtN(all.filter((c) => untilState(c.warranty_until, t0) === "ending").length), "in the next 30 days")}
        ${kpi("Connected plan renewals", fmtN(all.filter((c) => untilState(c.plan_until, t0) === "ending").length), "due in the next 30 days")}
        ${kpi("With an open ticket", fmtN(all.filter((c) => openTickets(c).length).length), "see Support")}</div>
      <section class="panel"><div class="panel-head"><h2>All customers</h2><div class="filters">
        <label class="search">${ICON.search}<span hidden>Search</span><input id="cus_q" type="search" placeholder="Name, phone, area or device ID" value="${esc(F.q)}" data-input="cus:filter" data-k="q"></label>
        <select class="f" data-change="cus:filter" data-k="district" aria-label="District"><option value="">All districts</option>${districts.map((d) => `<option${F.district === d ? " selected" : ""}>${esc(d)}</option>`).join("")}</select>
        <select class="f" data-change="cus:filter" data-k="show" aria-label="Show"><option value="">Everyone</option><option value="warranty"${F.show === "warranty" ? " selected" : ""}>Warranty ending or ended</option>
          <option value="plan"${F.show === "plan" ? " selected" : ""}>Plan renewal due or ended</option><option value="tickets"${F.show === "tickets" ? " selected" : ""}>With an open ticket</option></select></div></div>
      <div class="table-wrap flat"><table><thead><tr><th>Customer</th><th>Area</th><th>Kit</th><th>Installed</th><th>Warranty</th><th>Connected plan</th><th class="num">Open tickets</th></tr></thead><tbody>
      ${list.length ? list.map((c) => `<tr data-act="cus:open" data-id="${esc(c.id)}" tabindex="0"><td><strong>${esc(c.name)}</strong><br><span class="type">${esc(c.phone || "")}</span></td>
        <td>${esc([c.area, c.district].filter(Boolean).join(", "))}</td><td>${esc(PACKAGE[c.package] || c.package || "")}${(c.device_ids || []).length ? `<br><span class="type mono">${esc(c.device_ids.join(", "))}</span>` : ""}</td>
        <td class="num">${c.install_date ? esc(day(c.install_date)) : "—"}</td><td>${untilPill(c.warranty_until)}</td><td>${untilPill(c.plan_until)}</td><td class="num">${fmtN(openTickets(c).length)}</td></tr>`).join("")
        : emptyRow(7, all.length ? "No customer matches." : "No customers yet. They appear when an installation is tested and handed over.")}</tbody></table></div></section>`;
  },
};
on.input("cus:filter", (el) => { F[el.dataset.k] = el.value; R.draw(); });
on.act("cus:csv", () => download("venguard-customers.csv", toCsv(S.data.customers.map((c) => ({ ...c, device_ids: (c.device_ids || []).join(" ") })),
  ["name", "phone", "email", "address", "area", "district", "package", "device_ids", "install_date", "warranty_until", "plan_until", "order_id", "notes"])));

export function openCustomer(id) {
  const c = S.data.customers.find((x) => x.id === id);
  if (!c) return;
  const orders = S.data.orders.filter((o) => o.id === c.order_id || samePhone(o.phone, c.phone));
  const ids = new Set(orders.map((o) => o.id));
  const invs = S.data.invoices.filter((i) => ids.has(i.order_id) || samePhone(i.customer && i.customer.phone, c.phone));
  const visits = S.data.installations.filter((i) => i.customer_id === c.id || ids.has(i.order_id));
  const tickets = S.data.tickets.filter((t) => t.customer_id === c.id || (!t.customer_id && samePhone(t.phone, c.phone)));
  const wa = c.phone ? "https://wa.me/88" + String(c.phone).replace(/\D/g, "").replace(/^88/, "") : "";
  const li = (act, id, main, side) => `<li data-act="${act}" data-id="${esc(id)}" tabindex="0"><span>${main}</span><span class="type">${side}</span></li>`;
  drawer(c.name, `<div class="stack">
    <div class="panel tight"><div class="big num">${esc(c.phone || "")}</div><div class="actions" style="margin-top:8px">${c.phone ? `<a class="btn primary sm" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.whatsapp}WhatsApp</a><a class="btn sm" href="tel:${esc(c.phone)}">Call</a>` : ""}
      ${can("aftersales") ? `<button class="btn sm" data-act="tic:new" data-customer="${esc(c.id)}">${ICON.support}New ticket</button>` : ""}</div></div>
    <dl class="dl"><dt>Address</dt><dd>${esc([c.address, c.area, c.district].filter(Boolean).join(", ") || "—")}</dd><dt>Kit</dt><dd>${esc(PACKAGE[c.package] || c.package || "—")}</dd>
      <dt>Devices</dt><dd class="mono">${esc((c.device_ids || []).join(", ") || "—")}</dd><dt>Installed</dt><dd>${c.install_date ? esc(day(c.install_date)) : "—"}</dd>
      <dt>Warranty</dt><dd>${untilPill(c.warranty_until)}</dd><dt>Connected plan</dt><dd>${untilPill(c.plan_until)}</dd>${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}</dl>
    <section><h2>Support tickets</h2>${tickets.length ? `<ul class="plain followup">${tickets.map((t) => li("tic:open", t.id, `<strong>${esc(t.subject)}</strong><br><span class="type">${esc(TICKET_KINDS[t.kind])}</span>`, esc(t.status === "resolved" ? "Resolved" : "Open · " + ago(t.updated_at)))).join("")}</ul>` : '<p class="muted">None.</p>'}</section>
    <section><h2>Installation visits</h2>${visits.length ? `<ul class="plain followup">${visits.map((i) => li("ins:open", i.id, esc(i.scheduled_date ? day(i.scheduled_date) : "No date"), esc(i.technician_name || i.status))).join("")}</ul>` : '<p class="muted">None.</p>'}</section>
    <section><h2>Orders</h2>${orders.length ? `<ul class="plain followup">${orders.map((o) => li("cus:order", o.id, `<span class="mono">${esc(o.id)}</span>`, esc(STATUS[o.status] || o.status))).join("")}</ul>` : '<p class="muted">None found with this phone number.</p>'}</section>
    <section><h2>Invoices</h2>${invs.length ? `<ul class="plain followup">${invs.map((i) => li("inv:open", i.id, `<span class="mono">${esc(i.id)}</span>`, esc(i.status === "void" ? "Cancelled" : i.due > 0 ? money(i.due) + " due" : "Paid"))).join("")}</ul>` : '<p class="muted">None.</p>'}</section>
    ${can("aftersales") ? `<button class="btn" data-act="cus:edit" data-id="${esc(c.id)}">${ICON.pen}Edit customer</button>` : ""}</div>`, { kicker: "Customer" });
}
on.act("cus:open", (t) => openCustomer(t.dataset.id));
on.act("cus:order", (t) => import("./orders.js").then((m) => m.openOrder(t.dataset.id)));
function customerForm(c) {
  c = c || {};
  drawer(c.id ? "Edit " + c.name : "Add customer", `<form data-form="cus:save" data-id="${esc(c.id || "")}" class="stack">
    <div class="form-grid">${field("name", "Name", c.name, "required autofocus")}${field("phone", "Phone", c.phone, 'inputmode="tel"')}</div>
    ${field("email", "Email", c.email, 'type="email"')}${field("address", "Address", c.address)}
    <div class="form-grid">${field("area", "Area", c.area)}${field("district", "District", c.district)}</div>
    <div class="form-grid">${select("package", "Kit", [["complete", PACKAGE.complete], ["detector_relay", PACKAGE.detector_relay]], c.package || "complete")}${field("install_date", "Installed on", c.install_date, 'type="date"')}</div>
    ${field("device_ids", "Device IDs (commas between them)", (c.device_ids || []).join(", "), 'placeholder="VG-0001A3"')}
    <div class="form-grid">${field("warranty_until", "Warranty until", c.warranty_until, 'type="date"')}${field("plan_until", "Connected plan paid until", c.plan_until, 'type="date"')}</div>
    ${area("notes", "Notes", c.notes, 'rows="2"')}
    <div class="actions"><button class="btn primary" type="submit">Save</button>${c.id && can("aftersales:delete") ? `<button class="btn" type="button" data-act="cus:delete" data-id="${esc(c.id)}">${ICON.trash}Delete</button>` : ""}</div></form>`, { kicker: "Customer" });
}
on.act("cus:new", () => customerForm());
on.act("cus:edit", (t) => customerForm(S.data.customers.find((c) => c.id === t.dataset.id)));
on.form("cus:save", (f, d) => busy(f, async () => {
  try { const id = await saveCustomer(f.dataset.id, d); toast("Customer saved"); setTimeout(() => openCustomer(id), 60); } catch (e) { toast(e.message || String(e)); }
}));
on.act("cus:delete", (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to delete"; return; }
  deleteAftersales("customers", t.dataset.id).then(() => { toast("Deleted"); closeDrawer(); }).catch((e) => toast(e.message || String(e)));
});
