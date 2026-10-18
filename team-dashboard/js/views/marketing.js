/* Marketing costs: what was spent per channel, and what each channel brought back
   (orders, paying customers and invoiced sales), so the team can see cost per customer. */

import { esc, fmtN, money, day, today, toast, drawer, closeDrawer, on, busy, field, select, area, emptyRow, kpi, opts, hbars, ICON } from "../ui.js";
import { S, can, saveSpend, deleteSpend } from "../store.js";
import { CHANNELS, channelOf } from "../calc.js";
import { R } from "../redraw.js";

const RANGES = [["month", "This month"], ["3m", "Last 3 months"], ["year", "This year"], ["all", "All time"]];
let range = "3m";
function since() {
  const d = new Date();
  if (range === "month") return d.toISOString().slice(0, 8) + "01";
  if (range === "3m") { d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); }
  if (range === "year") return d.getFullYear() + "-01-01";
  return "";
}

export default {
  id: "marketing", label: "Marketing costs", icon: "marketing", deps: ["marketing", "orders", "invoices"],
  render() {
    const from = since(), inRange = (iso) => !from || String(iso || "").slice(0, 10) >= from;
    const spend = S.data.marketing.filter((m) => inRange(m.date));
    const orders = S.data.orders.filter((o) => inRange(o.submitted_at));
    const invoices = S.data.invoices.filter((i) => i.status === "issued" && inRange(i.issued_at));
    const orderById = Object.fromEntries(S.data.orders.map((o) => [o.id, o]));
    const invoicedOrders = new Set(S.data.invoices.filter((i) => i.status === "issued").map((i) => i.order_id));
    const paying = (o) => invoicedOrders.has(o.id) || o.status === "paid" || o.status === "installed";
    const ch = {};
    const row = (k) => (ch[k] = ch[k] || { spend: 0, orders: 0, paying: 0, sales: 0 });
    spend.forEach((m) => { row(m.channel).spend += m.amount || 0; });
    orders.forEach((o) => { const c = channelOf(o) || "unknown"; row(c).orders++; if (paying(o)) row(c).paying++; });
    invoices.forEach((i) => { const o = orderById[i.order_id]; row((o && channelOf(o)) || "unknown").sales += i.total || 0; });
    const name = (k) => CHANNELS[k] || (k === "unknown" ? "Not recorded" : k);
    const total = spend.reduce((s, m) => s + (m.amount || 0), 0), payingN = orders.filter(paying).length, sales = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const per = (a, b) => (b ? money(a / b) : "—");
    const list = Object.entries(ch).sort((a, b) => b[1].spend - a[1].spend || b[1].orders - a[1].orders);
    return `<div class="topline"><div><h1>Marketing costs</h1><div class="sub">Orders count for the channel the customer came from (website tracking, the "Came by" field, dealer codes).</div></div>
      <div class="actions"><select class="f" data-change="mkt:range" aria-label="Period">${opts(RANGES, range)}</select>
      ${can("marketing") ? `<button class="btn primary" data-act="mkt:new">${ICON.plus}Add a cost</button>` : ""}</div></div>
      <div class="kpis">${kpi("Spent", money(total), fmtN(spend.length) + " costs recorded", true)}${kpi("Orders", fmtN(orders.length), fmtN(payingN) + " became paying customers")}
        ${kpi("Cost per order", per(total, orders.length), "spend ÷ orders")}${kpi("Cost per paying customer", per(total, payingN), "spend ÷ paying customers")}
        ${kpi("Invoiced sales", money(sales), total ? (sales / total).toFixed(1) + " taka back per taka spent" : "no spend recorded")}</div>
      <div class="grid2"><section class="panel"><h2>By channel</h2><div class="table-wrap flat"><table><thead><tr><th>Channel</th><th>Spent</th><th>Orders</th><th>Paying</th><th>Sales</th><th>Per order</th><th>Per paying</th></tr></thead><tbody>
        ${list.length ? list.map(([k, v]) => `<tr class="no-hover"><td>${esc(name(k))}</td><td class="num">${money(v.spend)}</td><td class="num">${fmtN(v.orders)}</td><td class="num">${fmtN(v.paying)}</td><td class="num">${money(v.sales)}</td>
          <td class="num">${v.spend ? per(v.spend, v.orders) : "—"}</td><td class="num">${v.spend ? per(v.spend, v.paying) : "—"}</td></tr>`).join("") : emptyRow(7, "Nothing in this period.")}</tbody></table></div></section>
      <section class="panel"><h2>Where the money went</h2>${hbars(list.filter(([, v]) => v.spend).map(([k, v]) => [name(k), v.spend]), money)}</section></div>
      <section class="panel"><h2>Costs</h2><div class="table-wrap flat"><table><thead><tr><th>Date</th><th>Channel</th><th>What</th><th>Amount</th></tr></thead><tbody>
        ${spend.length ? spend.map((m) => `<tr${can("marketing") ? ` data-act="mkt:edit" data-id="${esc(m.id)}" tabindex="0"` : ' class="no-hover"'}><td class="num">${day(m.date)}</td><td>${esc(name(m.channel))}</td>
          <td class="name">${esc(m.campaign)}${m.note ? `<br><span class="type">${esc(m.note)}</span>` : ""}</td><td class="num">${money(m.amount)}</td></tr>`).join("") : emptyRow(4, "No costs recorded in this period.")}</tbody></table></div></section>`;
  },
};
on.input("mkt:range", (t) => { range = t.value; R.draw(); });

function spendForm(m, id) {
  m = m || { date: today() };
  drawer(id ? "Edit cost" : "Add a marketing cost", `<form data-form="mkt:save" data-id="${esc(id || "")}" class="stack"><div class="form-grid">
    ${field("date", "Date", m.date, 'type="date" required')}${select("channel", "Channel", Object.entries(CHANNELS), m.channel || "facebook")}
    ${field("campaign", "What it was for", m.campaign, 'placeholder="e.g. Facebook boost: Dhaka homes" autofocus')}${field("amount", "Amount (BDT)", m.amount || "", 'inputmode="numeric" required')}</div>
    ${area("note", "Note", m.note)}
    <div class="actions"><button class="btn primary" type="submit">Save</button>${id ? `<button class="btn" type="button" data-act="mkt:del" data-id="${esc(id)}">${ICON.trash}Delete</button>` : ""}</div></form>`);
}
on.act("mkt:new", () => spendForm());
on.act("mkt:edit", (t) => spendForm(S.data.marketing.find((m) => m.id === t.dataset.id), t.dataset.id));
on.act("mkt:del", async (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to delete"; return; }
  try { await deleteSpend(t.dataset.id); toast("Deleted"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
});
on.form("mkt:save", (f, d) => busy(f, async () => {
  try { await saveSpend(f.dataset.id, d); toast("Saved"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
