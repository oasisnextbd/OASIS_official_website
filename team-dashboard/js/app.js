/* Start-up, sign-in, navigation and re-drawing. Each section of the dashboard is a module in
   js/views/ that exports { id, label, icon, deps, render, badge?, visible? }; add one to VIEWS to add a section. */

import { $, esc, toast, on, closeDrawer, ICON } from "./ui.js";
import { S, whoAmI, start, stop, ROLES } from "./store.js";
import { R } from "./redraw.js";
import overview from "./views/overview.js";
import orders from "./views/orders.js";
import invoices from "./views/invoices.js";
import inventory from "./views/inventory.js";
import promos from "./views/promos.js";
import marketing from "./views/marketing.js";
import dealers from "./views/dealers.js";
import subscriptions from "./views/subscriptions.js";
import settings from "./views/settings.js";
import emulators from "./views/emulators.js";
import { stopAllEmulators } from "./emulator.js";

const VIEWS = [overview, orders, invoices, inventory, promos, marketing, dealers, subscriptions, emulators, settings];
const cfg = window.VG_DASH || {};
const local = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname);
const DEMO = !cfg.firebase || (local && new URLSearchParams(location.search).has("demo"));
let view = VIEWS[0];

/* ---------- start ---------- */
(async function boot() {
  S.cfg = { owner: "oasisnextbd@gmail.com", ...cfg };
  try {
    S.db = DEMO ? (await import("./db-demo.js")).connect() : await (await import("./db-firebase.js")).connect(cfg);
  } catch (e) {
    return signInScreen("Google sign-in didn't load. Check the internet connection, then reload the page.");
  }
  if (cfg.emulators && S.db.auth.testSignIn) window.__vgTestSignIn = S.db.auth.testSignIn;
  S.db.auth.onChange(async (u) => {
    stop(); closeDrawer(); seenOrders = null;
    if (!u) { stopAllEmulators(); return signInScreen(); }
    S.user = u;
    $("#main").innerHTML = '<p class="sub">Loading…</p>';
    try { S.me = await whoAmI(u); }
    catch (e) {
      if (DEMO || !e.code) return noAccess(e.message || String(e));
      const { explain } = await import("./db-firebase.js");
      return noAccess(e.code === "permission-denied" && u.email === S.cfg.owner
        ? "The database rules are not published yet: Firebase console → Firestore Database → Rules (see team-dashboard/README.md)."
        : explain(e));
    }
    $("#app").classList.remove("signed-out");
    renderMe(); pickView(); renderNav(); draw();
    start((col) => schedule(col), (err) => dbError(err));
  });
})();

/* ---------- signed out ---------- */
function signInScreen(msg) {
  S.me = null;
  $("#app").classList.add("signed-out"); $("#signOutBtn").hidden = true; $("#nav").innerHTML = ""; $("#me").innerHTML = "";
  $("#main").innerHTML = `<section class="signin"><h1>Team sign-in</h1>
    <p class="sub">Sign in with the Google account that was added to the VenGuard team. If this browser has several Google accounts, you choose which one to use.</p>
    ${msg ? `<div class="banner error">${ICON.info}<div>${esc(msg)}</div></div>` : ""}
    <button class="btn primary" type="button" data-act="signin">Sign in with Google</button>
    ${DEMO ? '<p class="sub" style="margin-top:14px">Demo mode: made-up data, nothing is saved.</p>' : ""}</section>`;
}
function noAccess(msg) {
  $("#app").classList.add("signed-out"); $("#signOutBtn").hidden = false;
  $("#main").innerHTML = `<section class="signin"><h1>No access</h1><div class="banner error">${ICON.info}<div>${esc(msg)}</div></div>
    <button class="btn" type="button" data-act="signout">Use another account</button></section>`;
}
function dbError(err) {
  // Live updates stop with "permission-denied" when the company account removes this person.
  if (err && err.code === "permission-denied" && S.me) { stop(); return noAccess("You no longer have access to the VenGuard dashboard. Ask " + S.cfg.owner + " if this is a mistake."); }
  import("./db-firebase.js").then(({ explain }) => toast(explain(err))).catch(() => toast(String(err)));
}
on.act("signin", () => S.db.auth.signIn().catch((e) => {
  const c = (e && e.code) || "";
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return;
  signInScreen(c === "auth/popup-blocked" ? "The browser blocked the sign-in window. Allow pop-ups for this page, then try again." : `Sign-in didn't work (${c || e}). Please try again.`);
}));
on.act("signout", async () => { stop(); await stopAllEmulators(); await S.db.auth.signOut(); if (!DEMO) location.reload(); });

