/* Payments: every payment recorded on an issued invoice (bKash, Nagad, cash, bank, card), with its reference,
   what is still to collect, and the pre-order deposits marked on orders. Read-only here: a payment is added
   on its invoice (Invoices → open one → Record a payment), so the invoice, its balance and this list agree. */

import { esc, fmtN, money, when, day, kpi, hbars, countBy, emptyRow, toCsv, download, on, ICON } from "../ui.js";
import { S, can } from "../store.js";
import { paymentRows } from "../calc.js";
import { R } from "../redraw.js";

let range = 30, F = { method: "", q: "" };
const inRange = (iso) => !range || (Date.now() - new Date(iso)) / 864e5 <= range;

export default {
  id: "payments", label: "Payments", icon: "payments", deps: ["invoices", "orders"],
  visible: () => can("invoices"),
  render() {
    const all = paymentRows(S.data.invoices), rows = all.filter((p) => inRange(p.at));
    const q = F.q.trim().toLowerCase();
    const list = rows.filter((p) => (!F.method || (p.method || "Not recorded") === F.method)
      && (!q || [p.invoice, p.customer, p.phone, p.ref, p.order_id].some((v) => String(v).toLowerCase().includes(q))));
    const due = S.data.invoices.filter((i) => i.status === "issued" && i.due > 0).sort((a, b) => String(a.issued_at).localeCompare(String(b.issued_at)));
    const deposits = S.data.orders.filter((o) => o.status === "paid" || o.status === "installed").length;
    const refunded = S.data.orders.filter((o) => o.status === "refunded").length;
    const methods = [...new Set(all.map((p) => p.method || "Not recorded"))];
    const seg = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]].map(([v, l]) => `<button type="button" data-act="pay:range" data-v="${v}" aria-pressed="${range === v}">${l}</button>`).join("");
    return `<div class="topline"><div><h1>Payments</h1><div class="sub">Every payment recorded on an invoice. To add one, open its invoice and use <b>Record a payment</b>.</div></div>
        <div class="actions"><div class="seg" role="group" aria-label="Period">${seg}</div><button class="btn" data-act="pay:csv">${ICON.down}Export CSV</button></div></div>
      <div class="kpis">${kpi("Collected", money(rows.reduce((s, p) => s + p.amount, 0)), `${fmtN(rows.length)} payment${rows.length === 1 ? "" : "s"}, ${range ? "last " + range + " days" : "all time"}`, true)}
        ${kpi("Still to collect", money(due.reduce((s, i) => s + i.due, 0)), `${fmtN(due.length)} invoice${due.length === 1 ? "" : "s"} with a balance`)}
        ${kpi("Deposits marked paid", fmtN(deposits), "orders with status Deposit paid or Installed")}
        ${kpi("Deposits refunded", fmtN(refunded), "orders with status Refunded")}</div>
      <div class="grid2"><section class="panel"><h2>By method</h2>${hbars(countBy(rows, (p) => p.method || "Not recorded", (p) => p.amount), money)}</section>
          
        <section class="panel"><h2>Still to collect</h2>${due.length ? `<ul class="plain followup">${due.slice(0, 12).map((i) => `<li data-act="inv:open" data-id="${esc(i.id)}" tabindex="0">
            <span><strong>${esc((i.customer && i.customer.name) || i.id)}</strong><br><span class="type mono">${esc(i.id)} · issued ${esc(day(i.issued_at))}</span></span><span class="num"><strong>${money(i.due)}</strong></span></li>`).join("")}</ul>`
            : '<p class="muted">Every issued invoice is paid in full.</p>'}</section></div>
      <section class="panel"><div class="panel-head"><h2>All payments</h2><div class="filters">
          <label class="search">${ICON.search}<span hidden>Search</span><input id="pay_q" type="search" placeholder="Invoice, customer, phone or reference" value="${esc(F.q)}" data-input="pay:q"></label>
          <select class="f" data-change="pay:method" aria-label="Method"><option value="">All methods</option>${methods.map((m) => `<option${F.method === m ? " selected" : ""}>${esc(m)}</option>`).join("")}</select></div></div>
        <div class="table-wrap flat"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>
        ${list.length ? list.map((p) => `<tr data-act="inv:open" data-id="${esc(p.invoice)}" tabindex="0"><td class="num">${esc(when(p.at))}</td><td class="mono">${esc(p.invoice)}</td>
          <td>${esc(p.customer)}${p.phone ? `<br><span class="type">${esc(p.phone)}</span>` : ""}</td><td>${esc(p.method || "—")}</td><td class="mono">${esc(p.ref || "—")}</td><td class="num"><strong>${money(p.amount)}</strong></td></tr>`).join("")
          : emptyRow(6, all.length ? "No payment matches." : "No payments recorded yet.")}</tbody></table></div></section>`;
  },
};

on.act("pay:range", (t) => { range = +t.dataset.v; R.draw(); });
on.input("pay:q", (t) => { F.q = t.value; R.draw(); });
on.input("pay:method", (t) => { F.method = t.value; R.draw(); });
on.act("pay:csv", () => {
  const rows = paymentRows(S.data.invoices).filter((p) => inRange(p.at));
  download(`venguard-payments-${range ? "last-" + range + "-days" : "all"}.csv`, toCsv(rows, ["at", "invoice", "order_id", "customer", "phone", "method", "ref", "amount", "by"]));
});
