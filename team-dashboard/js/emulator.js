/* Runs emulators in this browser tab. Each one signs in as its device (its own session, in memory) and
   talks to the device database exactly like real firmware does (backend/connected-firebase/DEVICE_API.md,
   "Free plan (Spark) edition"): state when something changes, a heartbeat every 20 s, events, and
   "close" commands from the app (act, acknowledge once, clear). An emulator runs while this tab is open.
   Offline in the app: Stop or closing the tab removes the heartbeat, so it shows within seconds;
   "Go offline" acts like a power cut or lost Wi-Fi (no goodbye), so it shows within about a minute. */

import { newDevice, step, startLeak, remoteClose, regulatorOff, manualReset, stateOf, stateChanged, BATTERY_LOW } from "./emusim.js";

/** Heartbeat period; the app counts a device offline after 65 s without one (three missed beats). */
const HEARTBEAT_MS = 20000;
const running = new Map();
const listeners = new Set();
export const onEmulatorChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (id) => listeners.forEach((fn) => { try { fn(id); } catch (e) { /* a closed view */ } });

/** What the view shows for a running emulator, or null. */
export const runOf = (id) => running.get(id) || null;
export const runningCount = () => running.size;

function note(run, msg) {
  run.log.unshift({ at: new Date(), msg });
  run.log.length = Math.min(run.log.length, 40);
}

export async function startEmulator(db, emu) {
  if (running.has(emu.id)) return;
  const run = { id: emu.id, device: newDevice(emu.id, emu.kit === "detector_relay" ? "detector_relay" : "complete"), online: true, log: [], last: null, timers: [], stops: [], session: null, status: "connecting" };
  running.set(emu.id, run);
  emit(emu.id);
  try {
    run.session = await db.deviceSession(emu.email, emu.password);
  } catch (e) {
    running.delete(emu.id);
    emit(emu.id);
    throw new Error(`Could not sign in as ${emu.id}: ${(e && e.code) || e}`);
  }
  const s = run.session, id = emu.id;
  const fail = (what) => (e) => { note(run, `${what}: ${(e && e.code) || e}`); emit(id); };
  run.stops.push(s.onValue(`devices/${id}/meta`, (m) => {
    const kit = m && m.kit === "detector_relay" ? "detector_relay" : "complete";
    const d = run.device;
    run.device = { ...d, kit, valve: kit === "detector_relay" ? "none" : d.valve === "none" ? "open" : d.valve };
    emit(id);
  }, fail("cannot read the kit")));
  run.stops.push(s.onChildAdded(`devices/${id}/cmd`, (cid, c) => { handleCommand(run, cid, c).catch(fail("command")); }, fail("cannot read commands")));
  try {
    await sendState(run, true);
    await heartbeat(run);
    await s.removeOnDisconnect(`hb/${id}`);
  } catch (e) {
    await stopEmulator(id);
    throw new Error(`${id} signed in but may not write its data (${(e && e.code) || e}). Check that the device database rules are published.`);
  }
  run.timers.push(setInterval(() => tick(run).catch(fail("update")), 1000), setInterval(() => heartbeat(run).catch(fail("heartbeat")), HEARTBEAT_MS));
  run.status = "running";
  note(run, "Connected. It now behaves like a real device.");
  emit(id);
}

export async function stopEmulator(id) {
  const run = running.get(id);
  if (!run) return;
  run.timers.forEach(clearInterval);
  run.stops.forEach((u) => { try { u(); } catch (e) { /* already off */ } });
  running.delete(id);
  emit(id);
  if (!run.session) return;
  // A planned stop says goodbye: without a heartbeat the app shows the device offline straight away.
  try { await run.session.remove(`hb/${id}`); } catch (e) { /* the disconnect clean-up removes it */ }
  await run.session.close();
}

export async function stopAllEmulators() {
  await Promise.all([...running.keys()].map(stopEmulator));
}

async function tick(run) {
  if (!run.online) return;
  const r = step(run.device, Math.random);
  run.device = r.device;
  await report(run, r.events);
  await sendState(run, false);
  emit(run.id);
}

async function report(run, events) {
  for (const type of events) {
    await run.session.push(`devices/${run.id}/events`, { type, at: run.session.serverTime() });
    note(run, `Event: ${type.replace(/_/g, " ")}`);
  }
}

async function sendState(run, force) {
  const st = stateOf(run.device);
  if (!force && !stateChanged(run.last, st)) return;
  run.last = st;
  await run.session.set(`devices/${run.id}/state`, st);
}

async function heartbeat(run) {
  if (run.online) await run.session.set(`hb/${run.id}`, run.session.serverTime());
}

/** Close commands from the app: act, acknowledge once, then clear (the rules allow nothing else). */
async function handleCommand(run, cid, c) {
  const id = run.id, s = run.session;
  if (!run.online) return;
  if (!c || c.type !== "close" || !c.exp || c.exp < Date.now()) {
    note(run, "Ignored an expired or unknown command");
  } else if (run.device.valve !== "open") {
    await s.set(`devices/${id}/ack/${cid}`, { result: run.device.valve === "none" ? "failed" : "already_closed" });
    note(run, run.device.valve === "none" ? "Close request: this kit has no valve" : "Close request: already closed");
  } else {
    const r = remoteClose(run.device);
    run.device = r.device;
    await sendState(run, true);
    await report(run, r.events);
    await s.set(`devices/${id}/ack/${cid}`, { result: "closed" });
    note(run, "Close request from the app: valve closed, confirmed");
  }
  await s.remove(`devices/${id}/cmd/${cid}`);
  emit(id);
}

/** Buttons in the Emulators section. */
export async function act(id, what) {
  const run = running.get(id);
  if (!run || run.status !== "running") return;
  const d = run.device;
  if (what === "leak") { run.device = startLeak(d); note(run, "Leak started: confirmed after 7 s above 20 %"); }
  if (what === "regulator") { run.device = regulatorOff(d); note(run, "Regulator turned off by hand"); }
  if (what === "reset") {
    const r = manualReset(d);
    if (r.events.length) { run.device = r.device; await report(run, r.events); await sendState(run, true); note(run, "Lever lifted at the stove: gas on again"); }
    else note(run, "Reset not possible yet: the valve is open, or the air is not clear");
  }
  if (what === "battery") {
    const low = d.battery >= BATTERY_LOW;
    run.device = { ...d, battery: low ? 12 : 80 };
    if (low) await report(run, ["battery_low"]);
    await sendState(run, true);
    note(run, low ? "Battery low (12 %)" : "New battery (80 %)");
  }
  if (what === "test") await report(run, ["test"]);
  if (what === "offline") {
    run.online = !run.online;
    note(run, run.online ? "Back online" : "Offline, like a power cut or lost Wi-Fi: no heartbeat or data. The app shows it offline within about a minute");
    if (run.online) { await heartbeat(run); await sendState(run, true); }
  }
  emit(id);
}
