/* Support: customer requests after the sale (safety worries, warranty claims, service visits, complaints,
   questions). Each ticket has a history of notes and status changes, can be linked to a customer and
   given to a team member. A "Safety" ticket is always urgent and shows what to tell the caller first. */

import { esc, fmtN, when, ago, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, saveTicket, addTicketNote, deleteAftersales } from "../store.js";
import { TICKET_KINDS, TICKET_STATUS } from "../calc.js";
import { R } from "../redraw.js";

const PILLS = { open: ["new", "Open"], in_progress: ["contacted", "In progress"], waiting: ["due", "Waiting for the customer"], resolved: ["paid", "Resolved"] };
const stPill = (t) => pill(...PILLS[t.status] || ["new", t.status]);
const nameOf = (email) => { const m = S.data.team.find((x) => x.id === email); return (m && m.name) || email || "—"; };
let F = { status: "active", kind: "", who: "" };

export default {
  id: "tickets", label: "Support", icon: "support", deps: ["tickets", "customers", "team"],
  badge() { return S.data.tickets.filter((t) => t.status !== "resolved" && t.priority === "urgent").length; },
  render() {
    const all = S.data.tickets, month = new Date().toISOString().slice(0, 7);
    const list = all.filter((t) => (F.status === "all" || (F.status === "active" ? t.status !== "resolved" : t.status === F.status))
      && (!F.kind || t.kind === F.kind) && (!F.who || t.assigned_to === F.who))
      .sort((a, b) => (b.priority === "urgent") - (a.priority === "urgent") || String(b.updated_at).localeCompare(String(a.updated_at)));
    const staff = S.data.team.filter((m) => m.active === true && m.role !== "guest");
    return `<div class="topline"><div><h1>Support</h1><div class="sub">Customer requests after the sale. Urgent ones come first. Write every call or visit as a note, so anyone can pick it up.</div></div>
        <div class="actions">${can("aftersales") ? `<button class="btn primary" data-act="tic:new">${ICON.plus}New ticket</button>` : ""}</div></div>
      <div class="kpis">${kpi("Open", fmtN(all.filter((t) => t.status !== "resolved").length), "not resolved yet", true)}
        ${kpi("Urgent", fmtN(all.filter((t) => t.status !== "resolved" && t.priority === "urgent").length), "safety and urgent tickets")}
        ${kpi("Waiting for the customer", fmtN(all.filter((t) => t.status === "waiting").length), "")}
        ${kpi("Resolved this month", fmtN(all.filter((t) => t.status === "resolved" && String(t.resolved_at || "").slice(0, 7) === month).length), "")}</div>
      <section class="panel"><div class="panel-head"><h2>Tickets</h2><div class="filters">
        <select class="f" data-change="tic:filter" data-k="status" aria-label="Status"><option value="active"${F.status === "active" ? " selected" : ""}>Not resolved</option><option value="all"${F.status === "all" ? " selected" : ""}>All</option>
          ${Object.entries(TICKET_STATUS).map(([k, l]) => `<option value="${k}"${F.status === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select class="f" data-change="tic:filter" data-k="kind" aria-label="Kind"><option value="">Every kind</option>${Object.entries(TICKET_KINDS).map(([k, l]) => `<option value="${k}"${F.kind === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select class="f" data-change="tic:filter" data-k="who" aria-label="Assigned to"><option value="">Anyone</option>${staff.map((m) => `<option value="${esc(m.id)}"${F.who === m.id ? " selected" : ""}>${esc(m.name || m.id)}</option>`).join("")}</select></div></div>
      <div class="table-wrap flat"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Assigned to</th><th>Updated</th></tr></thead><tbody>
      ${list.length ? list.map((t) => `<tr data-act="tic:open" data-id="${esc(t.id)}" tabindex="0"${t.priority === "urgent" && t.status !== "resolved" ? ' class="urgent"' : ""}>
        <td><strong>${t.priority === "urgent" ? "⚠ " : ""}${esc(t.subject)}</strong><br><span class="type">${esc(TICKET_KINDS[t.kind])}</span></td>
        <td>${esc(t.name)}<br><span class="type">${esc(t.phone || "")}</span></td><td>${stPill(t)}</td><td>${esc(nameOf(t.assigned_to))}</td><td class="num">${esc(ago(t.updated_at))}</td></tr>`).join("")
        : emptyRow(5, all.length ? "No ticket matches." : "No support tickets yet.")}</tbody></table></div></section>`;
  },
};
on.input("tic:filter", (el) => { F[el.dataset.k] = el.value; R.draw(); });

const SAFETY = `<div class="banner error">${ICON.info}<div><strong>If they smell gas right now, tell them:</strong> don't switch anything on or off and don't light anything;
  close the cylinder valve if it is safe to reach; open doors and windows; get everyone out; call <b>999</b>. Then arrange a visit.</div></div>`;

export function openTicket(id) {
  const t = S.data.tickets.find((x) => x.id === id);
  if (!t) return;
  const edit = can("aftersales"), wa = t.phone ? "https://wa.me/88" + String(t.phone).replace(/\D/g, "").replace(/^88/, "") : "";
  drawer(t.subject, `<div class="stack">
    ${t.kind === "safety" && t.status !== "resolved" ? SAFETY : ""}
    <div class="panel tight"><div class="actions">${stPill(t)}${t.priority === "urgent" ? pill("void", "Urgent") : ""}
      ${t.phone ? `<a class="btn primary sm" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.whatsapp}WhatsApp</a><a class="btn sm" href="tel:${esc(t.phone)}">Call</a>` : ""}
      ${t.customer_id ? `<button class="btn sm" data-act="cus:open" data-id="${esc(t.customer_id)}">${ICON.customers}Customer</button>` : ""}</div></div>
    <dl class="dl"><dt>Kind</dt><dd>${esc(TICKET_KINDS[t.kind])}</dd><dt>Customer</dt><dd>${esc(t.name)}${t.phone ? " · " + esc(t.phone) : ""}</dd>
      <dt>Assigned to</dt><dd>${esc(nameOf(t.assigned_to))}</dd><dt>Opened</dt><dd>${esc(when(t.created_at))} by ${esc(nameOf(t.created_by))}</dd>${t.details ? `<dt>Details</dt><dd>${esc(t.details)}</dd>` : ""}</dl>
    <section><h2>History</h2>${(t.notes || []).length ? `<ul class="plain history">${t.notes.slice().reverse().map((n) => `<li><span class="num muted">${esc(when(n.at))}</span> <strong>${esc(nameOf(n.by))}</strong>
      ${n.status ? `→ ${esc(TICKET_STATUS[n.status] || n.status)}` : ""}${n.note ? `<br>${esc(n.note)}` : ""}</li>`).join("")}</ul>` : '<p class="muted">No notes yet.</p>'}</section>
    ${edit ? `<form data-form="tic:note" data-id="${esc(t.id)}" class="panel tight stack"><h2>Add to the history</h2>
      ${area("note", "What happened (call, visit, answer…)", "", 'rows="3" maxlength="1000"')}
      ${select("status", "Change status", [["", "Keep: " + TICKET_STATUS[t.status]], ...Object.entries(TICKET_STATUS).filter(([k]) => k !== t.status)], "")}
      <div><button class="btn primary" type="submit">Add</button></div></form>
      <div class="actions"><button class="btn" data-act="tic:edit" data-id="${esc(t.id)}">${ICON.pen}Edit ticket</button>${can("aftersales:delete") ? `<button class="btn" data-act="tic:delete" data-id="${esc(t.id)}">${ICON.trash}Delete</button>` : ""}</div>` : ""}</div>`,
    { kicker: "Support ticket" });
}
on.act("tic:open", (t) => openTicket(t.dataset.id));
function ticketForm(t, customerId) {
  t = t || { kind: "service", priority: "normal", customer_id: customerId || "" };
  const staff = S.data.team.filter((m) => m.active === true && m.role !== "guest").map((m) => [m.id, m.name || m.id]);
  const custs = S.data.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, `${c.name}${c.phone ? " · " + c.phone : ""}`]);
  drawer(t.id ? "Edit ticket" : "New ticket", `<form data-form="tic:save" data-id="${esc(t.id || "")}" class="stack">
    ${select("customer_id", "Customer", [["", "Not in Customers (type below)"], ...custs], t.customer_id || "")}
    <div class="form-grid">${field("name", "Name (if not in Customers)", t.customer_id ? "" : t.name)}${field("phone", "Phone", t.customer_id ? "" : t.phone, 'inputmode="tel"')}</div>
    <div class="form-grid">${select("kind", "Kind", Object.entries(TICKET_KINDS), t.kind)}${select("priority", "Priority", [["normal", "Normal"], ["urgent", "Urgent"]], t.priority)}</div>
    ${field("subject", "Subject", t.subject, 'required maxlength="200" placeholder="e.g. Alarm beeps every night"')}
    ${area("details", "Details", t.details, 'rows="3"')}
    ${select("assigned_to", "Assigned to", [["", "Nobody yet"], ...staff], t.assigned_to || "")}
    <p class="type">A Safety ticket is always urgent.</p>
    <div><button class="btn primary" type="submit">${t.id ? "Save" : "Open ticket"}</button></div></form>`, { kicker: "Support ticket" });
}
on.act("tic:new", (t) => ticketForm(null, t.dataset.customer));
on.act("tic:edit", (t) => ticketForm(S.data.tickets.find((x) => x.id === t.dataset.id)));
on.form("tic:save", (f, d) => busy(f, async () => {
  try { const id = await saveTicket(f.dataset.id, d); toast("Ticket saved"); setTimeout(() => openTicket(id), 60); } catch (e) { toast(e.message || String(e)); }
}));
on.form("tic:note", (f, d) => busy(f, async () => {
  try { await addTicketNote(f.dataset.id, d.note, d.status); toast("Added"); setTimeout(() => openTicket(f.dataset.id), 60); } catch (e) { toast(e.message || String(e)); }
}));
on.act("tic:delete", (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to delete"; return; }
  deleteAftersales("tickets", t.dataset.id).then(() => { toast("Deleted"); closeDrawer(); }).catch((e) => toast(e.message || String(e)));
});
