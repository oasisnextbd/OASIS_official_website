/* Firebase adapter: Google sign-in (Firebase Auth) and the company data (Cloud Firestore) in the
   venguard-connected project. Security is in backend/connected-firebase/firestore.rules; this file
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
