// Drives the team dashboard's own store.js + emulator.js (unchanged) from Node, against the local
// Firebase emulators with the real rules: the company account creates and assigns VG-EMU01, a founder
// reads only theirs, then the emulator runs and listens for the browser test's commands via a file.
globalThis.document = { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };
const RT = "/home/user/OASIS_official_website/backend/connected-firebase/rules-test/node_modules/";
const { initializeApp, deleteApp } = await import(RT + "firebase/app/dist/index.mjs");
const A = await import(RT + "firebase/auth/dist/index.mjs");
const F = await import(RT + "firebase/firestore/dist/index.mjs");
const D = await import(RT + "firebase/database/dist/index.mjs");
const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
const cfg = JSON.parse(readFileSync("/home/user/OASIS_official_website/team-dashboard/config.json", "utf8")).firebase;
const DASH = "/home/user/OASIS_official_website/team-dashboard/js/";
const { S, createEmulator, assignEmulator, start } = await import(DASH + "store.js");
const { startEmulator, act, runOf } = await import(DASH + "emulator.js");
const OUT = process.argv[2];

let n = 0;
function connect(email) {
  const app = initializeApp(cfg, "team-" + (++n));
  const auth = A.initializeAuth(app, { persistence: A.inMemoryPersistence });
  A.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = F.getFirestore(app); F.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const rt = D.getDatabase(app); D.connectDatabaseEmulator(rt, "127.0.0.1", 9000);
  const ref = (c, id) => F.doc(db, c, id);
  const deviceApp = () => { const a = initializeApp(cfg, "device-" + (++n)); const au = A.initializeAuth(a, { persistence: A.inMemoryPersistence }); A.connectAuthEmulator(au, "http://127.0.0.1:9099", { disableWarnings: true }); return { a, au }; };
  return {
    kind: "firebase",
    signIn: () => A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: "t-" + email, email, email_verified: true }))),
    watch(col, cb, o = {}, onError) { const parts = []; if (o.where) parts.push(F.where(...o.where)); return F.onSnapshot(F.query(F.collection(db, col), ...parts), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), onError); },
    watchDoc(col, id, cb, onError) { return F.onSnapshot(ref(col, id), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), onError); },
    async get(col, id) { const d = await F.getDoc(ref(col, id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
    set: (col, id, data, merge = false) => F.setDoc(ref(col, id), data, { merge }),
    update: (col, id, data) => F.updateDoc(ref(col, id), data),
    del: (col, id) => F.deleteDoc(ref(col, id)),
    async add(col, data) { return (await F.addDoc(F.collection(db, col), data)).id; },
    rtdbUpdate: (v) => D.update(D.ref(rt), v),
    async createDeviceUser(e, p) { const { a, au } = deviceApp(); try { return (await A.createUserWithEmailAndPassword(au, e, p)).user.uid; } finally { await deleteApp(a); } },
    async deviceSession(e, p) {
      const { a, au } = deviceApp(); await A.signInWithEmailAndPassword(au, e, p);
      const r = D.getDatabase(a); D.connectDatabaseEmulator(r, "127.0.0.1", 9000); const at = (x) => D.ref(r, x);
      return { uid: au.currentUser.uid, set: (x, v) => D.set(at(x), v), push: (x, v) => D.push(at(x), v), remove: (x) => D.remove(at(x)),
        onValue: (x, cb, err) => D.onValue(at(x), (s) => cb(s.val()), err), onChildAdded: (x, cb, err) => D.onChildAdded(at(x), (s) => cb(s.key, s.val()), err),
        serverTime: () => D.serverTimestamp(), deleteUser: () => A.deleteUser(au.currentUser), async close() { await deleteApp(a); } };
    },
  };
}
const log = (m) => console.log(new Date().toISOString().slice(11, 19), "[dashboard]", m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. The company account: create and assign.
S.cfg = { owner: "oasisnextbd@gmail.com" };
S.db = connect("oasisnextbd@gmail.com");
await S.db.signIn();
S.me = { email: "oasisnextbd@gmail.com", role: "founder", owner: true };
await S.db.set("team", "founder2@gmail.com", { email: "founder2@gmail.com", name: "Second founder", role: "founder", active: true });
start(() => {}, (e) => log("watch error " + e.code));
await wait(800);
const id = await createEmulator("complete");
await wait(800);
const emu = S.data.emulators.find((e) => e.id === id);
log(`created ${id}, ready=${emu.ready}, code ${emu.code}`);
await assignEmulator(id, "founder2@gmail.com");
log("assigned to founder2@gmail.com");

// 2. Another founder sees only their own; a third person sees nothing.
const f2 = connect("founder2@gmail.com"); await f2.signIn();
const rowsF2 = await new Promise((res) => { const u = f2.watch("emulators", (r) => { u(); res(r); }, { where: ["assigned_to", "==", "founder2@gmail.com"] }, (e) => res("ERR " + e.code)); });
log(`founder2 sees: ${Array.isArray(rowsF2) ? rowsF2.map((r) => r.id).join(",") : rowsF2}`);
await S.db.set("team", "support@gmail.com", { email: "support@gmail.com", role: "support", active: true });
const sup = connect("support@gmail.com"); await sup.signIn();
log("support reading it: " + await sup.get("emulators", id).then(() => "ALLOWED (wrong)", (e) => "refused (" + e.code + ")"));

// 3. The assigned founder starts it (their own dashboard session).
S.db = f2; S.me = { email: "founder2@gmail.com", role: "founder", owner: false };
await startEmulator(S.db, emu);
log("emulator running: " + runOf(id).status);
writeFileSync(OUT + "/emu.json", JSON.stringify({ id, code: emu.code }));

// 4. Follow the browser test's instructions (written to a file) until told to stop.
let done = 0;
while (true) {
  await wait(500);
  const f = OUT + "/cmd.txt";
  if (!existsSync(f)) continue;
  const cmds = readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
  for (const c of cmds.slice(done)) {
    done++;
    if (c === "stop") { log("stopping"); process.exit(0); }
    await act(id, c);
    log(`${c} → gas ${Math.round(runOf(id).device.gas)} %, valve ${runOf(id).device.valve}`);
  }
  if (runOf(id) && runOf(id).log[0] && !runOf(id).log[0].shown) { runOf(id).log[0].shown = true; log("emulator: " + runOf(id).log[0].msg); }
}
