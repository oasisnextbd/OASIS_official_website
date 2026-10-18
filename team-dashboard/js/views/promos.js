/* Promo codes: percent or taka off, with dates and a usage limit. A use is counted when an invoice
   with the code is issued (and given back if it is cancelled). Customers can also type a code on
   the website's order form, which checks it is active. */

import { esc, fmtN, money, day, toast, drawer, closeDrawer, on, busy, pill, field, select, area, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, savePromo, setPromoActive } from "../store.js";
import { promoProblem, CHANNELS } from "../calc.js";

const offText = (p) => (p.type === "percent" ? `${p.value}% off` : `${money(p.value)} off`);
const validText = (p) => (p.starts && p.ends ? `${day(p.starts)} – ${day(p.ends)}` : p.ends ? `until ${day(p.ends)}` : p.starts ? `from ${day(p.starts)}` : "No end date");

export default {
  id: "promos", label: "Promo codes", icon: "promos", deps: ["promos", "invoices", "orders"],
  render() {
    const live = S.data.invoices.filter((i) => i.status === "issued" && i.promo);
    const per = {};
    for (const i of live) { const k = i.promo.code; per[k] = per[k] || { n: 0, off: 0, sales: 0 }; per[k].n++; per[k].off += i.promo_discount || 0; per[k].sales += i.total || 0; }
    const orders = {};
    for (const o of S.data.orders) if (o.promo_code) orders[o.promo_code] = (orders[o.promo_code] || 0) + 1;
    const rows = S.data.promos.slice().sort((a, b) => (b.active - a.active) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const usable = rows.filter((p) => !promoProblem(p));
    return `<div class="topline"><div><h1>Promo codes</h1><div class="sub">Discounts on the items of an invoice (not on delivery or VAT).</div></div>
      <div class="actions">${can("promos") ? `<button class="btn primary" data-act="promo:new">${ICON.plus}New code</button>` : ""}</div></div>
      <div class="kpis">${kpi("Codes working today", fmtN(usable.length), fmtN(rows.length) + " codes in total", true)}
        ${kpi("Invoices with a code", fmtN(live.length), money(live.reduce((s, i) => s + (i.total || 0), 0)) + " in sales")}
        ${kpi("Discount given", money(live.reduce((s, i) => s + (i.promo_discount || 0), 0)), "through promo codes")}
        ${kpi("Orders that mentioned a code", fmtN(Object.values(orders).reduce((a, b) => a + b, 0)), "from the website or WhatsApp")}</div>
      <div class="table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th>Orders</th><th>Discount given</th><th>Status</th></tr></thead><tbody>
      ${rows.length ? rows.map((p) => { const problem = promoProblem(p), u = per[p.id] || { n: 0, off: 0 };
        return `<tr${can("promos") ? ` data-act="promo:edit" data-id="${esc(p.id)}" tabindex="0"` : ' class="no-hover"'}><td class="mono"><strong>${esc(p.id)}</strong>${p.note ? `<br><span class="type">${esc(p.note)}</span>` : ""}</td>
          <td>${esc(offText(p))}</td><td class="num">${esc(validText(p))}</td><td class="num">${fmtN(p.used)}${p.max_uses ? " / " + fmtN(p.max_uses) : ""}</td>
          <td class="num">${fmtN(orders[p.id] || 0)}</td><td class="num">${money(u.off)}</td>
          <td>${problem ? pill("off", p.active ? "Not usable" : "Off") : pill("active", "Working")}${problem && p.active ? `<br><span class="type">${esc(problem)}</span>` : ""}</td></tr>`; }).join("")
        : emptyRow(7, "No promo codes yet.")}</tbody></table></div>`;
  },
};

function promoForm(p) {
  const isNew = !p; p = p || { type: "percent", active: true };
  drawer(isNew ? "New promo code" : p.id, `<form data-form="promo:save" data-new="${isNew ? 1 : ""}" class="stack"><div class="form-grid">
    ${field("code", "Code", p.id || "", isNew ? 'class="mono" required autofocus placeholder="e.g. EID10" autocapitalize="characters"' : 'class="mono" readonly')}
    ${select("type", "Kind", [["percent", "Percent off"], ["amount", "Taka off"]], p.type)}
    ${field("value", "How much", p.value || "", 'inputmode="numeric" required placeholder="e.g. 10"')}
    ${field("max_uses", "Maximum uses (0 = no limit)", p.max_uses || 0, 'inputmode="numeric"')}
    ${field("starts", "Starts", p.starts || "", 'type="date"')}${field("ends", "Ends", p.ends || "", 'type="date"')}
    ${select("channel", "Given out through", [["", "Not tracked"], ...Object.entries(CHANNELS)], p.channel || "")}</div>
    ${area("note", "Note for the team", p.note, 'placeholder="e.g. Leaflet at the innovation fair"')}
    <label class="check"><input type="checkbox" name="active"${p.active === false ? "" : " checked"}> Code is on</label>
    ${!isNew ? `<p class="sub">Used ${fmtN(p.used)} times. The code itself can't be renamed; make a new one instead.</p>` : ""}
    <div class="actions"><button class="btn primary" type="submit">Save code</button>
    ${!isNew ? `<button class="btn" type="button" data-act="promo:toggle" data-id="${esc(p.id)}" data-on="${p.active ? "" : 1}">${p.active ? "Switch off now" : "Switch on now"}</button>` : ""}</div></form>`);
}
on.act("promo:new", () => promoForm());
on.act("promo:edit", (t) => promoForm(S.data.promos.find((p) => p.id === t.dataset.id)));
on.act("promo:toggle", async (t) => {
  try { await setPromoActive(t.dataset.id, !!t.dataset.on); toast(t.dataset.on ? "Code switched on" : "Code switched off"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
});
on.form("promo:save", (f, d) => busy(f, async () => {
  try { const code = await savePromo(d, !!f.dataset.new); toast("Saved " + code); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