/* ---------- navigation ---------- */
function visibleViews() { return VIEWS.filter((v) => !v.visible || v.visible()); }
function pickView() {
  const want = location.hash.slice(1) || (() => { try { return localStorage.getItem("vg_dash_view"); } catch (e) { return ""; } })();
  view = visibleViews().find((v) => v.id === want) || VIEWS[0];
}
function renderNav() {
  $("#nav").innerHTML = visibleViews().map((v) => {
    const b = v.badge ? v.badge() : 0;
    return `<button type="button" data-act="nav" data-view="${v.id}" aria-current="${v === view ? "page" : "false"}">${ICON[v.icon]}<span class="lbl">${esc(v.label)}</span>${b ? `<span class="count num">${b}</span>` : ""}</button>`;
  }).join("");
}
on.act("nav", (t) => go(t.dataset.view));
function go(id, keepScroll) {
  view = visibleViews().find((v) => v.id === id) || VIEWS[0];
  try { localStorage.setItem("vg_dash_view", view.id); } catch (e) {}
  history.replaceState(null, "", "#" + view.id);
  renderNav(); draw();
  if (!keepScroll) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (S.me && location.hash.slice(1) !== view.id) go(location.hash.slice(1)); });

function renderMe() {
  const u = S.me;
  $("#me").innerHTML = `<strong>${esc(u.name || u.email)}</strong>${u.name ? `<span class="muted">${esc(u.email)}</span><br>` : ""}<span class="role">${esc(u.owner ? "Owner" : ROLES[u.role] || u.role)}</span>`;
  $("#signOutBtn").hidden = false;
}

/* ---------- drawing ---------- */
let pending = new Set(), frame = 0;
function schedule(col) {
  pending.add(col);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const cols = pending; pending = new Set();
    if (cols.has("team") && S.me) {
      const row = S.data.team.find((t) => t.id === S.me.email);
      if (!S.me.owner && (!row || row.active !== true)) { stop(); return noAccess("You were removed from the VenGuard team list."); }
      if (row && !S.me.owner && row.role !== S.me.role) { S.me.role = row.role; renderMe(); }
    }
    if (cols.has("orders")) announceNewOrders();
    renderNav();
    if (!view.deps || view.deps.some((d) => cols.has(d))) draw();
  });
}
/* A website order that arrives while the dashboard is open: a message, and the count in the tab title. */
let seenOrders = null;
function announceNewOrders() {
  const ids = new Set(S.data.orders.map((o) => o.id));
  if (seenOrders) {
    const fresh = S.data.orders.filter((o) => !seenOrders.has(o.id) && o.source === "website");
    if (fresh.length) toast(fresh.length === 1 ? `New order from the website: ${fresh[0].name}` : `${fresh.length} new orders from the website`);
  }
  seenOrders = ids;
  const n = S.data.orders.filter((o) => o.status === "new" || o.status === "payment_pending").length;
  document.title = (n ? `(${n}) ` : "") + "VenGuard Dashboard";
}
function draw() {
  if (!S.me) return;
  // Keep the cursor where it was if a live update redraws the field being typed in.
  const a = document.activeElement, id = a && a.id && $("#main").contains(a) ? a.id : "";
  const pos = id && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
  const demo = DEMO ? `<div class="banner">${ICON.info}<div><strong>Demo data.</strong> Made-up orders and numbers for trying the dashboard; nothing is saved.</div></div>` : "";
  $("#main").innerHTML = demo + view.render();
  if (id) { const n = document.getElementById(id); if (n) { n.focus(); try { if (pos) n.setSelectionRange(pos[0], pos[1]); } catch (e) {} } }
  view.mounted && view.mounted();
}

/* ---------- Day / Night switch (saved per browser, like the website) ---------- */
(function themeSwitch() {
  const btn = $("#themeBtn"), root = document.documentElement;
  const isDark = () => { const t = root.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const sync = () => { const d = isDark(); btn.setAttribute("aria-pressed", String(d)); btn.lastChild.textContent = d ? "Day theme" : "Night theme"; };
  btn.addEventListener("click", () => { const next = isDark() ? "light" : "dark"; root.setAttribute("data-theme", next); try { localStorage.setItem("vg_dash_theme", next); } catch (e) {} sync(); });
  sync();
})();

on.act("close", () => closeDrawer());
R.draw = draw;
R.go = go;
