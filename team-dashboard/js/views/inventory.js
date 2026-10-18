/* Inventory: devices in stock, the packages sold (made of devices), and every stock movement.
   Issuing an invoice takes stock automatically; cancelling one puts it back. */

import { esc, cap, fmtN, money, when, toast, drawer, closeDrawer, on, busy, pill, field, select, emptyRow, kpi, ICON } from "../ui.js";
import { S, can, saveItem, moveStock, saveProduct, addVenGuardDefaults } from "../store.js";

const REASONS = [["purchase", "Received from supplier (+)"], ["return", "Returned by a customer (+)"], ["adjust_up", "Count correction (+)"],
  ["sale", "Sold without an invoice (−)"], ["damaged", "Damaged or faulty (−)"], ["sample", "Demo or sample (−)"], ["adjust_down", "Count correction (−)"]];
const REASON = Object.fromEntries(REASONS.map(([k, v]) => [k, v.replace(/ \(.\)$/, "")]));
Object.assign(REASON, { "invoice change": "Invoice changed", "invoice cancelled": "Invoice cancelled" });
const low = (i) => (Number(i.stock) || 0) <= (Number(i.low_at) || 0);

export default {
  id: "inventory", label: "Inventory", icon: "inventory", deps: ["inventory", "products", "stockMoves"],
  badge: () => S.data.inventory.filter(low).length,
  render() {
    const items = S.data.inventory, prods = S.data.products, moves = S.data.stockMoves.slice(0, 60);
    const name = Object.fromEntries(items.map((i) => [i.id, i.name]));
    const value = items.reduce((s, i) => s + (Number(i.stock) || 0) * (Number(i.unit_cost) || 0), 0);
    const kits = prods.filter((p) => p.active !== false && p.components && Object.keys(p.components).length).map((p) => {
      const n = Math.min(...Object.entries(p.components).map(([sku, q]) => Math.floor((Number((items.find((i) => i.id === sku) || {}).stock) || 0) / q)));
      return [p.name, Math.max(0, isFinite(n) ? n : 0)];
    });
    return `<div class="topline"><div><h1>Inventory</h1><div class="sub">Stock goes down when an invoice is issued and back up if it is cancelled.</div></div>
      <div class="actions">${can("stock") && items.length ? `<button class="btn primary" data-act="stock:move">${ICON.inventory}Stock in / out</button>` : ""}
      ${can("items") ? `<button class="btn" data-act="item:new">${ICON.plus}Add item</button><button class="btn" data-act="prod:new">${ICON.plus}Add package</button>` : ""}</div></div>
      ${!items.length ? `<div class="banner">${ICON.info}<div>No items yet.${can("items") ? ` <button class="btn" data-act="stock:defaults" style="margin-left:6px">Add the VenGuard detector, valve, relay and packages</button> <span class="sub">(at the website prices: kit BDT 3,500, detector + relay BDT 1,900, valve BDT 1,700)</span>` : " A founder adds them."}</div></div>` : ""}
      <div class="kpis">${kpi("Units in stock", fmtN(items.reduce((s, i) => s + (Number(i.stock) || 0), 0)), fmtN(items.length) + " items", true)}
        ${kpi("Running low", fmtN(items.filter(low).length), "at or below their warning level")}
        ${kits.map(([n, k]) => kpi(cap(n.replace(/^VenGuard /, "")), fmtN(k), "can be packed now")).join("")}
        ${value ? kpi("Stock value", money(value), "at unit cost") : ""}</div>
      <div class="grid2"><section class="panel"><h2>Items</h2><div class="table-wrap flat"><table><thead><tr><th>Code</th><th>Item</th><th>In stock</th><th>Warn at</th><th>Unit cost</th><th></th></tr></thead><tbody>
        ${items.length ? items.map((i) => `<tr${can("items") ? ` data-act="item:edit" data-id="${esc(i.id)}" tabindex="0"` : ' class="no-hover"'}><td class="mono">${esc(i.id)}</td><td class="name">${esc(i.name)}</td>
          <td class="num"><strong>${fmtN(i.stock)}</strong></td><td class="num">${fmtN(i.low_at)}</td><td class="num">${i.unit_cost ? money(i.unit_cost) : "—"}</td>
          <td>${low(i) ? pill("due", "Running low") : pill("issued", "OK")}</td></tr>`).join("") : emptyRow(6, "No items.")}</tbody></table></div></section>
      <section class="panel"><h2>Packages</h2><div class="table-wrap flat"><table><thead><tr><th>Package</th><th>Price</th><th>Made of</th></tr></thead><tbody>
        ${prods.length ? prods.map((p) => `<tr${can("items") ? ` data-act="prod:edit" data-id="${esc(p.id)}" tabindex="0"` : ' class="no-hover"'}><td class="name">${esc(p.name)}${p.active === false ? ' <span class="type">(hidden)</span>' : ""}</td>
          <td class="num">${p.price ? money(p.price) : '<span class="muted">not set</span>'}</td>
          <td class="type">${Object.entries(p.components || {}).map(([s, q]) => `${q} × ${esc(name[s] || s)}`).join("<br>")}</td></tr>`).join("") : emptyRow(3, "No packages.")}</tbody></table></div></section></div>
      <section class="panel"><h2>Recent stock movements</h2><div class="table-wrap flat"><table><thead><tr><th>When</th><th>Item</th><th>Change</th><th>Balance</th><th>Why</th><th>By</th></tr></thead><tbody>
        ${moves.length ? moves.map((m) => `<tr class="no-hover"><td class="num">${when(m.at)}</td><td>${esc(name[m.sku] || m.sku)}</td><td class="num"><strong>${m.qty > 0 ? "+" : ""}${fmtN(m.qty)}</strong></td>
          <td class="num">${fmtN(m.balance)}</td><td>${esc(REASON[m.reason] || m.reason)}${m.ref ? ` <span class="mono type">${esc(m.ref)}</span>` : ""}${m.note ? `<br><span class="type">${esc(m.note)}</span>` : ""}</td><td class="type">${esc(m.by)}</td></tr>`).join("") : emptyRow(6, "No movements yet.")}</tbody></table></div></section>`;
  },
};

