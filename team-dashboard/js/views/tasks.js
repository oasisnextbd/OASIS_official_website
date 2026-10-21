/* Tasks. The company account assigns work to one person at a time (daily, weekly, monthly or a
   milestone, each with a due date), reviews what comes back (approve or send back) and sees a monthly
   summary per person for HR. Everyone else sees "My work": their own tasks only, and presses
   Submit when one is done. The rules (firestore.rules → tasks) allow no more than that. */

import { esc, fmtN, ago, when, day, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, toCsv, download, ICON } from "../ui.js";
import { S, can, ROLES, saveTask, submitTask, reviewTask, deleteTask, taskFile, TASK_FILES_MAX, TASK_FILE_BYTES } from "../store.js";
import { TASK_KINDS, TASK_STATUS, taskState, myWork, onTime, taskStats, presenceOf, dhakaToday as today } from "../calc.js";
import { R } from "../redraw.js";

const PILL = { open: ["due", "To do"], overdue: ["void", "Overdue"], returned: ["refunded", "Sent back"], submitted: ["active", "Submitted"], approved: ["paid", "Approved"] };
const statePill = (t) => { const [k, l] = PILL[taskState(t, today())]; return pill(k, l); };
const KIND_HINT = { daily: "for today", weekly: "for this week", monthly: "for this month", milestone: "a bigger goal" };

let F = { person: "", status: "" };
let month = today().slice(0, 7);

export default {
  guest: true, id: "tasks", icon: "tasks", deps: ["tasks", "team", "presence"],
  get label() { return S.me && S.me.owner ? "Tasks" : "My work"; },
  badge() {
    if (!S.me) return 0;
    if (S.me.owner) return S.data.tasks.filter((t) => t.status === "submitted").length;
    return S.data.tasks.filter((t) => t.assignee === S.me.email && (t.status === "open" || t.status === "returned")).length;
  },
  render() { return can("tasks:manage") ? ownerView() : `<div class="topline"><div><h1>My work</h1>
      <div class="sub">Tasks from the company account. When one is done, press <b>Submit as done</b>; the company account reviews it.</div></div></div>${myWorkPanel(true)}`; },
};

/* ---------- my work (everyone except the company account; also shown on Overview) ---------- */
export function myWorkPanel(full) {
  const mine = S.data.tasks.filter((t) => t.assignee === S.me.email);
  if (!mine.length) return full ? `<section class="panel"><p class="muted">No tasks yet. Tasks the company account gives you appear here.</p></section>` : "";
  const groups = myWork(mine, today());
  const titles = { daily: "Today", weekly: "This week", monthly: "This month", milestone: "Milestones" };
  return `<section class="panel mywork"><div class="panel-head"><h2>My work</h2>${full ? "" : `<button class="linkish" data-act="nav" data-view="tasks">All my tasks</button>`}</div>
    <div class="mywork-cols">${Object.keys(titles).map((k) => `<div class="mywork-col"><h3>${titles[k]}</h3>
      ${groups[k].length ? `<ul class="tasklist">${groups[k].map(taskCard).join("")}</ul>` : `<p class="muted small">Nothing ${KIND_HINT[k]}.</p>`}</div>`).join("")}</div></section>`;
}
function taskCard(t) {
  const st = taskState(t, today()), canSubmit = t.assignee === S.me.email && (t.status === "open" || t.status === "returned");
  return `<li class="task task--${st}"><div class="task-top"><strong>${esc(t.title)}</strong>${statePill(t)}</div>
    ${t.details ? `<p class="task-details">${esc(t.details)}</p>` : ""}
    <p class="type">Due ${esc(day(t.due))}${t.submitted_at ? ` · submitted ${esc(ago(t.submitted_at))}` : ""}</p>
    ${attachments(t)}
    ${t.status === "returned" && t.review_note ? `<p class="task-note"><b>Sent back:</b> ${esc(t.review_note)}</p>` : ""}
    ${canSubmit ? `<button class="btn primary sm" data-act="task:submit" data-id="${esc(t.id)}">${ICON.up}Submit as done</button>` : ""}</li>`;
}
on.act("task:submit", (t) => {
  const task = S.data.tasks.find((x) => x.id === t.dataset.id);
  if (!task) return;
  drawer("Submit as done", `<form data-form="task:submit" data-id="${esc(task.id)}" class="stack">
    <p><strong>${esc(task.title)}</strong><br><span class="type">${esc(TASK_KINDS[task.kind])} · due ${esc(day(task.due))}</span></p>
    ${area("note", "What did you do?", task.submit_note || "", 'rows="4" maxlength="1000" autofocus placeholder="Results, numbers, anything the company account should know"')}
    <label class="fl" for="f_files">Attach files (proof of work)<input id="f_files" name="files" type="file" multiple accept="${ACCEPT}"></label>
    <p class="type">PDF, Word, Excel, CSV, text or photos. Up to ${TASK_FILES_MAX} files per task, ${Math.round(TASK_FILE_BYTES / 1024)} KB each; photos are made smaller automatically.${(task.files || []).length ? ` Already attached: ${(task.files || []).length}.` : ""}</p>
    ${field("link", "Or a link to a bigger file (Google Drive, a folder…)", task.link || "", 'type="url" maxlength="500" placeholder="https://drive.google.com/…"')}
    <div class="actions"><button class="btn primary" type="submit">Submit</button></div></form>`);
});
on.form("task:submit", (f, d) => busy(f, async () => {
  try {
    const files = await Promise.all([...(f.querySelector("#f_files").files || [])].map(prepareFile));
    await submitTask(f.dataset.id, d.note, d.link, files);
    toast("Submitted. The company account will review it."); closeDrawer();
  } catch (e) { toast(e.message || String(e)); }
}, "Submitting…"));

