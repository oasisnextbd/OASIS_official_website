/* Emulators: test devices for the founders. Each behaves like a real VenGuard (detector, valve, relay)
   through the same device database and rules, so the app on a founder's phone cannot tell the
   difference. Only founders see this section; each founder sees the emulator assigned to them, the
   company account sees and assigns all. An emulator runs while this page is open (js/emulator.js). */

import { esc, toast, drawer, closeDrawer, on, busy, select, opts, copyText, ICON } from "../ui.js";
import { S, can, createEmulator, finishEmulator, assignEmulator, removeEmulator } from "../store.js";
import { startEmulator, stopEmulator, act, runOf, onEmulatorChange, runningCount } from "../emulator.js";
import { THRESHOLD, canReset } from "../emusim.js";

const KIT = { complete: "Complete kit", detector_relay: "Detector + Relay" };
const founders = () => {
  const owner = String(S.cfg.owner).toLowerCase();
  const rows = S.data.team.filter((t) => t.active === true && t.role === "founder").map((t) => [t.id, t.name ? `${t.name} (${t.id})` : t.id]);
  if (!rows.some(([id]) => id === owner)) rows.unshift([owner, `Company account (${owner})`]);
  return rows;
};

export default {
  id: "emulators", label: "Emulators", icon: "emulators", deps: ["emulators", "team"],
  visible: () => can("emulators"),
  badge: () => runningCount(),
  render() {
    if (S.db.kind === "demo") return `<div class="topline"><div><h1>Emulators</h1></div></div>
      <div class="banner">${ICON.info}<div>Emulators talk to the real device database, so they work only in the real dashboard, not with made-up data.</div></div>`;
    const manage = can("emulators:manage");
    const list = S.data.emulators.slice().sort((a, b) => a.id.localeCompare(b.id));
    return `<div class="topline"><div><h1>Emulators</h1>
        <div class="sub">Test devices for the founders. Each acts exactly like a real VenGuard detector, valve and relay, through the same database and rules, so you can test the app as a customer. It runs while this page is open; close the page and the app shows it offline within 3 minutes.</div></div>
      <div class="actions">${manage ? `<button class="btn primary" data-act="emu:new">${ICON.plus}Create emulator</button>` : ""}</div></div>
      ${!list.length ? `<div class="banner">${ICON.info}<div>${manage ? "No emulators yet. Create one for each founder (four in all), then assign each to its founder." : "No emulator is assigned to you yet. Ask the company account to assign one."}</div></div>` : ""}
      <div class="emu-grid">${list.map((e) => card(e, manage)).join("")}</div>`;
  },
  mounted() { S.data.emulators.forEach((e) => paint(e.id)); },
};

function card(e, manage) {
  const mine = e.assigned_to === S.me.email;
  const who = founders().find(([id]) => id === e.assigned_to);
  return `<section class="panel emu" data-emu="${esc(e.id)}" data-ready="${e.ready === false ? "no" : "yes"}">
    <div class="panel-head"><h2><span class="mono">${esc(e.id)}</span> <span class="type">${esc(KIT[e.kit] || e.kit)}</span></h2><span data-f="conn"></span></div>
    ${e.ready === false ? `<div class="banner error">${ICON.info}<div>Setup did not finish: the device database refused it. Publish the latest <span class="mono">database.rules.json</span> (Firebase console → Realtime Database → Rules), then ${manage ? `<button class="btn" data-act="emu:finish" data-id="${esc(e.id)}">Finish setup</button>` : "ask the company account to finish setup"}.</div></div>` : ""}
    <p class="sub">${mine || !manage ? "Your test device." : `Assigned to ${who ? esc(who[1]) : "nobody yet"}.`} In the VenGuard app: <strong>+</strong> → Device ID <span class="mono">${esc(e.id)}</span>, sticker code <span class="mono">${esc(e.code)}</span>
      <button class="btn" data-act="emu:copy" data-id="${esc(e.id)}">${ICON.copy}Copy</button></p>
    ${manage ? `<div class="emu-assign"><label class="fl" for="as_${esc(e.id)}">Assigned to<select id="as_${esc(e.id)}" data-change="emu:assign" data-id="${esc(e.id)}">${opts([["", "Nobody"], ...founders()], e.assigned_to || "")}</select></label></div>` : ""}
    <div class="emu-read">
      <div><span>Gas</span><strong data-f="gas">—</strong></div><div><span>Valve</span><strong data-f="valve">—</strong></div>
      <div><span>Fan</span><strong data-f="fan">—</strong></div><div><span>Alarm</span><strong data-f="alarm">—</strong></div>
      <div><span>Battery</span><strong data-f="battery">—</strong></div></div>
    <div class="emu-actions">
      <button class="btn primary" data-act="emu:power" data-id="${esc(e.id)}" data-f="power"${e.ready === false ? " disabled" : ""}>Start</button>
      <button class="btn" data-act="emu:do" data-do="leak" data-id="${esc(e.id)}" data-need="run">Start a leak</button>
      ${e.kit === "detector_relay" ? `<button class="btn" data-act="emu:do" data-do="regulator" data-id="${esc(e.id)}" data-need="run">Turn the regulator off</button>` : `<button class="btn" data-act="emu:do" data-do="reset" data-id="${esc(e.id)}" data-need="reset">Lift the reset lever</button>`}
      <button class="btn" data-act="emu:do" data-do="battery" data-id="${esc(e.id)}" data-need="run" data-f="battery-btn">Low battery</button>
      <button class="btn" data-act="emu:do" data-do="test" data-id="${esc(e.id)}" data-need="run">Test button</button>
      <button class="btn" data-act="emu:do" data-do="offline" data-id="${esc(e.id)}" data-need="run" data-f="offline-btn">Go offline</button>
      ${manage ? `<button class="btn" data-act="emu:remove" data-id="${esc(e.id)}">${ICON.trash}Remove</button>` : ""}
    </div>
    <ol class="emu-log" data-f="log"><li class="muted">Not running.</li></ol></section>`;
}

