/* Firebase adapter: Google sign-in (Firebase Auth) and the company data (Cloud Firestore) in the
   venguard-connected project; for the Emulators section also the Realtime Database the devices and the
   app use. Security is in backend/connected-firebase/firestore.rules and database.rules.json; this file
   only talks to Firebase. js/db-demo.js has the same interface with made-up data. */

const V = "11.10.0";
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

export async function connect(cfg) {
  const [appM, authM, fs] = await Promise.all([
    import(CDN + "firebase-app.js"), import(CDN + "firebase-auth.js"), import(CDN + "firebase-firestore.js"),
  ]);
  const app = appM.initializeApp(cfg.firebase);
  const auth = authM.getAuth(app);
  let db;
  try {
    // Keeps a copy on this computer, so the dashboard opens at once and updates live afterwards.
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    db = fs.getFirestore(app);
  }
  if (cfg.emulators) {
    authM.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  // Realtime Database (devices): loaded only when the Emulators section needs it.
  let rtdbM = null, mainRtdb = null;
  const database = async () => rtdbM || (rtdbM = await import(CDN + "firebase-database.js"));
  async function teamRtdb() {
    const d = await database();
    if (!mainRtdb) { mainRtdb = d.getDatabase(app); if (cfg.emulators) d.connectDatabaseEmulator(mainRtdb, "127.0.0.1", 9000); }
    return { d, db: mainRtdb };
  }
  // A separate Firebase app per device session, signed in only in memory: the team member's own
  // sign-in in this tab is not touched, and nothing about the device is kept on the computer.
  let apps = 0;
  function deviceApp() {
    const a = appM.initializeApp(cfg.firebase, "device-" + (++apps));
    const au = authM.initializeAuth(a, { persistence: authM.inMemoryPersistence });
    if (cfg.emulators) authM.connectAuthEmulator(au, "http://127.0.0.1:9099", { disableWarnings: true });
    return { a, au };
  }

  const ref = (col, id) => fs.doc(db, col, id);
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    kind: "firebase",
    auth: {
      onChange: (cb) => authM.onAuthStateChanged(auth, (u) => cb(u ? { email: String(u.email || "").toLowerCase(), name: u.displayName || "" } : null)),
      signIn: () => {
        const p = new authM.GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });   // always show the account chooser
        return authM.signInWithPopup(auth, p);
      },
      signOut: async () => {
        await authM.signOut(auth);
        // Leave no company data on this computer after signing out.
        try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (e) { /* another tab still open */ }
      },
      // Emulator only: sign in as any Google account without the popup (used by the tests).
      testSignIn: cfg.emulators ? (email) => authM.signInWithCredential(auth, authM.GoogleAuthProvider.credential(JSON.stringify({ sub: "test-" + email, email, email_verified: true }))) : null,
    },
    watch(col, cb, o = {}, onError) {
      const parts = [];
      if (o.where) parts.push(fs.where(...o.where));
      if (o.orderBy) parts.push(fs.orderBy(o.orderBy, o.desc ? "desc" : "asc"));
      if (o.limit) parts.push(fs.limit(o.limit));
      return fs.onSnapshot(fs.query(fs.collection(db, col), ...parts), (s) => cb(rows(s)), onError);
    },
    watchDoc(col, id, cb, onError) {
      return fs.onSnapshot(ref(col, id), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), onError);
    },
    async get(col, id) { const d = await fs.getDoc(ref(col, id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
    set: (col, id, data, merge = false) => fs.setDoc(ref(col, id), data, { merge }),
    update: (col, id, data) => fs.updateDoc(ref(col, id), data),
    del: (col, id) => fs.deleteDoc(ref(col, id)),
    async add(col, data) { const r = await fs.addDoc(fs.collection(db, col), data); return r.id; },
    /* ---- devices (Realtime Database) ---- */
    /** Several device-database writes at once, as the signed-in team member (rules: owner, emulator IDs only). */
    async rtdbUpdate(values) { const { d, db: r } = await teamRtdb(); return d.update(d.ref(r), values); },
    /** Creates the sign-in for a new device; returns its user ID. */
    async createDeviceUser(email, password) {
      const { a, au } = deviceApp();
      try { return (await authM.createUserWithEmailAndPassword(au, email, password)).user.uid; }
      finally { await appM.deleteApp(a); }
    },
    /** Signs in as a device and returns what an emulator needs to act like one. */
    async deviceSession(email, password) {
      const d = await database();
      const { a, au } = deviceApp();
      try { await authM.signInWithEmailAndPassword(au, email, password); }
      catch (e) { await appM.deleteApp(a); throw e; }
      const r = d.getDatabase(a);
      if (cfg.emulators) d.connectDatabaseEmulator(r, "127.0.0.1", 9000);
      const at = (p) => d.ref(r, p);
      return {
        uid: au.currentUser.uid,
        set: (p, v) => d.set(at(p), v),
        push: (p, v) => d.push(at(p), v),
        remove: (p) => d.remove(at(p)),
        /** Have the server delete p if this session's connection drops (tab closed, network gone). */
        removeOnDisconnect: (p) => d.onDisconnect(at(p)).remove(),
        onValue: (p, cb, err) => d.onValue(at(p), (s) => cb(s.val()), err),
        onChildAdded: (p, cb, err) => d.onChildAdded(at(p), (s) => cb(s.key, s.val()), err),
        serverTime: () => d.serverTimestamp(),
        deleteUser: () => authM.deleteUser(au.currentUser),
        async close() { try { await authM.signOut(au); } catch (e) { /* already out */ } await appM.deleteApp(a); },
      };
    },
    tx: (fn) => fs.runTransaction(db, (t) => fn({
      get: async (col, id) => { const d = await t.get(ref(col, id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
      set: (col, id, data) => t.set(ref(col, id), data),
      update: (col, id, data) => t.update(ref(col, id), data),
      newId: (col) => fs.doc(fs.collection(db, col)).id,
    })),
  };
}

/** Turns Firebase error codes into sentences for the team. */
export function explain(err) {
  const c = (err && err.code) || "";
  if (c === "permission-denied" || c === "firestore/permission-denied") return "Your role can't do this, or your account is not on the team list.";
  if (c === "unavailable") return "No connection to the database. Check the internet; changes are kept and sent when you're back online.";
  if (c === "auth/popup-blocked") return "The browser blocked the sign-in window. Allow pop-ups for this page, then try again.";
  if (c === "not-found" || /database \(default\) does not exist/i.test(err && err.message)) return "The database is not switched on yet (Firebase console → Firestore Database → Create database).";
  return (err && err.message) || String(err);
}
