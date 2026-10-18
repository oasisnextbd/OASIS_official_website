/* Small helpers shared by every view: escaping, formatting, the side drawer, toasts, icons,
   and the click / submit / input delegation that views plug into with on(). */

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
export const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtN = (n) => Number(n || 0).toLocaleString("en-US");
export const money = (n) => "BDT " + Number(Math.round(n || 0)).toLocaleString("en-US");
export const cap = (s) => { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
export const int = (v) => { const n = parseInt(String(v == null ? "" : v).replace(/[^\d-]/g, ""), 10); return isNaN(n) ? 0 : n; };
export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString();

export function when(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
export function day(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function ago(iso) {
  const h = (Date.now() - new Date(iso)) / 36e5;
  return h < 1 ? Math.max(1, Math.round(h * 60)) + " min ago" : h < 48 ? Math.round(h) + " h ago" : Math.round(h / 24) + " days ago";
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ---------- drawer ---------- */
export function drawer(title, body, opts = {}) {
  $("#drawerRoot").innerHTML = `<div class="drawer-bg" data-act="close"></div>
    <aside class="drawer${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
      <header><div>${opts.kicker ? `<div class="mono muted">${esc(opts.kicker)}</div>` : ""}<h1 id="drawerTitle" style="font-size:1.35rem">${esc(title)}</h1>${opts.after || ""}</div>
      <button class="x" data-act="close" aria-label="Close">✕</button></header>${body}</aside>`;
  const first = $(".drawer [autofocus]") || $(".drawer .x");
  if (first) first.focus();
}
export function closeDrawer() { $("#drawerRoot").innerHTML = ""; }
export const drawerOpen = () => !!$(".drawer");

/* ---------- delegation: views register actions, forms and live inputs by name ---------- */
const ACTIONS = {}, FORMS = {}, INPUTS = {};
export const on = {
  act: (name, fn) => { ACTIONS[name] = fn; },
  form: (name, fn) => { FORMS[name] = fn; },
  input: (name, fn) => { INPUTS[name] = fn; },
};
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || !ACTIONS[t.dataset.act]) return;
  if (t.tagName !== "A" || !t.getAttribute("href") || t.getAttribute("href") === "#") e.preventDefault();
  ACTIONS[t.dataset.act](t, e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawerOpen()) closeDrawer();
  if (e.key === "Enter" && e.target.matches("tr[data-act]")) ACTIONS[e.target.dataset.act]?.(e.target, e);
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (!f || !FORMS[f.dataset.form]) return;
  e.preventDefault();
  FORMS[f.dataset.form](f, formData(f), e);
});
document.addEventListener("input", (e) => {
  const t = e.target.closest("[data-input]");
  if (t && INPUTS[t.dataset.input]) INPUTS[t.dataset.input](t, e);
});
document.addEventListener("change", (e) => {
  const t = e.target.closest("[data-change]");
  if (t && INPUTS[t.dataset.change]) INPUTS[t.dataset.change](t, e);
});

/** Named fields of a form as a plain object (checkboxes as booleans, values trimmed). */
export function formData(f) {
  const o = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === "checkbox" ? el.checked : String(el.value).trim();
  }
  return o;
}

/** Disables a form's submit button while a save runs; puts it back afterwards. */
export async function busy(f, fn, label = "Saving…") {
  const b = f && f.querySelector('button[type="submit"]');
  const old = b && b.innerHTML;
  if (b) { b.disabled = true; b.textContent = label; }
  try { return await fn(); }
  finally { if (b && b.isConnected) { b.disabled = false; b.innerHTML = old; } }
}

/* ---------- small building blocks ---------- */
export function kpi(label, value, hint, lead) {
  return `<div class="kpi${lead ? " lead" : ""}"><div class="label">${esc(label)}</div><div class="value num${String(value).length > 12 ? " long" : ""}">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;
}
export function countBy(list, fn, weight) {
  const o = {};
  list.forEach((l) => { const k = fn(l); if (k) o[k] = (o[k] || 0) + (weight ? weight(l) : 1); });
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
}
export function hbars(rows, fmt = fmtN) {
  if (!rows.length) return '<p class="muted">Nothing yet in this period.</p>';
  const top = Math.max(...rows.map((r) => r[1])) || 1;
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" title="${esc(r[0])}: ${esc(fmt(r[1]))}"><span class="name">${esc(r[0])}</span><span class="track"><span class="fill" style="width:${Math.max(2, (r[1] / top) * 100)}%"></span></span><span class="v num">${esc(fmt(r[1]))}</span></div>`).join("")}</div>`;
}
export function opts(list, cur, all) {
  return (all != null ? `<option value="">${esc(all)}</option>` : "") +
    list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(cur ?? "") ? " selected" : ""}>${esc(label)}</option>`).join("");
}
export function field(name, label, val, attrs = "") {
  return `<label class="fl" for="f_${name}">${label}<input id="f_${name}" name="${name}" value="${esc(val ?? "")}" ${attrs}></label>`;
}
export function select(name, label, list, cur, attrs = "") {
  return `<label class="fl" for="f_${name}">${label}<select id="f_${name}" name="${name}" ${attrs}>${opts(list, cur)}</select></label>`;
}
export function area(name, label, val, attrs = "") {
  return `<label class="fl" for="f_${name}">${label}<textarea id="f_${name}" name="${name}" ${attrs}>${esc(val ?? "")}</textarea></label>`;
}
export function emptyRow(cols, text) { return `<tr class="no-hover"><td colspan="${cols}" class="empty">${esc(text)}</td></tr>`; }

/* ---------- CSV ---------- */
export function toCsv(rows, cols) {
  return [cols.join(",")].concat(rows.map((r) => cols.map((c) => {
    let v = String(r[c] == null ? "" : r[c]);
    if (/^[=+\-@]/.test(v)) v = "'" + v;          // a spreadsheet must not read it as a formula
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(","))).join("\n");
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
export function download(name, text, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export function copyText(text, okMsg) {
  const done = () => toast(okMsg);
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  function fallback() {
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Select and copy the text manually."); }
    t.remove();
  }
}

/* ---------- icons ---------- */
const sv = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICON = {
  overview: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  orders: sv('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  invoices: sv('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
  inventory: sv('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  promos: sv('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  marketing: sv('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>'),
  dealers: sv('<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/>'),
  settings: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  subscriptions: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 14v3l2 1"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  copy: sv('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
  down: sv('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
  up: sv('<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  info: sv('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  print: sv('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>'),
  pen: sv('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: sv('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
};

/** Status label with an icon shape (statuses never use the device-safety colours). */
const SICON = {
  new: '<circle cx="6" cy="6" r="4" fill="currentColor"/>',
  payment_pending: '<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 1.5"/>',
  contacted: '<path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  paid: '<path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  installed: '<path d="M6 1.5 10.5 5v5.5h-9V5Z" fill="currentColor"/>',
  refunded: '<path d="M9.5 4A4 4 0 1 0 10 7.5M10 1.5V4H7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  not_interested: '<path d="M3 6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  issued: '<path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  void: '<path d="M3 3l6 6M9 3 3 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  due: '<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 1.5"/>',
  active: '<circle cx="6" cy="6" r="4" fill="currentColor"/>',
  off: '<path d="M3 6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
export function pill(key, label) {
  return `<span class="pill s-${esc(key)}"><svg viewBox="0 0 12 12" aria-hidden="true">${SICON[key] || ""}</svg>${esc(label || key || "—")}</span>`;
}
