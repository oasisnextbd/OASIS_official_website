// Realtime Database security rules: what devices, owners and strangers may do.
// Run: npm install && npm test   (needs Java for the Firebase emulator)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, set, get, update, push, remove, serverTimestamp } from "firebase/database";

const ID = "VG-0001A3";
const CODE = "K7Q2M9XW4TPA";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-venguard",
    database: { rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"), host: "127.0.0.1", port: 9000 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), "/"), {
      deviceAuth: { [ID]: "device-uid-1" },
      claimCodes: { [ID]: CODE },
      admins: { "admin-uid": true },
      devices: { [ID]: { meta: { kit: "complete" }, owners: { "owner-uid": CODE }, state: { valve: "open", gasLEL: 2, alarm: false } } },
    });
  });
});

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const device = () => db("device-uid-1");
const owner = () => db("owner-uid");
const stranger = () => db("stranger-uid");
const state = { valve: "open", gasLEL: 3, alarm: false, fan: false, detectorBattery: 80 };
const close = (uid, exp = Date.now() + 600000) => ({ type: "close", exp, by: uid });

test("nobody signed out can read anything", async () => {
  await assertFails(get(ref(db(null), `devices/${ID}`)));
  await assertFails(get(ref(db(null), "claimCodes")));
});

test("secrets stay secret, even from owners", async () => {
  await assertFails(get(ref(owner(), "claimCodes")));
  await assertFails(get(ref(owner(), "deviceAuth")));
  await assertFails(get(ref(device(), `claimCodes/${ID}`)));
});

test("the device reports state, heartbeat and events", async () => {
  await assertSucceeds(set(ref(device(), `devices/${ID}/state`), state));
  await assertSucceeds(set(ref(device(), `hb/${ID}`), serverTimestamp()));
  await assertSucceeds(push(ref(device(), `devices/${ID}/events`), { type: "leak_confirmed", at: serverTimestamp() }));
  await assertSucceeds(get(ref(device(), `devices/${ID}/meta`)));
});

test("device data is validated", async () => {
  await assertFails(set(ref(device(), `devices/${ID}/state`), { ...state, valve: "half" }));
  await assertFails(set(ref(device(), `devices/${ID}/state`), { ...state, gasLEL: 400 }));
  await assertFails(push(ref(device(), `devices/${ID}/events`), { type: "open_valve", at: serverTimestamp() }));
  await assertFails(set(ref(device(), `hb/${ID}`), 12345));
});

test("a device cannot write another device or read its own owners", async () => {
  await assertFails(set(ref(device(), "devices/VG-OTHER/state"), state));
  await assertFails(get(ref(device(), `devices/${ID}/owners`)));
});

test("people cannot fake device data", async () => {
  await assertFails(set(ref(owner(), `devices/${ID}/state`), state));
  await assertFails(push(ref(owner(), `devices/${ID}/events`), { type: "air_clear", at: serverTimestamp() }));
});

test("claiming needs the sticker code", async () => {
  await assertFails(set(ref(stranger(), `devices/${ID}/owners/stranger-uid`), "WRONGCODE123"));
  await assertFails(set(ref(stranger(), `devices/${ID}/owners/owner-uid`), CODE)); // only for yourself
  await assertFails(get(ref(stranger(), `devices/${ID}/state`)));
  await assertSucceeds(set(ref(stranger(), `devices/${ID}/owners/stranger-uid`), CODE));
  await assertSucceeds(get(ref(stranger(), `devices/${ID}/state`)));
});

test("claim and label in one step; labels need ownership", async () => {
  await assertFails(set(ref(stranger(), `users/stranger-uid/devices/${ID}`), { name: "Kitchen" }));
  await assertSucceeds(update(ref(stranger(), "/"), {
    [`devices/${ID}/owners/stranger-uid`]: CODE,
    [`users/stranger-uid/devices/${ID}`]: { name: "Kitchen", area: "Mirpur 11", kind: "home" },
  }));
});

test("owners can only send a close command, never open", async () => {
  await assertSucceeds(push(ref(owner(), `devices/${ID}/cmd`), close("owner-uid")));
  await assertFails(push(ref(owner(), `devices/${ID}/cmd`), { ...close("owner-uid"), type: "open" }));
  await assertFails(push(ref(owner(), `devices/${ID}/cmd`), close("owner-uid", Date.now() + 3 * 3600000)));
  await assertFails(push(ref(owner(), `devices/${ID}/cmd`), close("someone-else")));
  await assertFails(push(ref(stranger(), `devices/${ID}/cmd`), close("stranger-uid")));
});