/** Updates one card in place every second (no full redraw while it runs). */
function paint(id) {
  const el = document.querySelector(`.emu[data-emu="${CSS.escape(id)}"]`);
  if (!el) return;
  const run = runOf(id), d = run && run.device, on_ = run && run.status === "running";
  const f = (k) => el.querySelector(`[data-f="${k}"]`);
  const state = !run ? "off" : run.status !== "running" ? "wait" : !run.online ? "off" : d.alarm ? "danger" : d.gas >= THRESHOLD || d.valve === "closed" || d.battery < 20 ? "caution" : "safe";
  const word = !run ? "Stopped" : run.status !== "running" ? "Connecting…" : !run.online ? "Offline" : d.alarm ? "Gas leak" : d.gas >= THRESHOLD ? "Checking" : d.valve === "closed" ? "Gas off" : d.battery < 20 ? "Battery low" : "Safe";
  f("conn").innerHTML = `<span class="emu-state emu-state--${state}">${esc(word)}</span>`;
  f("gas").textContent = d ? `${Math.round(d.gas)} % LEL` : "—";
  f("valve").textContent = d ? (d.valve === "none" ? "Not fitted" : d.valve === "open" ? "Open" : "Closed") : "—";
  f("fan").textContent = d ? (d.fan ? "On" : "Off") : "—";
  f("alarm").textContent = d ? (d.alarm ? "Leak" : d.confirm > 0 ? `Checking ${d.confirm} s` : "No") : "—";
  f("battery").textContent = d ? `${d.battery} %` : "—";
  const power = f("power");
  if (power) { power.textContent = run ? "Stop" : "Start"; power.classList.toggle("primary", !run); power.disabled = el.dataset.ready === "no" || (!!run && run.status !== "running"); }
  el.querySelectorAll("[data-need]").forEach((b) => { b.disabled = !on_ || (b.dataset.need === "reset" && !canReset(d)) || (b.dataset.do !== "offline" && run && !run.online); });
  const bb = f("battery-btn"); if (bb && d) bb.textContent = d.battery < 20 ? "New battery" : "Low battery";
  const ob = f("offline-btn"); if (ob && run) ob.textContent = run.online ? "Go offline" : "Come back online";
  f("log").innerHTML = run && run.log.length ? run.log.map((l) => `<li><span class="muted num">${l.at.toLocaleTimeString()}</span> ${esc(l.msg)}</li>`).join("") : '<li class="muted">Not running.</li>';
}
onEmulatorChange((id) => {
  paint(id);
  const count = document.querySelector('#nav [data-view="emulators"] .count');
  const n = runningCount();
  if (count) count.textContent = n; else if (n) { const b = document.querySelector('#nav [data-view="emulators"]'); if (b) b.insertAdjacentHTML("beforeend", `<span class="count num">${n}</span>`); }
  if (!n && count) count.remove();
});

const find = (id) => S.data.emulators.find((e) => e.id === id);
on.act("emu:power", async (t) => {
  const e = find(t.dataset.id);
  if (!e) return;
  t.disabled = true;
  try { if (runOf(e.id)) await stopEmulator(e.id); else await startEmulator(S.db, e); }
  catch (err) { toast(err.message || String(err)); }
  finally { paint(e.id); }
});
on.act("emu:do", (t) => act(t.dataset.id, t.dataset.do).catch((err) => toast(err.message || String(err))));
on.act("emu:copy", (t) => { const e = find(t.dataset.id); if (e) copyText(`Device ID: ${e.id}\nSticker code: ${e.code}`, "Device ID and sticker code copied"); });
on.input("emu:assign", (t) => assignEmulator(t.dataset.id, t.value).then(() => toast(t.value ? "Assigned" : "Unassigned")).catch((err) => toast(err.message || String(err))));
on.act("emu:finish", async (t) => { t.disabled = true; try { await finishEmulator(t.dataset.id); toast("Setup finished"); } catch (err) { t.disabled = false; toast(err.message || String(err)); } });
on.act("emu:remove", async (t) => {
  const e = find(t.dataset.id);
  if (!e || !confirm(`Remove ${e.id}? Its sign-in and sticker code stop working; apps that added it will show it offline.`)) return;
  t.disabled = true;
  try { await stopEmulator(e.id); await removeEmulator(e.id); toast("Removed"); } catch (err) { t.disabled = false; toast(err.message || String(err)); }
});
on.act("emu:new", () => {
  drawer("Create emulator", `<form data-form="emu:new" class="stack">
    ${select("kit", "Kit", Object.entries(KIT), "complete")}
    <p class="sub">Creates a test device (VG-EMU01, VG-EMU02, …) with its own sign-in and sticker code. Then assign it to a founder; only they and the company account can see and run it.</p>
    <div><button class="btn primary" type="submit">Create</button></div></form>`);
});
on.form("emu:new", (f, d) => busy(f, async () => {
  try { const id = await createEmulator(d.kit); toast(`${id} created`); closeDrawer(); } catch (err) { toast(err.message || String(err)); }
}, "Creating…"));