/* ---------- attached files ---------- */
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*";
const kb = (n) => (n >= 1024 * 1024 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const dataBytes = (url) => Math.floor((url.length - url.indexOf(",") - 1) * 3 / 4);
function attachments(t) {
  const files = t.files || [];
  if (!files.length && !t.link) return "";
  return `<div class="task-files">${files.map((f) => `<button type="button" class="file-chip" data-act="task:file" data-id="${esc(f.id)}" title="Open ${esc(f.name)}">${ICON.file}<span>${esc(f.name)}</span><span class="type">${esc(kb(f.size || 0))}</span></button>`).join("")}
    ${t.link ? `<a class="file-chip" href="${esc(t.link)}" target="_blank" rel="noopener">${ICON.link}<span>Link</span><span class="type">${esc(t.link.replace(/^https?:\/\//, "").slice(0, 40))}</span></a>` : ""}</div>`;
}
/** Reads a chosen file as a data: URL; a photo over the limit is redrawn smaller as JPEG. */
async function prepareFile(file) {
  const read = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("Could not read " + file.name)); r.readAsDataURL(blob); });
  let data = await read(file);
  if (dataBytes(data) > TASK_FILE_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Could not open the photo " + file.name)); i.src = data; });
    for (const [side, q] of [[1600, 0.82], [1200, 0.72], [900, 0.65]]) {
      const k = Math.min(1, side / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      data = c.toDataURL("image/jpeg", q);
      if (dataBytes(data) <= TASK_FILE_BYTES) break;
    }
    return { name: file.name.replace(/\.(png|webp)$/i, ".jpg"), type: "image/jpeg", size: dataBytes(data), data };
  }
  return { name: file.name, type: file.type, size: dataBytes(data), data };
}
on.act("task:file", async (el) => {
  try {
    const f = await taskFile(el.dataset.id);
    const blob = await (await fetch(f.data)).blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    if (/^(application\/pdf|image\/|text\/plain)/.test(f.type)) a.target = "_blank"; else a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message || String(e)); }
});

/* ---------- the company account ---------- */
const people = () => S.data.team.filter((m) => m.active === true && m.id !== String(S.cfg.owner).toLowerCase() && !(m.until_ms && Date.now() > m.until_ms));
const nameOf = (email) => { const m = S.data.team.find((x) => x.id === email); return (m && m.name) || email; };

function ownerView() {
  const all = S.data.tasks, t0 = today();
  const review = all.filter((t) => t.status === "submitted").sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  const overdue = all.filter((t) => taskState(t, t0) === "overdue");
  const list = all.filter((t) => (!F.person || t.assignee === F.person) && (!F.status || taskState(t, t0) === F.status))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return `<div class="topline"><div><h1>Tasks</h1><div class="sub">Give each person their work for the day, week or month, or a milestone. They submit it when done; you approve it or send it back.</div></div>
      <div class="actions"><button class="btn primary" data-act="task:new">${ICON.plus}Assign a task</button></div></div>
    <div class="kpis">${kpi("Waiting for your review", fmtN(review.length), review.length ? "approve or send back below" : "nothing to review", true)}
      ${kpi("Overdue", fmtN(overdue.length), "past the due date, not submitted")}
      ${kpi("Open", fmtN(all.filter((t) => t.status === "open" || t.status === "returned").length), "to do or sent back")}
      ${kpi("Approved this month", fmtN(all.filter((t) => t.status === "approved" && String(t.reviewed_at).slice(0, 7) === t0.slice(0, 7)).length), "")}</div>
    ${review.length ? `<section class="panel"><h2>Waiting for your review</h2><ul class="tasklist review">${review.map((t) => `<li class="task">
      <div class="task-top"><strong>${esc(t.title)}</strong><span class="type">${esc(nameOf(t.assignee))} · ${esc(TASK_KINDS[t.kind])} · due ${esc(day(t.due))}</span></div>
      <p class="type">Submitted ${esc(when(t.submitted_at))} · ${onTime(t) ? "on time" : "<b>late</b>"}</p>
      ${t.submit_note ? `<p class="task-details">${esc(t.submit_note)}</p>` : ""}
      ${attachments(t)}
      <div class="actions"><button class="btn primary sm" data-act="task:approve" data-id="${esc(t.id)}">Approve</button><button class="btn sm" data-act="task:back" data-id="${esc(t.id)}">Send back</button></div></li>`).join("")}</ul></section>` : ""}
    <section class="panel"><h2>People</h2>${peopleTable()}</section>
    <section class="panel"><div class="panel-head"><h2>All tasks</h2><div class="filters">
      <select class="f" data-change="task:filter" data-k="person" aria-label="Person"><option value="">Everyone</option>${people().map((m) => `<option value="${esc(m.id)}"${F.person === m.id ? " selected" : ""}>${esc(m.name || m.id)}</option>`).join("")}</select>
      <select class="f" data-change="task:filter" data-k="status" aria-label="Status"><option value="">Any status</option>${Object.entries(PILL).map(([k, [, l]]) => `<option value="${k}"${F.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="table-wrap flat"><table><thead><tr><th>Task</th><th>Person</th><th>Kind</th><th>Due</th><th>Status</th></tr></thead><tbody>
      ${list.length ? list.map((t) => `<tr data-act="task:edit" data-id="${esc(t.id)}" tabindex="0"><td><strong>${esc(t.title)}</strong>${t.details ? `<br><span class="type">${esc(t.details.slice(0, 90))}</span>` : ""}</td>
        <td>${esc(nameOf(t.assignee))}</td><td>${esc(TASK_KINDS[t.kind])}</td><td class="num">${esc(day(t.due))}</td><td>${statePill(t)}${t.returned_count ? `<br><span class="type">sent back ${fmtN(t.returned_count)}×</span>` : ""}</td></tr>`).join("")
        : emptyRow(5, all.length ? "No task matches these filters." : "No tasks yet. Press Assign a task.")}</tbody></table></div></section>
    ${hrPanel()}`;
}

function peopleTable() {
  const list = people(), t0 = today(), pres = Object.fromEntries(S.data.presence.map((p) => [p.id, p]));
  if (!list.length) return '<p class="muted">Add people in Settings & team first.</p>';
  return `<div class="table-wrap flat"><table><thead><tr><th>Person</th><th>Role</th><th>Dashboard</th><th class="num">To do</th><th class="num">Overdue</th><th class="num">To review</th></tr></thead><tbody>
    ${list.map((m) => { const mine = S.data.tasks.filter((t) => t.assignee === m.id), p = presenceOf(pres[m.id]);
      return `<tr data-act="person:open" data-id="${esc(m.id)}" tabindex="0" title="Open ${esc(m.name || m.id)}'s profile"><td><strong>${esc(m.name || m.id)}</strong><br><span class="type">${esc(m.id)}</span></td><td>${esc(ROLES[m.role] || m.role)}${m.until ? `<br><span class="type">until ${esc(m.until)}</span>` : ""}</td>
        <td>${p.online ? '<span class="online-dot">Online now</span>' : `<span class="type">${p.seen ? "Last seen " + esc(ago(new Date(p.seen).toISOString())) : "Not seen yet"}</span>`}</td>
        <td class="num">${fmtN(mine.filter((t) => ["open", "returned"].includes(taskState(t, t0))).length)}</td><td class="num">${fmtN(mine.filter((t) => taskState(t, t0) === "overdue").length)}</td>
        <td class="num">${fmtN(mine.filter((t) => t.status === "submitted").length)}</td></tr>`; }).join("")}</tbody></table></div>
    <p class="sub">“Online now” means their dashboard is open (it checks in about once a minute). Everyone is told on screen that you can see this.</p>`;
}

function hrPanel() {
  const rows = taskStats(S.data.tasks, month, today());
  return `<section class="panel"><div class="panel-head"><h2>Monthly summary (for HR)</h2><div class="filters">
      <input class="f" type="month" value="${esc(month)}" data-change="task:month" aria-label="Month">
      <button class="btn" data-act="task:csv">${ICON.down}Export CSV</button></div></div>
    <div class="table-wrap flat"><table><thead><tr><th>Person</th><th class="num">Assigned</th><th class="num">On time</th><th class="num">Late</th><th class="num">Approved</th><th class="num">Sent back</th><th class="num">Overdue</th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr class="no-hover"><td>${esc(nameOf(r.assignee))}</td><td class="num">${fmtN(r.assigned)}</td><td class="num">${fmtN(r.onTime)}</td><td class="num">${fmtN(r.late)}</td><td class="num">${fmtN(r.approved)}</td><td class="num">${fmtN(r.sentBack)}</td><td class="num">${fmtN(r.overdue)}</td></tr>`).join("")
      : emptyRow(7, "No tasks due in this month.")}</tbody></table></div>
    <p class="sub">By due date. On time = submitted by the end of the due day (Dhaka time). Sent back = needed changes at least once.</p></section>`;
}

on.input("task:filter", (el) => { F[el.dataset.k] = el.value; R.draw(); });
on.input("task:month", (el) => { if (/^\d{4}-\d{2}$/.test(el.value)) { month = el.value; R.draw(); } });
on.act("task:csv", () => {
  const rows = S.data.tasks.filter((t) => String(t.due).slice(0, 7) === month).map((t) => ({
    person: nameOf(t.assignee), email: t.assignee, task: t.title, kind: TASK_KINDS[t.kind], due: t.due, status: TASK_STATUS[t.status] || t.status,
    overdue: taskState(t, today()) === "overdue" ? "yes" : "", submitted_at: t.submitted_at || "", on_time: t.submitted_at ? (onTime(t) ? "yes" : "no") : "",
    sent_back_times: t.returned_count || 0, reviewed_at: t.reviewed_at || "", submit_note: t.submit_note || "", review_note: t.review_note || "" }));
  download(`venguard-tasks-${month}.csv`, toCsv(rows, ["person", "email", "task", "kind", "due", "status", "overdue", "submitted_at", "on_time", "sent_back_times", "reviewed_at", "submit_note", "review_note"]));
});

function taskForm(t) {
  const isNew = !t; t = t || { kind: "daily", due: today() };
  const who = people().map((m) => [m.id, `${m.name || m.id} — ${ROLES[m.role] || m.role}`]);
  drawer(isNew ? "Assign a task" : "Change task", `<form data-form="task:save" data-id="${isNew ? "" : esc(t.id)}" class="stack">
    ${field("title", "Task", t.title, 'required maxlength="200" autofocus placeholder="e.g. Call every new website lead"')}
    ${area("details", "Details (optional)", t.details, 'rows="3" maxlength="2000"')}
    <div class="form-grid">${select("assignee", "For", [["", "Choose a person"], ...who], t.assignee || "", "required")}
      ${select("kind", "Kind", Object.entries(TASK_KINDS).map(([k, l]) => [k, `${l} (${KIND_HINT[k]})`]), t.kind)}
      ${field("due", "Due date", t.due, 'type="date" required')}</div>
    ${!isNew && t.status !== "open" ? `<p class="type">Status: ${esc(TASK_STATUS[t.status])}${t.submit_note ? ` · their note: ${esc(t.submit_note)}` : ""}</p>` : ""}
    <div class="actions"><button class="btn primary" type="submit">${isNew ? "Assign" : "Save"}</button>
      ${isNew ? "" : `<button class="btn" type="button" data-act="task:delete" data-id="${esc(t.id)}">${ICON.trash}Delete</button>`}</div></form>`);
}
on.act("task:new", () => taskForm());
on.act("task:edit", (el) => { if (can("tasks:manage")) taskForm(S.data.tasks.find((t) => t.id === el.dataset.id)); });
on.form("task:save", (f, d) => busy(f, async () => {
  try { await saveTask(f.dataset.id || "", d); toast(f.dataset.id ? "Task saved" : "Task assigned to " + nameOf(d.assignee)); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
on.act("task:delete", (el) => {
  if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.textContent = "Tap again to delete"; return; }
  deleteTask(el.dataset.id).then(() => { toast("Task deleted"); closeDrawer(); }).catch((e) => toast(e.message || String(e)));
});
on.act("task:approve", (el) => reviewTask(el.dataset.id, true, "").then(() => toast("Approved")).catch((e) => toast(e.message || String(e))));
on.act("task:back", (el) => {
  const t = S.data.tasks.find((x) => x.id === el.dataset.id);
  if (!t) return;
  drawer("Send back", `<form data-form="task:back" data-id="${esc(t.id)}" class="stack"><p><strong>${esc(t.title)}</strong><br><span class="type">${esc(nameOf(t.assignee))}</span></p>
    ${area("note", "What needs to change?", "", 'rows="4" required maxlength="1000" autofocus')}
    <div class="actions"><button class="btn primary" type="submit">Send back</button></div></form>`);
});
on.form("task:back", (f, d) => busy(f, async () => {
  try { await reviewTask(f.dataset.id, false, d.note); toast("Sent back with your note"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
