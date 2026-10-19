// node --test team-dashboard/tests/emusim.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { newDevice, step, startLeak, remoteClose, manualReset, regulatorOff, stateOf, stateChanged, CONFIRM_SECONDS } from "../js/emusim.js";

const mid = () => 0.5;
function run(d, seconds) {
  const events = [];
  for (let i = 0; i < seconds; i++) { const r = step(d, mid); d = r.device; events.push(...r.events); }
  return { d, events };
}

test("clean air never alarms", () => {
  const { d, events } = run(newDevice("VG-EMU01", "complete"), 120);
  assert.equal(d.alarm, false);
  assert.deepEqual(events, []);
});

test("a leak is confirmed after the 7-second check; the valve closes and the fan starts", () => {
  const { d, events } = run(startLeak(newDevice("VG-EMU01", "complete")), 3 + CONFIRM_SECONDS + 2);
  assert.equal(d.alarm, true);
  assert.equal(d.valve, "closed");
  assert.equal(d.fan, true);
  assert.deepEqual(events, ["leak_confirmed", "valve_closed", "fan_on"]);
});

test("the fan clears the air; the valve stays closed until reset by hand", () => {
  let { d } = run(startLeak(newDevice("VG-EMU01", "complete")), 15);
  const r = run(d, 30);
  d = r.d;
  assert.ok(r.events.includes("air_clear"));
  assert.equal(d.alarm, false);
  assert.equal(d.valve, "closed");
  const back = manualReset(d);
  assert.equal(back.device.valve, "open");
  assert.deepEqual(back.events, ["reset"]);
});

test("a detector + relay kit has no valve: the leak goes on until the regulator is turned off", () => {
  let { d } = run(startLeak(newDevice("VG-EMU02", "detector_relay")), 20);
  assert.equal(d.valve, "none");
  assert.equal(d.alarm, true);
  d = regulatorOff(d);
  d = run(d, 30).d;
  assert.equal(d.alarm, false);
});

test("remote close works on an open valve only; there is no remote open", () => {
  const d = newDevice("VG-EMU01", "complete");
  const r = remoteClose(d);
  assert.equal(r.device.valve, "closed");
  assert.deepEqual(r.events, ["remote_close"]);
  assert.deepEqual(remoteClose(r.device).events, []);
  assert.deepEqual(remoteClose(newDevice("VG-EMU02", "detector_relay")).events, []);
});

test("state follows the device API; small gas changes are not sent", () => {
  const s = stateOf(newDevice("VG-EMU01", "complete"));
  assert.equal(s.valve, "open");
  assert.equal(typeof s.gasLEL, "number");
  assert.equal(s.valveBattery, 85);
  assert.equal(stateOf(newDevice("VG-EMU02", "detector_relay")).valveBattery, undefined);
  assert.equal(stateChanged(s, { ...s, gasLEL: s.gasLEL + 1 }), false);
  assert.equal(stateChanged(s, { ...s, gasLEL: s.gasLEL + 2 }), true);
  assert.equal(stateChanged(s, { ...s, alarm: true }), true);
});
