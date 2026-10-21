/* Profile: who you are on the dashboard (name, email, role, access end date), what your role may do,
   your work this month, the theme, and Sign out. Opened from the profile button at the bottom of the
   menu (top right on phones). The company account can also open anyone's profile from Tasks → People. */

import { esc, fmtN, ago, toast, drawer, on, busy, field, ICON } from "../ui.js";
import { S, ROLES, ROLE_INFO, saveMyName } from "../store.js";
import { taskState, presenceOf, dhakaToday } from "../calc.js";
import { R } from "../redraw.js";

/** Up to two letters for the round badge: "Mohammad Omayer Ahamed" → "MA". */
export function initials(name, email) {
  const w = String(name || "").trim().split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[w.length - 1][0]).toUpperCase();
  return (w[0] || String(email || "?")).slice(0, 2).toUpperCase();
}
const roleName = (m) => (m.owner ? "Company account" : ROLES[m.role] || m.role);

/** Day / Night / Automatic (the device setting); saved in this browser, applied before paint in index.html. */
export function themePref() { try { return localStorage.getItem("vg_dash_theme") || "auto"; } catch (e) { return "auto"; } }
export function setTheme(v) {
  const root = document.documentElement;
  if (v === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", v);
  try { if (v === "auto") localStorage.removeItem("vg_dash_theme"); else localStorage.setItem("vg_dash_theme", v); } catch (e) {}
}

function workStats(email) {
  const t0 = dhakaToday(), month = t0.slice(0, 7), mine = S.data.tasks.filter((t) => t.assignee === email);
  return {
    toDo: mine.filter((t) => ["open", "returned"].includes(taskState(t, t0))).length,
    overdue: mine.filter((t) => taskState(t, t0) === "overdue").length,
    waiting: mine.filter((t) => t.status === "submitted").length,
    approved: mine.filter((t) => t.status === "approved" && String(t.reviewed_at || "").slice(0, 7) === month).length,
  };
}
const stat = (label, n) => `<div class="pstat"><strong class="num">${fmtN(n)}</strong><span>${esc(label)}</span></div>`;

export default {
  guest: true, nav: false, id: "profile", label: "Profile", icon: "user", deps: ["tasks", "team"],
  render() {
    const me = S.me, pref = themePref(), w = workStats(me.email);
    const seg = [["light", "Day"], ["dark", "Night"], ["auto", "Automatic"]].map(([v, l]) => `<button type="button" data-act="profile:theme" data-v="${v}" aria-pressed="${pref === v}">${l}</button>`).join("");
    return `<div class="topline"><div><h1>Profile</h1><div class="sub">Your account on the VenGuard team dashboard.</div></div></div>
      <div class="profile-grid">
        <section class="panel profile-card">
          <span class="avatar avatar--lg" aria-hidden="true">${esc(initials(me.name, me.email))}</span>
          <div><h2>${esc(me.name || me.email)}</h2><p class="type">${esc(me.email)}</p>
            <p><span class="pill">${esc(roleName(me))}</span>${me.until ? ` <span class="type">access until ${esc(me.until)}</span>` : ""}</p></div>
          <button class="btn sm" data-act="profile:name">${ICON.pen}Change my name</button>
        </section>
        <section class="panel"><h2>What you can do</h2><p>${esc(ROLE_INFO[me.owner ? "owner" : me.role] || "")}</p>
          <p class="sub">Your role is set by the company account (${esc(S.cfg.owner)}).</p></section>
        ${me.owner ? `<section class="panel"><h2>Your team</h2><p>${fmtN(S.data.tasks.filter((t) => t.status === "submitted").length)} task(s) waiting for your review.</p>
            <button class="linkish" data-act="nav" data-view="tasks">Open Tasks</button></section>`
          : `<section class="panel"><h2>Your work this month</h2><div class="pstats">${stat("to do", w.toDo)}${stat("overdue", w.overdue)}${stat("waiting for review", w.waiting)}${stat("approved", w.approved)}</div>
            <button class="linkish" data-act="nav" data-view="tasks">Open My work</button></section>`}
        <section class="panel"><h2>Appearance</h2><div class="seg" role="group" aria-label="Theme">${seg}</div>
          <p class="sub">Saved in this browser. Automatic follows your device's day or night setting.</p></section>
        <section class="panel"><h2>Privacy</h2><p class="sub">${me.owner ? "You see whether each person's dashboard is open (Tasks → People). They are told so on their profile." : "The company account can see whether your dashboard is open (“Online now” or when you were last seen). Nothing else about what you do here is recorded, except the changes you save, which go in the activity log."}</p></section>
        <section class="panel"><h2>Sign out</h2><p class="sub">On a shared computer, always sign out: it also clears the data this browser kept.</p>
          <button class="btn" data-act="signout">${ICON.signout}Sign out</button></section>
      </div>`;
  },
};

on.act("profile:theme", (t) => { setTheme(t.dataset.v); R.draw(); });
on.act("profile:name", () => drawer("Change my name", `<form data-form="profile:name" class="stack">
  ${field("name", "Your name, as the team sees it", S.me.name || "", 'required maxlength="80" autofocus')}
  <div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`));
on.form("profile:name", (f, d) => busy(f, async () => {
  try { await saveMyName(d.name); toast("Name saved"); R.renderMe && R.renderMe(); document.querySelector("#drawerRoot").innerHTML = ""; R.draw(); }
  catch (e) { toast(e.message || String(e)); }
}));

/** The company account: someone's profile from Tasks → People. */
export function personDrawer(email) {
  const m = S.data.team.find((x) => x.id === email);
  if (!m) return;
  const p = presenceOf(S.data.presence.find((x) => x.id === email)), w = workStats(email);
  drawer(m.name || m.id, `<div class="stack">
    <div class="profile-card"><span class="avatar avatar--lg" aria-hidden="true">${esc(initials(m.name, m.id))}</span>
      <div><p class="type">${esc(m.id)}</p><p><span class="pill">${esc(ROLES[m.role] || m.role)}</span>${m.until ? ` <span class="type">access until ${esc(m.until)}</span>` : ""}</p>
      <p>${p.online ? '<span class="online-dot">Online now</span>' : `<span class="type">${p.seen ? "Last seen " + esc(ago(new Date(p.seen).toISOString())) : "Not seen yet"}</span>`}</p></div></div>
    <p>${esc(ROLE_INFO[m.role] || "")}</p>
    <h3>Work this month</h3><div class="pstats">${stat("to do", w.toDo)}${stat("overdue", w.overdue)}${stat("waiting for review", w.waiting)}${stat("approved", w.approved)}</div>
    <p class="sub">Change the role or end date in Settings & team.</p></div>`, { kicker: "Profile" });
}
on.act("person:open", (t) => personDrawer(t.dataset.id));
