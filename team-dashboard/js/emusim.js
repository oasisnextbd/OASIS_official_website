/* Device model for the dashboard's emulators: how a VenGuard detector, valve and relay behave.
   A copy of the app's src/lib/sim.ts (venguard-app repository), which follows the website's
   "How it works": 20 % LEL for 7 s confirms a leak, the valve closes (complete kit), the relay runs the
   exhaust fan until the air is clear (below 5 %), and the valve opens again only by hand at the stove.
   Keep the two in step. Pure functions; tested in tests/emusim.test.mjs. */

export const THRESHOLD = 20;       // % LEL
export const CONFIRM_SECONDS = 7;
export const CLEAR_LEVEL = 5;      // % LEL
export const BATTERY_LOW = 20;     // %

export function newDevice(id, kit) {
  return { id, kit, gas: 2, valve: kit === "detector_relay" ? "none" : "open", fan: false, battery: 80, leaking: false, confirm: 0, alarm: false };
}

/** One second for one device: returns the new device and the events it reports. */
export function step(d, rand) {
  const events = [];
  const n = { ...d };
  const inflow = n.leaking && n.valve !== "closed" ? 6 + rand() * 2 : 0;
  const outflow = n.fan ? 4.5 : 1.2;
  const baseline = 1 + rand() * 2.5;
  n.gas = Math.round(Math.max(baseline, Math.min(60, n.gas + inflow - outflow)) * 10) / 10;
  n.confirm = n.gas >= THRESHOLD ? n.confirm + 1 : 0;
  if (!n.alarm && n.confirm >= CONFIRM_SECONDS) {
    n.alarm = true;
    events.push("leak_confirmed");
    if (n.valve === "open") { n.valve = "closed"; n.leaking = false; events.push("valve_closed"); }
    if (!n.fan) { n.fan = true; events.push("fan_on"); }
  }
  if (n.alarm && !n.leaking && n.gas < CLEAR_LEVEL) {
    n.alarm = false;
    events.push("air_clear");
    if (n.fan) { n.fan = false; events.push("fan_off"); }
  }
  return { device: n, events };
}

export const startLeak = (d) => ({ ...d, leaking: true });

/** Close command from the app. Opening from the app is never possible. */
export function remoteClose(d) {
  if (d.valve !== "open") return { device: d, events: [] };
  return { device: { ...d, valve: "closed", leaking: false }, events: ["remote_close"] };
}

/** The person turns the cylinder regulator off by hand (stops the leak; no event is reported). */
export const regulatorOff = (d) => ({ ...d, leaking: false });

export const canReset = (d) => d.valve === "closed" && !d.alarm && d.gas < THRESHOLD;

/** The person lifts the reset lever at the stove. */
export function manualReset(d) {
  if (!canReset(d)) return { device: d, events: [] };
  return { device: { ...d, valve: "open" }, events: ["reset"] };
}

/** What the device writes to devices/<id>/state (DEVICE_API.md, Spark edition). */
export function stateOf(d) {
  return {
    valve: d.valve, gasLEL: Math.round(d.gas), alarm: d.alarm, fan: d.fan, detectorBattery: d.battery,
    ...(d.kit === "complete" ? { valveBattery: Math.min(100, d.battery + 5) } : {}),
    rfLinkOk: true, fw: "dashboard-emulator-1",
  };
}

/** The firmware's rule for sending state: gas moved by 2 points or more, or a flag changed. */
export function stateChanged(prev, next) {
  return !prev || prev.valve !== next.valve || prev.alarm !== next.alarm || prev.fan !== next.fan
    || prev.detectorBattery !== next.detectorBattery || Math.abs(prev.gasLEL - next.gasLEL) >= 2;
}
