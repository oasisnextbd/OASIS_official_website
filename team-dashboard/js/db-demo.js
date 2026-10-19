/* Demo adapter: the same interface as db-firebase.js, kept in memory with made-up data.
   Used when the page runs on this computer (localhost) without Firebase, for demos and design work. */

export function connect() {
  const data = sample();
  const watchers = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const list = (col) => Object.entries(data[col] || {}).map(([id, v]) => ({ id, ...clone(v) }));
  function notify(col) { watchers.filter((w) => w.col === col).forEach(run); }
  function run(w) {
    if (w.id) return w.cb(data[w.col]?.[w.id] ? { id: w.id, ...clone(data[w.col][w.id]) } : null);
    let r = list(w.col);
    if (w.o.orderBy) r.sort((a, b) => (a[w.o.orderBy] > b[w.o.orderBy] ? 1 : -1) * (w.o.desc ? -1 : 1));
    if (w.o.limit) r = r.slice(0, w.o.limit);
    w.cb(r);
  }
  const put = (col, id, v) => { (data[col] = data[col] || {})[id] = clone(v); notify(col); };
  let n = 0;
  const newId = () => "demo" + Date.now().toString(36) + (n++);
  let user = null, authCb = () => {};

  return {
    kind: "demo",
    auth: {
      onChange: (cb) => { authCb = cb; setTimeout(() => cb(user), 0); },
      signIn: async () => { user = { email: "oasisnextbd@gmail.com", name: "Demo founder" }; authCb(user); },
      signOut: async () => { user = null; authCb(null); },
      testSignIn: async (email) => { user = { email, name: "" }; authCb(user); },
    },
    watch(col, cb, o = {}) { const w = { col, cb, o }; watchers.push(w); setTimeout(() => run(w), 0); return () => watchers.splice(watchers.indexOf(w), 1); },
    watchDoc(col, id, cb) { const w = { col, id, cb, o: {} }; watchers.push(w); setTimeout(() => run(w), 0); return () => watchers.splice(watchers.indexOf(w), 1); },
    async get(col, id) { return data[col]?.[id] ? { id, ...clone(data[col][id]) } : null; },
    async set(col, id, v, merge) { put(col, id, merge ? { ...(data[col]?.[id] || {}), ...v } : v); },
    async update(col, id, v) {
      if (!data[col]?.[id]) throw new Error("Not found: " + col + "/" + id);
      put(col, id, { ...data[col][id], ...v });
    },
    async del(col, id) { if (data[col]) { delete data[col][id]; notify(col); } },
    async add(col, v) { const id = newId(); put(col, id, v); return id; },
    async tx(fn) {
      const writes = [];
      const r = await fn({
        get: async (col, id) => (data[col]?.[id] ? { id, ...clone(data[col][id]) } : null),
        set: (col, id, v) => writes.push(() => put(col, id, v)),
        update: (col, id, v) => writes.push(() => put(col, id, { ...data[col][id], ...v })),
        newId: () => newId(),
      });
      writes.forEach((w) => w());
      return r;
    },
  };
}