on.act("stock:defaults", async (t) => { t.disabled = true; try { await addVenGuardDefaults(); toast("Added. Set the prices in Packages."); } catch (e) { t.disabled = false; toast(e.message || String(e)); } });

on.act("stock:move", () => drawer("Stock in / out", `<form data-form="stock:move" class="stack">
  ${select("sku", "Item", S.data.inventory.map((i) => [i.id, `${i.name} (${fmtN(i.stock)} in stock)`]), "")}
  ${select("reason", "What happened", REASONS, "purchase")}
  ${field("qty", "How many", "", 'inputmode="numeric" required autofocus')}
  ${field("ref", "Reference", "", 'placeholder="Supplier bill, invoice or order number"')}
  ${field("note", "Note", "")}
  <div><button class="btn primary" type="submit">Save</button></div></form>`));
on.form("stock:move", (f, d) => busy(f, async () => {
  try { await moveStock(d); toast("Stock updated"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));

function itemForm(it) {
  const isNew = !it; it = it || {};
  drawer(isNew ? "Add item" : it.name, `<form data-form="item:save" data-new="${isNew ? 1 : ""}" class="stack"><div class="form-grid">
    ${field("sku", "Code", it.id || "", isNew ? 'class="mono" required placeholder="e.g. DET" autofocus' : 'class="mono" readonly')}${field("name", "Name", it.name, "required")}
    ${field("low_at", "Warn when stock is at or below", it.low_at ?? 10, 'inputmode="numeric"')}${field("unit_cost", "Unit cost (BDT, optional)", it.unit_cost || "", 'inputmode="numeric"')}</div>
    ${isNew ? '<p class="sub">Starts at 0. Add the stock you have with Stock in / out, so every unit has a record.</p>' : `<p class="sub">In stock: <strong>${fmtN(it.stock)}</strong>. Change it with Stock in / out.</p>`}
    <div><button class="btn primary" type="submit">Save item</button></div></form>`);
}
on.act("item:new", () => itemForm());
on.act("item:edit", (t) => itemForm(S.data.inventory.find((i) => i.id === t.dataset.id)));
on.form("item:save", (f, d) => busy(f, async () => {
  try { await saveItem(d, !!f.dataset.new); toast("Item saved"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));

function productForm(p, id) {
  p = p || { components: {} };
  drawer(id ? p.name : "Add package", `<form data-form="prod:save" data-id="${esc(id || "")}" class="stack">
    ${field("name", "Name on invoices", p.name, "required autofocus")}
    ${field("price", "Price (BDT)", p.price || "", 'inputmode="numeric" placeholder="Leave empty until the price is decided"')}
    <fieldset><legend>Made of (taken from stock when invoiced)</legend><div class="form-grid">
      ${S.data.inventory.map((i) => field("c_" + i.id, esc(i.name), (p.components || {})[i.id] || "", 'inputmode="numeric" placeholder="0"')).join("") || '<p class="sub">Add items first.</p>'}</div></fieldset>
    <label class="check"><input type="checkbox" name="active"${p.active === false ? "" : " checked"}> Offer on new invoices</label>
    <div><button class="btn primary" type="submit">Save package</button></div></form>`);
}
on.act("prod:new", () => productForm());
on.act("prod:edit", (t) => productForm(S.data.products.find((p) => p.id === t.dataset.id), t.dataset.id));
on.form("prod:save", (f, d) => busy(f, async () => {
  const components = {};
  for (const [k, v] of Object.entries(d)) if (k.startsWith("c_")) components[k.slice(2)] = v;
  try { await saveProduct(f.dataset.id, { name: d.name, price: d.price, components, active: d.active }); toast("Package saved"); closeDrawer(); }
  catch (e) { toast(e.message || String(e)); }
}));
