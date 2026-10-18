/* Settings: company details printed on invoices, authorised signatures, website switches,
   the team list (only the company account changes it) and the activity log. */

import { $, esc, when, toast, drawer, closeDrawer, on, busy, field, select, area, emptyRow, pill, ICON } from "../ui.js";
import { S, can, ROLES, saveSettings, addSignatory, setSignatoryActive, saveMember } from "../store.js";

const COMPANY = [["legal_name", "Legal name (as on the trade licence)"], ["address", "Address"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"],
  ["bin", "BIN (VAT registration)"], ["trade_license", "Trade licence number"], ["vat_rate", "VAT on invoices (%; 0 if not registered)"], ["invoice_prefix", "Invoice number prefix"]];

export default {
  id: "settings", label: "Settings & team", icon: "settings", deps: ["settings", "signatories", "team", "activity"],
  render() {
    const c = S.data.settings.company || {}, w = S.data.settings.website || {}, founder = can("settings");
    const open = !(w.preorder_open === false);
    const sigs = S.data.signatories.slice().sort((a, b) => (b.active !== false) - (a.active !== false));
    return `<div class="topline"><div><h1>Settings &amp; team</h1></div></div>
      <div class="grid2"><section class="panel"><div class="panel-head"><h2>Company details on invoices</h2>${founder ? `<button class="btn" data-act="set:company">${ICON.pen}Edit</button>` : ""}</div>
        ${c.legal_name ? `<dl class="dl">${COMPANY.filter(([k]) => c[k] !== undefined && c[k] !== "").map(([k, l]) => `<dt>${esc(l.replace(/ \(.*\)$/, ""))}</dt><dd>${esc(c[k])}${k === "vat_rate" ? "%" : ""}</dd>`).join("")}</dl>`
          : `<p class="muted">Not filled in yet. Invoices can't be issued until the legal name and address are here.</p>`}
        ${c.terms ? `<p class="sub"><strong>Terms:</strong> ${esc(c.terms)}</p>` : ""}</section>
      <section class="panel"><div class="panel-head"><h2>Authorised signature</h2>${founder ? `<button class="btn" data-act="set:sig">${ICON.plus}Add signatory</button>` : ""}</div>
        <p class="sub">New invoices are signed by the person marked <strong>In use</strong>. When management changes, add the new person and put them in use; old invoices keep their signature and can be re-issued with the new one from the invoice.</p>
        ${sigs.length ? `<ul class="sigs">${sigs.map((s) => { const inUse = c.default_signatory === s.id && s.active !== false;
          return `<li><img src="${esc(s.signature)}" alt="Signature of ${esc(s.name)}"><div><strong>${esc(s.name)}</strong><br><span class="type">${esc(s.title || "")}</span><br>
            ${inUse ? pill("active", "In use") : s.active === false ? pill("off", "Retired") : ""}</div>
            ${founder ? `<div class="actions">${!inUse && s.active !== false ? `<button class="btn" data-act="set:sigdefault" data-id="${esc(s.id)}">Use for new invoices</button>` : ""}
              ${s.active !== false ? `<button class="btn" data-act="set:sigretire" data-id="${esc(s.id)}">Retire</button>` : `<button class="btn" data-act="set:sigback" data-id="${esc(s.id)}">Bring back</button>`}</div>` : ""}</li>`; }).join("")}</ul>`
          : '<p class="muted">No signature yet. Invoices print an empty signature line until one is added.</p>'}</section></div>
      <div class="grid2"><section class="panel"><div class="panel-head"><h2>Website</h2>${founder ? `<button class="btn" data-act="set:website">${ICON.pen}Edit</button>` : ""}</div>
        <dl class="dl"><dt>Pre-orders</dt><dd>${open ? "Open" : "Closed (buttons say “Get notified”)"}</dd><dt>Kit price shown</dt><dd>${w.kit_price_bdt ? "BDT " + esc(w.kit_price_bdt) : "Final price to be announced"}</dd>
          ${w.notice_en || w.notice_bn ? `<dt>Notice bar</dt><dd>${esc(w.notice_en || "")}${w.notice_bn ? `<br><span lang="bn">${esc(w.notice_bn)}</span>` : ""}</dd>` : ""}</dl>
        <p class="sub">The website reads these once its order form is connected to this database.</p></section>
      ${teamPanel()}</div>
      <section class="panel log"><h2>Activity</h2>${S.data.activity.length ? `<ul>${S.data.activity.slice(0, 120).map((a) => `<li><span class="num muted">${when(a.at)}</span><span><strong>${esc(a.user)}</strong> ${esc(String(a.action).replace(/_/g, " "))} ${a.ref ? `<span class="mono">${esc(a.ref)}</span> ` : ""}<span class="muted">${esc(a.detail)}</span></span></li>`).join("")}</ul>` : '<p class="muted">No changes yet.</p>'}</section>`;
  },
};

function teamPanel() {
  const manage = can("team"), owner = String(S.cfg.owner).toLowerCase();
  const team = S.data.team.slice().sort((a, b) => (b.id === owner) - (a.id === owner) || (b.active === true) - (a.active === true));
  return `<section class="panel"><div class="panel-head"><h2>Team</h2>${manage ? `<button class="btn" data-act="set:member">${ICON.plus}Add person</button>` : ""}</div>
    <div class="table-wrap flat"><table><thead><tr><th>Person</th><th>Role</th><th></th></tr></thead><tbody>
    ${team.length ? team.map((m) => { const isOwner = m.id === owner, gone = m.active !== true && !isOwner;
      return `<tr class="no-hover"><td class="name"><strong>${esc(m.name || m.id)}</strong><br><span class="type">${esc(m.id)}</span></td>
        <td>${isOwner ? "Owner" : esc(ROLES[m.role] || m.role)}${gone ? " (removed)" : ""}</td>
        <td>${m.id === S.me.email ? '<span class="type">You</span>' : manage && !isOwner ? (gone ? `<button class="btn" data-act="set:memberback" data-id="${esc(m.id)}">Add back</button>` : `<button class="btn" data-act="set:memberedit" data-id="${esc(m.id)}">Change</button>`) : ""}</td></tr>`; }).join("")
      : emptyRow(3, "No one yet.")}</tbody></table></div>
    <p class="sub">${manage ? "People sign in with the Google account added here. Ask everyone to switch on 2-step verification." : `Only ${esc(owner)} can add or remove team members.`}</p></section>`;
}

/* ---------- company ---------- */
on.act("set:company", () => {
  const c = S.data.settings.company || {};
  drawer("Company details", `<form data-form="set:company" class="stack"><p class="sub">Printed on every new invoice. Leave a line empty if it doesn't apply.</p><div class="form-grid">
    ${COMPANY.map(([k, l]) => field(k, l, c[k] ?? (k === "invoice_prefix" ? "INV" : k === "vat_rate" ? 0 : ""), k === "vat_rate" ? 'inputmode="decimal"' : k === "legal_name" ? "required autofocus" : k === "address" ? "required" : "")).join("")}</div>
    ${area("terms", "Terms printed at the bottom", c.terms, 'placeholder="e.g. Warranty, refund of the deposit, delivery time"')}
    <div><button class="btn primary" type="submit">Save</button></div></form>`);
});
on.form("set:company", (f, d) => busy(f, async () => {
  d.vat_rate = Math.max(0, Number(d.vat_rate) || 0);
  try { await saveSettings("company", d); toast("Company details saved"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));

/* ---------- signatures ---------- */
on.act("set:sig", () => drawer("Add signatory", `<form data-form="set:sig" class="stack">
  ${field("name", "Name", "", "required autofocus")}${field("title", "Position", "", 'placeholder="e.g. Managing Director"')}
  <label class="fl" for="sigFile">Signature image<input id="sigFile" type="file" accept="image/png,image/jpeg" required data-change="set:sigfile"><span class="hint">A photo or scan of the signature on white paper, cropped close. PNG with a transparent background looks best.</span></label>
  <div class="sig-preview" id="sigPreview" hidden><img alt="Signature preview"></div><input type="hidden" name="signature" id="sigData">
  <label class="check"><input type="checkbox" name="use" checked> Use for new invoices from now on</label>
  <div><button class="btn primary" type="submit">Save signatory</button></div></form>`));
on.input("set:sigfile", (t) => {
  const file = t.files[0]; if (!file) return;
  const img = new Image();
  img.onload = () => {
    // Shrink to at most 600 x 220 so the image stays small in the database.
    const s = Math.min(1, 600 / img.width, 220 / img.height), cv = document.createElement("canvas");
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    let url = cv.toDataURL("image/png");
    if (url.length > 280000) url = cv.toDataURL("image/jpeg", 0.85);
    $("#sigData").value = url; $("#sigPreview img").src = url; $("#sigPreview").hidden = false;
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => toast("That file is not an image.");
  img.src = URL.createObjectURL(file);
});
on.form("set:sig", (f, d) => busy(f, async () => {
  if (!d.signature) return toast("Choose the signature image.");
  try { await addSignatory(d, d.use); toast("Signatory saved"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
on.act("set:sigdefault", (t) => saveSettings("company", { default_signatory: t.dataset.id }).then(() => toast("New invoices will use this signature")).catch((e) => toast(e.message || String(e))));
on.act("set:sigretire", (t) => setSignatoryActive(t.dataset.id, false).then(() => toast("Retired")).catch((e) => toast(e.message || String(e))));
on.act("set:sigback", (t) => setSignatoryActive(t.dataset.id, true).then(() => toast("Brought back")).catch((e) => toast(e.message || String(e))));

/* ---------- website ---------- */
on.act("set:website", () => {
  const w = S.data.settings.website || {};
  drawer("Website", `<form data-form="set:website" class="stack">
    <label class="check"><input type="checkbox" name="preorder_open"${w.preorder_open === false ? "" : " checked"}> Pre-orders open <span class="sub">(when off, every Pre-order button becomes “Get notified”)</span></label>
    ${field("kit_price_bdt", "Kit price shown on the site (BDT)", w.kit_price_bdt, 'inputmode="numeric" placeholder="Leave empty for “Final price to be announced”"')}
    ${field("notice_bn", "Notice bar, Bangla", w.notice_bn, 'lang="bn"')}${field("notice_en", "Notice bar, English", w.notice_en, 'placeholder="e.g. Deliveries pause for Eid"')}
    <div><button class="btn primary" type="submit">Save</button></div></form>`);
});
on.form("set:website", (f, d) => busy(f, async () => {
  d.kit_price_bdt = String(d.kit_price_bdt || "").replace(/\D/g, "");
  try { await saveSettings("website", d); toast("Website settings saved"); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));

/* ---------- team (company account only) ---------- */
function memberForm(m) {
  m = m || {};
  drawer(m.id ? "Change " + (m.name || m.id) : "Add a person", `<form data-form="set:member" class="stack">
    ${field("email", "Google account email", m.id || "", m.id ? "readonly" : 'type="email" required autofocus placeholder="name@gmail.com"')}${field("name", "Name", m.name)}
    ${select("role", "Role", [["support", "Support: orders, invoices, stock"], ["marketing", "Marketing: promo codes and costs; views the rest"], ["founder", "Founder: everything except the team list"]], m.role || "support")}
    <div class="actions"><button class="btn primary" type="submit">${m.id ? "Save" : "Add to team"}</button>
    ${m.id ? `<button class="btn" type="button" data-act="set:memberremove" data-id="${esc(m.id)}">Remove from team</button>` : ""}</div></form>`);
}
on.act("set:member", () => memberForm());
on.act("set:memberedit", (t) => memberForm(S.data.team.find((m) => m.id === t.dataset.id)));
on.act("set:memberback", (t) => { const m = S.data.team.find((x) => x.id === t.dataset.id); saveMember({ ...m, email: m.id, active: true }).then(() => toast("Added back")).catch((e) => toast(e.message || String(e))); });
on.act("set:memberremove", (t) => {
  if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "Tap again to remove"; return; }
  const m = S.data.team.find((x) => x.id === t.dataset.id);
  saveMember({ ...m, email: m.id, active: false }).then(() => { toast("Removed " + m.id); closeDrawer(); }).catch((e) => toast(e.message || String(e)));
});
on.form("set:member", (f, d) => busy(f, async () => {
  try { await saveMember({ ...d, active: true }); toast("Saved " + d.email.toLowerCase()); closeDrawer(); } catch (e) { toast(e.message || String(e)); }
}));
