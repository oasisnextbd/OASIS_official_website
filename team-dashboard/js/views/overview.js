/* Overview: the numbers the founders look at first, for a chosen period. */

import { esc, fmtN, money, ago, kpi, hbars, countBy, pill, on, ICON } from "../ui.js";
import { S, STATUS, TYPE } from "../store.js";
import { CHANNELS, channelOf } from "../calc.js";
import { R } from "../redraw.js";
import { openOrder } from "./orders.js";
import { renewalsDue } from "./subscriptions.js";

let range = 30;
const inRange = (iso) => !range || (Date.now() - new Date(iso)) / 864e5 <= range;

export default {
  id: "overview", label: "Overview", icon: "overview", deps: ["orders", "invoices", "inventory", "marketing", "subscriptions"],
  render() {
    const all = S.data.orders, L = all.filter((o) => inRange(o.submitted_at));
    const inv = S.data.invoices.filter((i) => i.status === "issued");
    const invR = inv.filter((i) => inRange(i.issued_at));
    const invoiced = new Set(inv.map((i) => i.order_id));
    const paying = L.filter((o) => invoiced.has(o.id) || o.status === "paid" || o.status === "installed");
    const spend = S.data.marketing.filter((m) => inRange(m.date)).reduce((s, m) => s + (m.amount || 0), 0);
    const lowItems = S.data.inventory.filter((i) => (Number(i.stock) || 0) <= (Number(i.low_at) || 0));
    const follow = all.filter((o) => (o.status === "new" || o.status === "payment_pending") && (Date.now() - new Date(o.submitted_at)) / 36e5 > 24)
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)).slice(0, 8);
    const label = range ? `last ${range} days` : "all time";
    const seg = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]].map(([v, l]) => `<button type="button" data-act="ov:range" data-v="${v}" aria-pressed="${range === v}">${l}</button>`).join("");
    const due = renewalsDue();
    const renewals = due.length ? `<div class="banner">${ICON.info}<div><strong>Renewal${due.length > 1 ? "s" : ""} coming up:</strong> ${due.map((s) => esc(s.name) + (s.renews_on ? " (" + esc(s.renews_on) + ")" : "")).join(", ")}. <button class="linkish" data-act="nav" data-view="subscriptions">Open Subscriptions</button></div></div>` : "";
    return `${renewals}<div class="topline"><div><h1>Overview</h1><div class="sub">${fmtN(L.length)} orders and leads, ${label}</div></div><div class="seg" role="group" aria-label="Period">${seg}</div></div>
      <div class="kpis">${kpi("Invoiced sales", money(invR.reduce((s, i) => s + i.total, 0)), fmtN(invR.length) + " invoices", true)}
        ${kpi("Collected", money(invR.reduce((s, i) => s + (i.paid || 0), 0)), money(inv.reduce((s, i) => s + Math.max(0, i.due || 0), 0)) + " still to collect (all invoices)")}
        ${kpi("Orders & leads", fmtN(L.length), fmtN(L.filter((o) => o.form_type === "preorder").length) + " pre-orders")}
        ${kpi("Paying customers", fmtN(paying.length), L.length ? Math.round((100 * paying.length) / L.length) + "% of orders and leads" : "—")}
        ${kpi("Marketing spend", money(spend), paying.length && spend ? money(spend / paying.length) + " per paying customer" : "per paying customer: —")}
        ${kpi("Stock running low", fmtN(lowItems.length), lowItems.map((i) => i.name).join(", ") || "all items above their warning level")}</div>
      <div class="grid2"><section class="panel"><h2>New orders and leads per day</h2>${dailyChart(L)}</section>
        <section class="panel"><h2>From order to installation</h2>${funnel(L, paying)}</section></div>
      <div class="grid3"><section class="panel"><h2>Where they came from</h2>${hbars(countBy(L, (o) => CHANNELS[channelOf(o)] || "Not recorded").slice(0, 7))}</section>
        <section class="panel"><h2>Districts</h2>${hbars(countBy(L, (o) => o.district).slice(0, 7))}</section>
        <section class="panel followup"><h2>Needs a call</h2>${follow.length ? `<ul>${follow.map((o) => `<li data-act="ov:open" data-id="${esc(o.id)}" tabindex="0"><span><strong>${esc(o.name)}</strong><br><span class="type">${esc(TYPE[o.form_type] || "")} · ${esc(o.district || "")}</span></span><span style="text-align:right">${pill(o.status, STATUS[o.status])}<br><span class="type">${ago(o.submitted_at)}</span></span></li>`).join("")}</ul>` : '<p class="muted">Everyone older than a day has been contacted.</p>'}</section></div>`;
  },
};
on.act("ov:range", (t) => { range = +t.dataset.v; R.draw(); });
on.act("ov:open", (t) => openOrder(t.dataset.id));

function funnel(L, paying) {
  const reached = L.filter((o) => ["contacted", "paid", "installed"].includes(o.status) || paying.includes(o));
  const steps = [["Order or lead", L.length], ["Reached by the team", reached.length], ["Paying customer", paying.length], ["Installed", L.filter((o) => o.status === "installed").length]];
  const top = Math.max(1, steps[0][1]);
  return `<div class="funnel">${steps.map((s, i) => `<div class="fstep"><span>${s[0]}</span><span class="v num">${fmtN(s[1])}${i && steps[0][1] ? " · " + Math.round((100 * s[1]) / steps[0][1]) + "%" : ""}</span><span class="track"><span class="fill" style="width:${Math.max(1, (100 * s[1]) / top)}%"></span></span></div>`).join("")}</div>`;
}
function dailyChart(L) {
  const first = Math.min(...S.data.orders.map((o) => +new Date(o.submitted_at)).filter((n) => !isNaN(n)), Date.now());
  const days = Math.min(range || Math.max(7, Math.ceil((Date.now() - first) / 864e5)), 120);
  const start0 = new Date(); start0.setHours(0, 0, 0, 0);
  const start = +start0 - (days - 1) * 864e5;
  const b = Array.from({ length: days }, (_, i) => ({ d: new Date(start + i * 864e5), n: 0 }));
  L.forEach((o) => { const i = Math.floor((+new Date(o.submitted_at) - start) / 864e5); if (i >= 0 && i < days) b[i].n++; });
  let max = Math.max(4, ...b.map((x) => x.n));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 20; max = Math.ceil(max / step) * step;
  const W = 600, H = 220, padL = 28, padB = 22, padT = 8, iw = W - padL - 4, ih = H - padB - padT, bw = iw / days, gap = Math.min(2, bw * 0.25);
  let g = "";
  for (let y = 0; y <= max; y += step) { const yy = padT + ih - (y / max) * ih; g += `<line class="gridline" x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${y}</text>`; }
  const every = Math.ceil(days / 6);
  b.forEach((x, i) => {
    const h = (x.n / max) * ih, X = padL + i * bw, label = x.d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    g += `<g><title>${esc(label)}: ${x.n}</title><rect class="hit" x="${X}" y="${padT}" width="${bw}" height="${ih}"/>${x.n ? `<rect class="barp" x="${X + gap / 2}" y="${padT + ih - h}" width="${Math.max(1, bw - gap)}" height="${h}" rx="${Math.min(3, bw / 3)}"/>` : ""}</g>`;
    if (i % every === 0) g += `<text x="${X + bw / 2}" y="${H - 6}" text-anchor="middle">${label}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Bar chart of new orders and leads per day">${g}</svg></div>`;
}
