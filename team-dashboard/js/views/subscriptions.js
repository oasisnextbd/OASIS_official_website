/* Subscriptions & renewals: every service the company pays for (or uses free), what it costs,
   when it renews and who pays, with a warning before each renewal and a payment history. */

import { esc, fmtN, money, day, today, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, saveSub, renewSub, setSubActive, addCurrentServices } from "../store.js";
import { CYCLES, daysUntil, monthlyCost, renewalState } from "../calc.js";

const CATEGORIES = ["Domain", "Hosting", "Accounts", "Payments", "SMS & messaging", "Marketing", "Design & office", "Other"];
const amount = (n, cur) => (!cur || cur === "BDT" ? money(n) : `${cur} ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const host = (u) => { try { return new URL(u).hostname; } catch (e) { return "link"; } };
const totalsBy = (list, fn) => list.reduce((o, s) => { const c = s.currency || "BDT"; o[c] = (o[c] || 0) + fn(s); return o; }, {});
const showTotals = (o) => Object.entries(o).filter(([, v]) => v).map(([c, v]) => amount(v, c)).join(" + ") || money(0);
function whenText(s) {
  const n = daysUntil(s.renews_on, today());
  if (n === null || s.cycle === "free" || s.cycle === "once") return s.cycle === "free" ? "Nothing to renew" : "—";
  return n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue` : n === 0 ? "Today" : `in ${n} day${n === 1 ? "" : "s"}`;
}
function statusPill(s) {
  const st = renewalState(s, today());
  if (st === "overdue") return pill("void", s.auto_renew ? "Check it renewed" : "Overdue");
  if (st === "soon") return pill("due", "Renews soon");
  if (s.cycle === "free") return pill("issued", "Free");
  return pill("issued", "OK");
}
export const renewalsDue = () => S.data.subscriptions.filter((s) => s.active !== false && ["overdue", "soon"].includes(renewalState(s, today())));