test("the device reads, acks and clears commands; people cannot ack", async () => {
  const r = push(ref(owner(), `devices/${ID}/cmd`), close("owner-uid"));
  await r;
  const cid = r.key;
  await assertSucceeds(get(ref(owner(), `devices/${ID}/cmd`))); // owners see pending commands
  await assertFails(get(ref(stranger(), `devices/${ID}/cmd`)));
  await assertSucceeds(get(ref(device(), `devices/${ID}/cmd`)));
  await assertFails(set(ref(owner(), `devices/${ID}/ack/${cid}`), { result: "closed" }));
  await assertSucceeds(set(ref(device(), `devices/${ID}/ack/${cid}`), { result: "closed" }));
  await assertFails(set(ref(device(), `devices/${ID}/ack/${cid}`), { result: "failed" })); // ack once
  await assertFails(remove(ref(owner(), `devices/${ID}/cmd/${cid}`)));
  await assertSucceeds(remove(ref(device(), `devices/${ID}/cmd/${cid}`)));
});

test("people keep their own profile; family numbers are validated", async () => {
  await assertSucceeds(set(ref(owner(), "users/owner-uid/family"), [{ name: "Mum", phone: "01711223344" }]));
  await assertFails(set(ref(owner(), "users/owner-uid/family"), [{ name: "Mum", phone: "12345" }]));
  await assertFails(get(ref(stranger(), "users/owner-uid")));
  await assertFails(set(ref(owner(), "users/owner-uid/role"), "admin"));
});

test("only admins set device metadata; owners can leave", async () => {
  await assertFails(set(ref(owner(), `devices/${ID}/meta`), { kit: "complete" }));
  await assertSucceeds(set(ref(db("admin-uid"), `devices/${ID}/meta`), { kit: "detector_relay" }));
  await assertSucceeds(remove(ref(owner(), `devices/${ID}/owners/owner-uid`)));
});

// The company Google account (team dashboard → Emulators) may register test devices VG-EMU01…99 only.
const company = (extra = {}) => env.authenticatedContext("company-uid", {
  email: "oasisnextbd@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra }).database();

test("the company account registers emulator devices, and nothing else", async () => {
  await assertSucceeds(update(ref(company()), {
    "deviceAuth/VG-EMU01": "emu-uid-1", "claimCodes/VG-EMU01": "ABCDEFGHJKMN", "devices/VG-EMU01/meta": { kit: "complete" },
  }));
  await assertFails(set(ref(company(), `deviceAuth/${ID}`), "attacker-uid"));
  await assertFails(set(ref(company(), `claimCodes/${ID}`), "ABCDEFGHJKMN"));
  await assertFails(set(ref(company(), `devices/${ID}/meta`), { kit: "detector_relay" }));
  await assertFails(set(ref(company(), "claimCodes/VG-EMU02"), "short"));
  await assertFails(get(ref(company(), "claimCodes/VG-EMU01")));
  await assertSucceeds(update(ref(company()), { "deviceAuth/VG-EMU01": null, "claimCodes/VG-EMU01": null, "devices/VG-EMU01/meta": null }));
});

test("only the verified Google sign-in of the company account counts", async () => {
  await assertFails(set(ref(company({ firebase: { sign_in_provider: "password" } }), "deviceAuth/VG-EMU01"), "x"));
  await assertFails(set(ref(company({ email_verified: false }), "deviceAuth/VG-EMU01"), "x"));
  await assertFails(set(ref(env.authenticatedContext("u", { email: "someone@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).database(), "deviceAuth/VG-EMU01"), "x"));
  await assertFails(set(ref(owner(), "claimCodes/VG-EMU01"), "ABCDEFGHJKMN"));
});

test("an emulator acts as its device once registered, like real firmware", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await update(ref(ctx.database()), { "deviceAuth/VG-EMU01": "emu-uid-1", "claimCodes/VG-EMU01": "ABCDEFGHJKMN", "devices/VG-EMU01/meta": { kit: "complete" } });
  });
  const emu = db("emu-uid-1");
  await assertSucceeds(set(ref(emu, "devices/VG-EMU01/state"), state));
  await assertSucceeds(set(ref(emu, "hb/VG-EMU01"), serverTimestamp()));
  await assertFails(set(ref(emu, `devices/${ID}/state`), state));
  await assertSucceeds(set(ref(owner(), "devices/VG-EMU01/owners/owner-uid"), "ABCDEFGHJKMN"));
  await assertSucceeds(get(ref(owner(), "devices/VG-EMU01/state")));
});
