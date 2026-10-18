/* Dealers: shops that sell VenGuard, each with a code and a QR sticker that tags the orders they bring. */

import { $, esc, fmtN, when, toast, drawer, closeDrawer, on, busy, field, select, area, emptyRow, copyText, ICON } from "../ui.js";
import { S, can, saveDealer, updateOrder } from "../store.js";

const link = (code) => (S.cfg.siteUrl || "https://oasisnextbd.github.io/OASIS_official_website/VENGuard") + "/?dealer=" + encodeURIComponent(code) + "&qr=shop-sticker";
const PREFIX = { Dhaka: "DH", Chattogram: "CT", Gazipur: "GZ", Narayanganj: "NG", Sylhet: "SY", Rajshahi: "RJ", Khulna: "KH", Barishal: "BR", Rangpur: "RP", Mymensingh: "MY", Cumilla: "CM" };
function suggestCode(district) {
  const p = PREFIX[district] || "DL";
  const n = S.data.dealers.filter((d) => String(d.id).startsWith(p + "-")).map((d) => parseInt(String(d.id).split("-")[1], 10) || 0);
  return p + "-" + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, "0");
}

export default {
  id: "dealers", label: "Dealers", icon: "dealers", deps: ["dealers", "orders", "invoices"],
  render() {
    const stats = {};
    const invoiced = new Set(S.data.invoices.filter((i) => i.status === "issued").map((i) => i.order_id));
    for (const o of S.data.orders) {
      if (!o.dealer_code) continue;
      const s = (stats[o.dealer_code] = stats[o.dealer_code] || { all: 0, pre: 0, paid: 0 });
      s.all++; if (o.form_type === "preorder") s.pre++;
      if (invoiced.has(o.id) || o.status === "paid" || o.status === "installed") s.paid++;
    }
    const apps = S.data.orders.filter((o) => o.form_type === "dealer" && o.status !== "not_interested" && !S.data.dealers.some((d) => String(d.phone) === String(o.phone)));
    const founder = can("dealers");
    return `<div class="topline"><div><h1>Dealers</h1><div class="sub">Each dealer gets a code and a QR link. Orders made through it are counted here.</div></div>
      ${founder ? `<button class="btn primary" data-act="dealer:new">${ICON.plus}Add dealer</button>` : ""}</div>
      <div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>Code</th><th>Shop</th><th>Area</th><th>Status</th><th>Leads</th><th>Pre-orders</th><th>Paying</th><th></th></tr></thead><tbody>
      ${S.data.dealers.length ? S.data.dealers.map((d) => { const s = stats[d.id] || { all: 0, pre: 0, paid: 0 };
        return `<tr${founder ? ` data-act="dealer:edit" data-id="${esc(d.id)}" tabindex="0"` : ' class="no-hover"'}><td class="mono"><strong>${esc(d.id)}</strong></td>
          <td class="name">${esc(d.shop_name)}<br><span class="type">${esc(d.owner_name)} · ${esc(d.phone)}</span></td><td>${esc(d.area)}<br><span class="type">${esc(d.district)}</span></td>
          <td>${esc(d.status)}</td><td class="num">${s.all}</td><td class="num">${s.pre}</td><td class="num">${s.paid}</td>
          <td><button class="btn" data-act="dealer:qr" data-id="${esc(d.id)}">QR &amp; link</button></td></tr>`; }).join("")
        : emptyRow(8, "No dealers yet.")}</tbody></table></div>
      <section class="panel"><h2>Dealer applications from the website</h2>${apps.length ? `<div class="table-wrap flat"><table><thead><tr><th>Received</th><th>Shop</th><th>Area</th><th>Phone</th><th></th></tr></thead><tbody>
        ${apps.map((o) => `<tr data-act="order:open" data-id="${esc(o.id)}" tabindex="0"><td class="num">${when(o.submitted_at)}</td><td class="name"><strong>${esc(o.organisation || "—")}</strong><br><span class="type">${esc(o.name)}</span></td>
          <td>${esc(o.area || "")}, ${esc(o.district || "")}</td><td class="num">${esc(o.phone)}</td><td>${founder ? `<button class="btn" data-act="dealer:approve" data-id="${esc(o.id)}">Approve as dealer</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted">No new applications.</p>'}</section>`;
  },
};

function dealerForm(d, fromOrder) {
  const isNew = !d || !d.id; d = d || {};
  const code = d.id || suggestCode(d.district);
  drawer(isNew ? "Add dealer" : "Edit " + d.id, `<form data-form="dealer:save" data-order="${esc(fromOrder || "")}" class="stack"><div class="form-grid">
    ${field("code", "Dealer code", code, isNew ? 'class="mono" required' : 'class="mono" readonly')}${select("status", "Status", [["active", "Active"], ["trial", "Trial"], ["paused", "Paused"]], d.status || "active")}
    ${field("shop_name", "Shop name", d.shop_name, "autofocus")}${field("owner_name", "Owner", d.owner_name)}${field("phone", "Phone", d.phone, 'inputmode="tel"')}
    ${field("area", "Area", d.area)}${field("district", "District", d.district)}</div>${area("notes", "Notes", d.notes)}
    <div><button class="btn primary" type="submit">Save dealer</button></div></form>`);
}
on.act("dealer:new", () => dealerForm());
on.act("dealer:edit", (t) => dealerForm(S.data.dealers.find((d) => d.id === t.dataset.id)));
on.act("dealer:approve", (t) => {
  const o = S.data.orders.find((x) => x.id === t.dataset.id);
  dealerForm({ shop_name: o.organisation, owner_name: o.name, phone: o.phone, area: o.area, district: o.district, status: "trial" }, o.id);
});
on.form("dealer:save", (f, d) => busy(f, async () => {
  try {
    const code = await saveDealer(d);
    if (f.dataset.order) {
      const o = S.data.orders.find((x) => x.id === f.dataset.order);
      await updateOrder(o.id, { status: "contacted", team_notes: (o.team_notes ? o.team_notes + "\n" : "") + "Approved as dealer " + code });
    }
    toast("Saved dealer " + code); closeDrawer();
  } catch (e) { toast(e.message || String(e)); }
}));
on.act("dealer:qr", (t) => {
  const code = t.dataset.id, url = link(code);
  drawer(code + " QR sticker", `<div class="qr" id="qrBox" aria-label="QR code for ${esc(code)}"></div>
    <p class="sub">Print this on the counter sticker. Visitors who scan it are counted for this dealer, and the code is filled in on their order form.</p>
    <label class="fl" for="qrLink">Link<input id="qrLink" class="mono" readonly value="${esc(url)}"></label>
    <div class="actions"><button class="btn primary" data-act="dealer:copylink" data-url="${esc(url)}">${ICON.copy}Copy link</button></div>`);
  if (window.QRCode) new window.QRCode($("#qrBox"), { text: url, width: 200, height: 200, colorDark: "#0B2A4A", colorLight: "#FFFFFF" });
});
on.act("dealer:copylink", (t) => copyText(t.dataset.url, "Link copied"));