export default {
  id: "subscriptions", label: "Subscriptions", icon: "subscriptions", deps: ["subscriptions"],
  badge: () => renewalsDue().length,
  render() {
    const all = S.data.subscriptions, live = all.filter((s) => s.active !== false), stopped = all.filter((s) => s.active === false);
    const sorted = live.slice().sort((a, b) => String(a.renews_on || "9999").localeCompare(String(b.renews_on || "9999")));
    const due = renewalsDue();
    const paid = live.filter((s) => s.cycle !== "free" && s.cycle !== "once");
    const founder = can("subscriptions");
    const row = (s) => `<tr${founder ? ` data-act="sub:open" data-id="${esc(s.id)}" tabindex="0"` : ' class="no-hover"'}>
      <td class="name"><strong>${esc(s.name)}</strong><br><span class="type">${esc(s.category || "")}</span></td>
      <td class="num">${s.cycle === "free" ? "Free" : amount(s.cost, s.currency)}<br><span class="type">${esc(CYCLES[s.cycle] || "")}</span></td>
      <td class="num">${s.renews_on ? day(s.renews_on) : "—"}<br><span class="type">${esc(whenText(s))}</span></td>
      <td>${s.cycle === "free" ? "—" : s.auto_renew ? "Auto-renews" : "Pay by hand"}</td>
      <td>${esc(s.paid_by || "")}${s.payment_method ? `<br><span class="type">${esc(s.payment_method)}</span>` : ""}</td>
      <td>${statusPill(s)}</td></tr>`;
    return `<div class="topline"><div><h1>Subscriptions &amp; renewals</h1><div class="sub">Every service the company uses: what it costs, when it renews and who pays.</div></div>
      <div class="actions">${founder ? `<button class="btn primary" data-act="sub:new">${ICON.plus}Add subscription</button>` : ""}</div></div>
      ${due.length ? `<div class="banner">${ICON.info}<div><strong>${due.length === 1 ? "1 renewal needs attention" : due.length + " renewals need attention"}:</strong> ${due.map((s) => `${esc(s.name)} (${esc(whenText(s))})`).join(", ")}.</div></div>` : ""}
      ${!all.length && founder ? `<div class="banner">${ICON.info}<div>Nothing listed yet. <button class="btn" data-act="sub:defaults" style="margin-left:6px">Add the free services we already use</button> <span class="sub">(GitHub, Firebase, the Google account)</span>. Add the domain once it's bought.</div></div>` : ""}
      <div class="kpis">${kpi("Per month", showTotals(totalsBy(paid, monthlyCost)), "yearly costs spread over 12 months", true)}
        ${kpi("Per year", showTotals(totalsBy(paid, (s) => monthlyCost(s) * 12)), fmtN(paid.length) + " paid services")}
        ${kpi("Renewing within their reminder time", fmtN(due.filter((s) => renewalState(s, today()) === "soon").length), "usually 30 days ahead")}
        ${kpi("Overdue", fmtN(due.filter((s) => renewalState(s, today()) === "overdue").length), "renewal date has passed")}</div>
      <div class="table-wrap"><table><thead><tr><th>Service</th><th>Cost</th><th>Next renewal</th><th>Renewal</th><th>Paid by</th><th>Status</th></tr></thead><tbody>
        ${sorted.length ? sorted.map(row).join("") : emptyRow(6, "No subscriptions yet.")}</tbody></table></div>
      ${stopped.length ? `<details class="panel tight" style="margin-top:16px"><summary><strong>Stopped (${stopped.length})</strong></summary><div class="table-wrap flat"><table><tbody>${stopped.map(row).join("")}</tbody></table></div></details>` : ""}`;
  },
};

on.act("sub:defaults", async (t) => { t.disabled = true; try { await addCurrentServices(); toast("Added"); } catch (e) { t.disabled = false; toast(e.message || String(e)); } });
on.act("sub:new", () => subForm());
on.act("sub:open", (t) => subForm(S.data.subscriptions.find((s) => s.id === t.dataset.id)));

function subForm(s) {
  const isNew = !s; s = s || { currency: "BDT", cycle: "yearly", remind_days: 30, auto_renew: false, category: "Domain" };
  const renewable = !isNew && s.cycle !== "free" && s.cycle !== "once" && s.renews_on;
  drawer(isNew ? "Add subscription" : s.name, `
    ${renewable ? `<form data-form="sub:renew" data-id="${esc(s.id)}" class="panel tight stack"><h2>Paid the renewal?</h2>
      <p class="sub">Records the payment and moves the next renewal from ${esc(day(s.renews_on))} to the next ${esc((CYCLES[s.cycle] || "").toLowerCase())} date.</p>
      <div class="form-grid">${field("amount", `Amount paid (${esc(s.currency || "BDT")})`, s.cost, 'inputmode="decimal"')}${field("note", "Note", "", 'placeholder="e.g. Paid by bKash, receipt in email"')}</div>
      <div><button class="btn primary" type="submit">Mark as renewed</button></div></form>` : ""}
    <form data-form="sub:save" data-id="${esc(isNew ? "" : s.id)}" class="stack"><div class="form-grid">
      ${field("name", "Service", s.name, 'required placeholder="e.g. venguard.com.bd domain"' + (isNew ? " autofocus" : ""))}
      ${select("category", "Kind", CATEGORIES.map((c) => [c, c]), s.category)}
      ${select("cycle", "Paid", Object.entries(CYCLES), s.cycle)}
      ${field("renews_on", "Next renewal date", s.renews_on || "", 'type="date"')}
      ${field("cost", "Cost each time", s.cost || "", 'inputmode="decimal" placeholder="0"')}
      ${select("currency", "Currency", [["BDT", "BDT"], ["USD", "USD"], ["EUR", "EUR"]], s.currency || "BDT")}
      ${field("paid_by", "Who pays", s.paid_by, 'placeholder="e.g. Omayer"')}
      ${field("payment_method", "Paid with", s.payment_method, 'placeholder="e.g. Company bKash, card ending 4321"')}
      ${field("account", "Account / login", s.account, 'placeholder="e.g. oasisnextbd@gmail.com (never a password)"')}
      ${field("url", "Where to manage it", s.url, 'placeholder="https://…"')}
      ${field("remind_days", "Warn how many days before", s.remind_days || 30, 'inputmode="numeric"')}</div>
      <label class="check"><input type="checkbox" name="auto_renew"${s.auto_renew ? " checked" : ""}> Renews by itself (auto-renew is on)</label>
      ${area("notes", "Notes", s.notes)}
      <div class="actions"><button class="btn primary" type="submit">Save</button>
      ${!isNew ? `<button class="btn" type="button" data-act="sub:toggle" data-id="${esc(s.id)}" data-on="${s.active === false ? 1 : ""}">${s.active === false ? "Track it again" : "Stopped using it"}</button>` : ""}
      ${s.url ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">Open ${esc(host(s.url))}</a>` : ""}</div></form>
    ${(s.history || []).length ? `<section><h2>Payments</h2><ul class="plain history">${s.history.slice().reverse().map((h) => `<li><span class="num muted">${day(h.at)}</span> ${esc(amount(h.amount, h.currency))} for the period from ${esc(day(h.period_from))}${h.note ? ` · ${esc(h.note)}` : ""} <span class="muted">· ${esc(h.by)}</span></li>`).join("")}</ul></section>` : ""}`,
  { kicker: isNew ? "" : (s.category || ""), after: isNew ? "" : statusPill(s) });
}
on.form("sub:save", (f, d) => busy(f, async () => {
  try { await saveSub(f.dataset.id || null, d); toast("Saved " + d.name); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
on.form("sub:renew", (f, d) => busy(f, async () => {
  try { await renewSub(f.dataset.id, d.amount, d.note); toast("Renewal recorded"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
on.act("sub:toggle", async (t) => {
  try { await setSubActive(t.dataset.id, !!t.dataset.on); toast(t.dataset.on ? "Tracking again" : "Moved to Stopped"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
});