/* ---------- made-up company data (no real customers, prices or contacts) ---------- */
function sample() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();
  const names = ["Farzana Rahman", "Tanvir Hasan", "Nusrat Jahan", "Arif Chowdhury", "Shirin Akter", "Kamal Pasha", "Rahima Khatun", "Imran Hossain", "Sabbir Ahmed", "Taslima Begum"];
  const districts = { Dhaka: ["Mirpur 10", "Dhanmondi", "Uttara", "Mohammadpur"], Chattogram: ["Agrabad", "Halishahar"], Gazipur: ["Tongi", "Board Bazar"] };
  const orders = {};
  for (let i = 0; i < 46; i++) {
    const t = new Date(now - rnd() * 60 * 864e5);
    const dist = pick(Object.keys(districts));
    const type = rnd() < 0.8 ? "preorder" : pick(["enquiry", "dealer", "contact"]);
    const id = "VG-" + t.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.floor(rnd() * 1e6).toString(36).toUpperCase().padStart(4, "X").slice(0, 4);
    orders[id] = {
      order_id: id, submitted_at: t.toISOString(), form_type: type, name: pick(names),
      status: pick(["new", "payment_pending", "contacted", "paid", "paid", "installed", "not_interested"]),
      phone: "017" + String(Math.floor(10000000 + rnd() * 89999999)), area: pick(districts[dist]), district: dist,
      package: type === "preorder" ? (rnd() < 0.75 ? "complete" : "detector_relay") : "", kitchen_type: pick(["home", "home", "restaurant"]),
      units: type === "preorder" ? 1 : "", heard_from: pick(["facebook", "facebook", "whatsapp", "fair", "dealer", "friend"]),
      dealer_code: rnd() < 0.15 ? "DH-042" : "", promo_code: rnd() < 0.2 ? "FAIR10" : "", team_notes: "",
    };
  }
  const iso = (d) => new Date(now - d * 864e5).toISOString();
  const day = (d) => iso(d).slice(0, 10);
  return {
    orders,
    team: {
      "oasisnextbd@gmail.com": { email: "oasisnextbd@gmail.com", name: "Demo founder", role: "founder", active: true },
      "support@example.com": { email: "support@example.com", name: "Support desk", role: "support", active: true },
      "marketing@example.com": { email: "marketing@example.com", name: "Marketing", role: "marketing", active: true },
    },
    inventory: {
      DET: { sku: "DET", name: "Gas detector", stock: 24, low_at: 10, unit_cost: 0 },
      VALVE: { sku: "VALVE", name: "Smart valve", stock: 9, low_at: 10, unit_cost: 0 },
      RELAY: { sku: "RELAY", name: "Smart relay", stock: 30, low_at: 10, unit_cost: 0 },
    },
    products: {
      complete: { name: "VenGuard complete kit (detector, valve, relay)", price: 3500, components: { DET: 1, VALVE: 1, RELAY: 1 }, active: true },
      detector_relay: { name: "VenGuard detector + relay", price: 1900, components: { DET: 1, RELAY: 1 }, active: true },
    },
    promos: {
      FAIR10: { code: "FAIR10", type: "percent", value: 10, starts: day(30), ends: day(-30), max_uses: 100, used: 6, active: true, note: "Innovation fair visitors" },
      LAUNCH500: { code: "LAUNCH500", type: "amount", value: 500, starts: "", ends: day(5), max_uses: 0, used: 2, active: false, note: "Example of a stopped code" },
    },
    marketing: {
      m1: { date: day(40), channel: "facebook", campaign: "Launch video boost", amount: 8000, note: "" },
      m2: { date: day(25), channel: "fair", campaign: "Innovation fair stall", amount: 15000, note: "Banner, leaflets, transport" },
      m3: { date: day(12), channel: "facebook", campaign: "Dhaka homes", amount: 6000, note: "" },
      m4: { date: day(8), channel: "print", campaign: "Dealer counter stickers", amount: 2500, note: "" },
    },
    dealers: {
      "DH-042": { code: "DH-042", shop_name: "Mollah Gas House", owner_name: "Example owner", phone: "01700000042", area: "Mirpur 10", district: "Dhaka", status: "active", created_at: iso(40), notes: "" },
    },
    settings: {
      company: { legal_name: "", address: "", phone: "", email: "", bin: "", trade_license: "", vat_rate: 0, invoice_prefix: "INV", terms: "" },
      website: { preorder_open: true, kit_price_bdt: "", notice_bn: "", notice_en: "" },
      app: { notice_en: "", min_version: "" },
    },
    subscriptions: {
      s1: { name: "GitHub (website hosting, code)", category: "Hosting", cycle: "free", cost: 0, currency: "BDT", active: true, remind_days: 30, history: [] },
      s2: { name: "Example domain (made up)", category: "Domain", cycle: "yearly", cost: 1800, currency: "BDT", renews_on: day(-12), auto_renew: false, paid_by: "Founder", remind_days: 30, active: true, history: [] },
      s3: { name: "Example design tool (made up)", category: "Design & office", cycle: "monthly", cost: 12, currency: "USD", renews_on: day(-25), auto_renew: true, remind_days: 7, active: true, history: [] },
    },
    signatories: {}, invoices: {}, stockMoves: {}, counters: {},
    activity: { a1: { at: iso(0.1), user: "support@example.com", action: "order_update", ref: Object.keys(orders)[0], detail: "status → contacted" } },
  };
}
