/* Installations: VenGuard's dispatch. Each paid order becomes an installation visit: choose a date, a time
   and a technician; at the visit tick the checklist and note the device IDs; "Tested & handed over" then
   creates (or updates) the customer record and marks the order Installed. Technicians are kept here too. */

import { esc, fmtN, day, ago, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, PACKAGE, saveInstallation, setInstallChecklist, setInstallStatus, saveTechnician, deleteAftersales } from "../store.js";
import { INSTALL_STATUS, INSTALL_CHECKS, checklistDone, dhakaToday } from "../calc.js";
import { R } from "../redraw.js";

const PILLS = { to_schedule: ["due", "To schedule"], scheduled: ["new", "Scheduled"], installed: ["contacted", "Installed"], tested: ["installed", "Tested & handed over"], cancelled: ["off", "Cancelled"] };
const st = (i) => pill(...PILLS[i.status] || ["due", i.status]);
const SLOTS = ["9 am – 12 pm", "12 pm – 3 pm", "3 pm – 6 pm", "After 6 pm"];
let F = { tech: "", status: "open" };

export default {
  id: "installations", label: "Installations", icon: "install", deps: ["installations", "technicians", "orders"],
  badge() { return S.data.installations.filter((i) => i.status === "to_schedule").length; },
  render() {
    const t0 = dhakaToday(), all = S.data.installations, edit = can("aftersales");
    const week = new Date(Date.parse(t0) + 7 * 864e5).toISOString().slice(0, 10), month = t0.slice(0, 7);
    const waiting = S.data.orders.filter((o) => o.status === "paid" && !all.some((i) => i.order_id === o.id && i.status !== "cancelled"));
    const list = all.filter((i) => (!F.tech || i.technician_id === F.tech)
      && (F.status === "all" || (F.status === "open" ? ["to_schedule", "scheduled", "installed"].includes(i.status) : i.status === F.status)))
      .sort((a, b) => (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999"));
    return `<div class="topline"><div><h1>Installations</h1><div class="sub">Plan each visit, send a technician, tick the checklist, hand over. Finished visits become customers.</div></div>
        <div class="actions">${edit ? `<button class="btn primary" data-act="ins:new">${ICON.plus}New installation</button>` : ""}<button class="btn" data-act="ins:techs">${ICON.customers}Technicians (${fmtN(S.data.technicians.filter((t) => t.active !== false).length)})</button></div></div>
      <div class="kpis">${kpi("To schedule", fmtN(all.filter((i) => i.status === "to_schedule").length), "no date yet", true)}
        ${kpi("Next 7 days", fmtN(all.filter((i) => i.status === "scheduled" && i.scheduled_date >= t0 && i.scheduled_date <= week).length), "scheduled visits")}
        ${kpi("Late", fmtN(all.filter((i) => i.status === "scheduled" && i.scheduled_date && i.scheduled_date < t0).length), "date passed, not marked installed")}
        ${kpi("Handed over this month", fmtN(all.filter((i) => i.status === "tested" && String(i.done_at || "").slice(0, 7) === month).length), "")}</div>
      ${waiting.length && edit ? `<div class="banner">${ICON.info}<div><strong>${fmtN(waiting.length)} paid order${waiting.length > 1 ? "s" : ""} without an installation:</strong>
        ${waiting.slice(0, 6).map((o) => `<button class="linkish" data-act="ins:fromorder" data-id="${esc(o.id)}">${esc(o.name)}</button>`).join(", ")}${waiting.length > 6 ? "…" : ""}</div></div>` : ""}
      <section class="panel"><div class="panel-head"><h2>Visits</h2><div class="filters">
        <select class="f" data-change="ins:filter" data-k="status" aria-label="Status"><option value="open"${F.status === "open" ? " selected" : ""}>Not finished</option><option value="all"${F.status === "all" ? " selected" : ""}>All</option>
          ${Object.entries(INSTALL_STATUS).map(([k, l]) => `<option value="${k}"${F.status === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select class="f" data-change="ins:filter" data-k="tech" aria-label="Technician"><option value="">Every technician</option>${S.data.technicians.map((t) => `<option value="${esc(t.id)}"${F.tech === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div></div>
      <div class="table-wrap flat"><table><thead><tr><th>Date</th><th>Customer</th><th>Area</th><th>Kit</th><th>Technician</th><th>Status</th></tr></thead><tbody>
      ${list.length ? list.map((i) => `<tr data-act="ins:open" data-id="${esc(i.id)}" tabindex="0"><td class="num">${i.scheduled_date ? `<strong>${esc(day(i.scheduled_date))}</strong>${i.slot ? `<br><span class="type">${esc(i.slot)}</span>` : ""}` : '<span class="muted">—</span>'}${i.status === "scheduled" && i.scheduled_date && i.scheduled_date < t0 ? '<br><span class="type"><b>late</b></span>' : ""}</td>
        <td><strong>${esc(i.name)}</strong><br><span class="type">${esc(i.phone || "")}</span></td><td>${esc([i.area, i.district].filter(Boolean).join(", "))}</td>
        <td>${esc(PACKAGE[i.package] || i.package || "")}${i.units > 1 ? ` × ${fmtN(i.units)}` : ""}</td><td>${esc(i.technician_name || "—")}</td><td>${st(i)}</td></tr>`).join("")
        : emptyRow(6, all.length ? "Nothing matches these filters." : "No installations yet. Start one from a paid order, or press New installation.")}</tbody></table></div></section>`;
  },
};
on.input("ins:filter", (el) => { F[el.dataset.k] = el.value; R.draw(); });

/* ---------- one visit ---------- */
export function openInstallation(id) {
  const i = S.data.installations.find((x) => x.id === id);
  if (!i) return;
  const edit = can("aftersales"), done = i.status === "tested" || i.status === "cancelled", c = i.checklist || {};
  const wa = i.phone ? "https://wa.me/88" + String(i.phone).replace(/\D/g, "").replace(/^88/, "") : "";
  drawer(i.name, `<div class="stack">
    <div class="panel tight"><div class="actions">${st(i)}${i.phone ? `<a class="btn primary sm" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.whatsapp}WhatsApp</a><a class="btn sm" href="tel:${esc(i.phone)}">Call</a>` : ""}
      ${i.order_id ? `<button class="btn sm" data-act="ins:order" data-id="${esc(i.order_id)}">${ICON.orders}Order</button>` : ""}${i.customer_id ? `<button class="btn sm" data-act="cus:open" data-id="${esc(i.customer_id)}">${ICON.customers}Customer</button>` : ""}</div></div>
    ${edit && !done ? visitForm(i) : `<dl class="dl"><dt>Date</dt><dd>${esc(i.scheduled_date ? day(i.scheduled_date) + " " + (i.slot || "") : "—")}</dd><dt>Technician</dt><dd>${esc(i.technician_name || "—")}</dd>
      <dt>Address</dt><dd>${esc([i.address, i.area, i.district].filter(Boolean).join(", "))}</dd>${i.notes ? `<dt>Notes</dt><dd>${esc(i.notes)}</dd>` : ""}</dl>`}
    <form data-form="ins:check" data-id="${esc(i.id)}" class="panel tight stack"><h2>At the visit</h2>
      ${INSTALL_CHECKS.map(([k, l]) => `<label class="check-row"><input type="checkbox" name="${k}"${c[k] ? " checked" : ""}${edit && !done ? "" : " disabled"}> ${esc(l)}</label>`).join("")}
      ${field("device_ids", "Device IDs (from the stickers, separated by commas)", (i.device_ids || []).join(", "), edit && !done ? 'placeholder="VG-0001A3"' : "readonly")}
      ${edit && !done ? `<div><button class="btn" type="submit">Save checklist</button></div>` : ""}</form>
    ${edit && !done ? `<div class="actions">
      ${i.status !== "installed" ? `<button class="btn" data-act="ins:status" data-s="installed" data-id="${esc(i.id)}">Mark installed</button>` : ""}
      <button class="btn primary" data-act="ins:status" data-s="tested" data-id="${esc(i.id)}"${checklistDone(c) ? "" : ' title="Tick every checklist item first"'}>Tested & handed over</button>
      <button class="btn" data-act="ins:status" data-s="cancelled" data-id="${esc(i.id)}">Cancel visit</button></div>
      <p class="type">“Tested & handed over” needs every checklist item ticked. It adds the customer to Customers (with the warranty end date from Settings) and marks the order Installed.</p>` : ""}
    ${can("aftersales:delete") ? `<button class="btn" data-act="ins:delete" data-id="${esc(i.id)}">${ICON.trash}Delete</button>` : ""}
    <p class="type">Updated ${esc(ago(i.updated_at))} by ${esc(i.updated_by || "")}</p></div>`, { kicker: "Installation" + (i.order_id ? " · " + i.order_id : "") });
}
function visitForm(i) {
  const techs = S.data.technicians.filter((t) => t.active !== false || t.id === i.technician_id).map((t) => [t.id, `${t.name}${t.area ? " — " + t.area : ""}`]);
  return `<form data-form="ins:save" data-id="${esc(i.id || "")}" class="stack">
    <div class="form-grid">${field("name", "Customer", i.name, "required")}${field("phone", "Phone", i.phone, 'inputmode="tel"')}</div>
    ${field("address", "Address", i.address, 'placeholder="House, road, flat"')}
    <div class="form-grid">${field("area", "Area", i.area)}${field("district", "District", i.district)}</div>
    <div class="form-grid">${select("package", "Kit", [["complete", PACKAGE.complete], ["detector_relay", PACKAGE.detector_relay]], i.package || "complete")}${field("units", "Kits", i.units || 1, 'inputmode="numeric"')}</div>
    <div class="form-grid">${field("scheduled_date", "Visit date", i.scheduled_date || "", 'type="date"')}${select("slot", "Time", [["", "Any time"], ...SLOTS.map((s) => [s, s])], i.slot || "")}</div>
    ${select("technician_id", "Technician", [["", techs.length ? "Choose later" : "Add technicians first (button above)"], ...techs], i.technician_id || "")}
    ${area("notes", "Notes for the technician", i.notes, 'rows="2" placeholder="e.g. 5th floor, no lift; two cylinders"')}
    <input type="hidden" name="order_id" value="${esc(i.order_id || "")}">
    <div><button class="btn primary" type="submit">${i.id ? "Save visit" : "Create installation"}</button></div></form>`;
}
on.act("ins:open", (t) => openInstallation(t.dataset.id));
on.act("ins:new", () => drawer("New installation", visitForm({ units: 1 }), { kicker: "Installation" }));
/** From an order: copy its customer details and kit; open the new visit. */
export async function installationFromOrder(orderId) {
  const o = S.data.orders.find((x) => x.id === orderId);
  if (!o) return;
  const old = S.data.installations.find((i) => i.order_id === o.id && i.status !== "cancelled");
  if (old) return openInstallation(old.id);
  try {
    const id = await saveInstallation("", { name: o.name, phone: o.phone, email: o.email, address: o.address, area: o.area, district: o.district,
      package: o.package || "complete", units: o.units, order_id: o.id, notes: o.team_notes || "" });
    toast("Installation started: choose a date and a technician");
    setTimeout(() => openInstallation(id), 80);
  } catch (e) { toast(e.message || String(e)); }
}
on.act("ins:fromorder", (t) => installationFromOrder(t.dataset.id));
on.act("ins:order", (t) => import("./orders.js").then((m) => m.openOrder(t.dataset.id)));
on.form("ins:save", (f, d) => busy(f, async () => {
  try { const id = await saveInstallation(f.dataset.id, d); toast("Saved"); setTimeout(() => openInstallation(id), 60); } catch (e) { toast(e.message || String(e)); }
}));
on.form("ins:check", (f, d) => busy(f, async () => {
  const checklist = Object.fromEntries(INSTALL_CHECKS.map(([k]) => [k, !!f.elements[k].checked]));
  try { await setInstallChecklist(f.dataset.id, checklist, d.device_ids); toast("Checklist saved"); setTimeout(() => openInstallation(f.dataset.id), 60); } catch (e) { toast(e.message || String(e)); }
}));
on.act("ins:status", async (t) => {
  if (t.dataset.s === "cancelled" && t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to cancel the visit"; return; }
  try { await setInstallStatus(t.dataset.id, t.dataset.s); toast(INSTALL_STATUS[t.dataset.s]); setTimeout(() => openInstallation(t.dataset.id), 80); } catch (e) { toast(e.message || String(e)); }
});
on.act("ins:delete", (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to delete"; return; }
  deleteAftersales("installations", t.dataset.id).then(() => { toast("Deleted"); closeDrawer(); }).catch((e) => toast(e.message || String(e)));
});

/* ---------- technicians ---------- */
function techList() {
  const edit = can("aftersales"), list = S.data.technicians.slice().sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
  drawer("Technicians", `<div class="stack">${edit ? `<button class="btn primary" data-act="ins:tech" data-id="">${ICON.plus}Add technician</button>` : ""}
    ${list.length ? `<ul class="plain followup">${list.map((t) => { const n = S.data.installations.filter((i) => i.technician_id === t.id && i.status === "tested").length;
      return `<li${edit ? ` data-act="ins:tech" data-id="${esc(t.id)}" tabindex="0"` : ""}><span><strong>${esc(t.name)}</strong>${t.active === false ? " (not active)" : ""}<br><span class="type">${esc([t.phone, t.area, t.district, t.dealer_code && "dealer " + t.dealer_code].filter(Boolean).join(" · "))}</span></span><span class="type">${fmtN(n)} done</span></li>`; }).join("")}</ul>`
      : '<p class="muted">No technicians yet. Add your own installers and dealers\' trained technicians.</p>'}</div>`);
}
on.act("ins:techs", () => techList());
on.act("ins:tech", (el) => {
  const t = S.data.technicians.find((x) => x.id === el.dataset.id) || { active: true };
  drawer(t.id ? t.name : "Add technician", `<form data-form="ins:techsave" data-id="${esc(t.id || "")}" class="stack">
    <div class="form-grid">${field("name", "Name", t.name, "required autofocus")}${field("phone", "Phone", t.phone, 'inputmode="tel"')}</div>
    <div class="form-grid">${field("area", "Area they cover", t.area)}${field("district", "District", t.district)}</div>
    ${field("dealer_code", "Dealer code (if they work for a dealer)", t.dealer_code)}
    ${select("active", "Status", [["true", "Active"], ["false", "Not active"]], String(t.active !== false))}
    ${area("notes", "Notes (training date, tools…)", t.notes, 'rows="2"')}
    <div class="actions"><button class="btn primary" type="submit">Save</button>${t.id && can("aftersales:delete") ? `<button class="btn" type="button" data-act="ins:techdel" data-id="${esc(t.id)}">${ICON.trash}Delete</button>` : ""}</div></form>`);
});
on.form("ins:techsave", (f, d) => busy(f, async () => {
  try { await saveTechnician(f.dataset.id, d); toast("Technician saved"); techList(); } catch (e) { toast(e.message || String(e)); }
}));
on.act("ins:techdel", (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to delete"; return; }
  deleteAftersales("technicians", t.dataset.id).then(() => { toast("Deleted"); techList(); }).catch((e) => toast(e.message || String(e)));
});
