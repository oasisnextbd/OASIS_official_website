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
    if (w.o.where) r = r.filter((x) => x[w.o.where[0]] === w.o.where[2]);
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
    // Emulators talk to the real device database: not available with made-up data.
    async rtdbUpdate() { throw new Error("Emulators work only in the real dashboard, not the demo."); },
    async createDeviceUser() { throw new Error("Emulators work only in the real dashboard, not the demo."); },
    async deviceSession() { throw new Error("Emulators work only in the real dashboard, not the demo."); },
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
      "engineer.friend@example.com": { email: "engineer.friend@example.com", name: "Guest engineer", role: "guest", active: true, until: day(-30), until_ms: now + 30 * 864e5 },
    },
    // Tasks and online status (views/tasks.js): made up for the demo and the manual's pictures.
    tasks: {
      t1: { title: "Call every new website lead", details: "Use the Orders list; write what each person said in Team notes.", assignee: "support@example.com", assignee_name: "Support desk", kind: "daily", due: day(0), status: "open", created_at: iso(0.3), created_by: "oasisnextbd@gmail.com", returned_count: 0 },
      t2: { title: "Post the installation video on Facebook", details: "", assignee: "marketing@example.com", assignee_name: "Marketing", kind: "weekly", due: day(-2), status: "submitted", submitted_at: iso(0.1), submit_note: "Posted at 6 pm. Reach and clicks are in the report.", link: "https://www.facebook.com/", files: [{ id: "demofile1", name: "post-report.txt", type: "text/plain", size: 96 }], created_at: iso(4), created_by: "oasisnextbd@gmail.com", returned_count: 0 },
      t3: { title: "Count the stock and update Inventory", details: "Detectors, valves, relays.", assignee: "support@example.com", assignee_name: "Support desk", kind: "weekly", due: day(1), status: "open", created_at: iso(6), created_by: "oasisnextbd@gmail.com", returned_count: 0 },
      t4: { title: "Monthly marketing cost report", details: "Every spend entered in Marketing costs, with receipts.", assignee: "marketing@example.com", assignee_name: "Marketing", kind: "monthly", due: day(-9), status: "returned", review_note: "Two Facebook receipts are missing.", submitted_at: iso(1), reviewed_at: iso(0.5), created_at: iso(12), created_by: "oasisnextbd@gmail.com", returned_count: 1 },
      t5: { title: "Review the relay wiring and the install guide", details: "Test with your emulator; write suggestions.", assignee: "engineer.friend@example.com", assignee_name: "Guest engineer", kind: "milestone", due: day(-14), status: "open", created_at: iso(1), created_by: "oasisnextbd@gmail.com", returned_count: 0 },
      t6: { title: "Answer WhatsApp messages within 2 hours", details: "", assignee: "support@example.com", assignee_name: "Support desk", kind: "daily", due: day(1), status: "approved", submitted_at: iso(1.2), reviewed_at: iso(1), created_at: iso(2), created_by: "oasisnextbd@gmail.com", returned_count: 0 },
    },
    taskFiles: {
      demofile1: { task_id: "t2", name: "post-report.txt", type: "text/plain", size: 96, data: "data:text/plain;base64,RmFjZWJvb2sgcG9zdCwgMjEgT2N0b2JlcgpSZWFjaDogNCwxMjAgcGVvcGxlCkNsaWNrcyB0byB0aGUgd2Vic2l0ZTogODYKKG1hZGUtdXAgZGVtbyByZXBvcnQpCg==", assignee: "marketing@example.com", uploaded_by: "marketing@example.com", uploaded_at: iso(0.1) },
    },
    presence: {
      "support@example.com": { email: "support@example.com", last_seen: iso(0.0003), online: true },
      "marketing@example.com": { email: "marketing@example.com", last_seen: iso(0.12), online: false },
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
    ratings: Object.fromEntries(Array.from({ length: 23 }, (_, i) => {
      const r = { source: "website", updated_at: iso(rnd() * 40), lang: rnd() < 0.6 ? "bn" : "en",
        page: pick(["/VENGuard/", "/VENGuard/en/", "/VENGuard/how-it-works/", "/VENGuard/en/pre-order/", "/VENGuard/faq/"]) };
      r.created_at = r.updated_at;
      r.website = pick([5, 5, 4, 4, 4, 3, 2]);
      if (rnd() < 0.35) r.product = pick([5, 5, 4, 4, 3]);
      if (rnd() < 0.3) r.service = pick([5, 4, 4, 3, 1]);
      return ["R-demo" + String(i).padStart(14, "0"), r];
    })),
    signatories: {}, stockMoves: {},
    counters: { [`invoice-${new Date().getFullYear()}`]: { next: 4 } },   // the three demo invoices below use 0001-0003
    // After-sales (views/payments.js, installations.js, customers.js, tickets.js): made up for the demo and the manual's pictures.
    invoices: {
      "INV-2026-0001": { no: "INV-2026-0001", rev: 1, status: "issued", issued_at: iso(9), order_id: "", customer: { name: "Farzana Rahman", phone: "01718221043", address: "Mirpur 10, Dhaka" },
        lines: [{ name: "VenGuard complete kit (detector, valve, relay)", qty: 1, unit_price: 3500, amount: 3500 }], subtotal: 3500, promo_discount: 0, extra_discount: 0, delivery: 0, vat_rate: 0, vat: 0,
        total: 3500, paid: 3500, due: 0, payment_method: "bKash", notes: "", payments: [{ at: iso(9), amount: 500, method: "bKash", ref: "BK7Q2X9MDE", by: "support@example.com" }, { at: iso(2), amount: 3000, method: "Cash", by: "support@example.com" }] },
      "INV-2026-0002": { no: "INV-2026-0002", rev: 1, status: "issued", issued_at: iso(5), order_id: "", customer: { name: "Imran Hossain", phone: "01739638107", address: "Mirpur 10, Dhaka" },
        lines: [{ name: "VenGuard complete kit (detector, valve, relay)", qty: 1, unit_price: 1900, amount: 1900 }], subtotal: 1900, promo_discount: 0, extra_discount: 0, delivery: 0, vat_rate: 0, vat: 0,
        total: 1900, paid: 1000, due: 900, payment_method: "bKash", notes: "", payments: [{ at: iso(5), amount: 1000, method: "Nagad", ref: "NG41H7T2", by: "support@example.com" }] },
      "INV-2026-0003": { no: "INV-2026-0003", rev: 1, status: "issued", issued_at: iso(1), order_id: "", customer: { name: "Rose View Tower (4 flats)", phone: "01811000222", address: "Mirpur 10, Dhaka" },
        lines: [{ name: "VenGuard complete kit (detector, valve, relay)", qty: 1, unit_price: 3500, amount: 3500 }], subtotal: 3500, promo_discount: 0, extra_discount: 0, delivery: 0, vat_rate: 0, vat: 0,
        total: 3500, paid: 3500, due: 0, payment_method: "bKash", notes: "", payments: [{ at: iso(1), amount: 3500, method: "Bank transfer", ref: "DBBL-55120", by: "oasisnextbd@gmail.com" }] },
    },
    technicians: {
      tc1: { name: "Rafiq Mia", phone: "01710000001", area: "Mirpur, Pallabi", district: "Dhaka", active: true, notes: "Trained Oct 2026", created_at: iso(30), updated_at: iso(30), updated_by: "oasisnextbd@gmail.com" },
      tc2: { name: "Sumon Das", phone: "01810000002", area: "Board Bazar, Tongi", district: "Gazipur", dealer_code: "DH-042", active: true, created_at: iso(20), updated_at: iso(20), updated_by: "oasisnextbd@gmail.com" },
    },
    installations: {
      in1: { name: "Farzana Rahman", phone: "01718221043", address: "House 12, Road 3", area: "Mirpur 10", district: "Dhaka", package: "complete", units: 1, scheduled_date: day(-1), slot: "9 am – 12 pm",
        technician_id: "tc1", technician_name: "Rafiq Mia", status: "scheduled", checklist: { detector: true, valve: true }, device_ids: [], notes: "4th floor, lift", order_id: "", created_at: iso(3), created_by: "support@example.com", updated_at: iso(0.2), updated_by: "support@example.com" },
      in2: { name: "Imran Hossain", phone: "01739638107", address: "", area: "Board Bazar", district: "Gazipur", package: "detector_relay", units: 1, scheduled_date: "", slot: "",
        technician_id: "", technician_name: "", status: "to_schedule", checklist: {}, device_ids: [], notes: "", order_id: "", created_at: iso(1), created_by: "support@example.com", updated_at: iso(1), updated_by: "support@example.com" },
      in3: { name: "Taslima Begum", phone: "01711044172", address: "Flat 5C", area: "Agrabad", district: "Chattogram", package: "complete", units: 1, scheduled_date: day(6), slot: "3 pm – 6 pm",
        technician_id: "tc2", technician_name: "Sumon Das", status: "tested", checklist: { detector: true, valve: true, relay: true, test: true, reset: true, app: true }, device_ids: ["VG-0001A3"], done_at: iso(6), customer_id: "cu1", notes: "", order_id: "", created_at: iso(10), created_by: "support@example.com", updated_at: iso(6), updated_by: "support@example.com" },
    },
    customers: {
      cu1: { name: "Taslima Begum", phone: "01711044172", address: "Flat 5C", area: "Agrabad", district: "Chattogram", package: "complete", units: 1, device_ids: ["VG-0001A3"], install_date: day(6), warranty_until: "", plan_until: day(-20), installation_id: "in3", notes: "", created_at: iso(6), created_by: "support@example.com", updated_at: iso(6), updated_by: "support@example.com" },
      cu2: { name: "Rose View Tower (4 flats)", phone: "01811000222", address: "Road 7", area: "Dhanmondi", district: "Dhaka", package: "complete", units: 4, device_ids: ["VG-0002B1", "VG-0002B2", "VG-0002B3", "VG-0002B4"], install_date: day(40), warranty_until: "", plan_until: day(-300), notes: "Landlord: Mr Karim", created_at: iso(40), created_by: "oasisnextbd@gmail.com", updated_at: iso(40), updated_by: "oasisnextbd@gmail.com" },
    },
    tickets: {
      tk1: { customer_id: "cu1", name: "Taslima Begum", phone: "01711044172", kind: "safety", subject: "Alarm sounded at night, smell of gas", details: "Called at 11 pm; valve closed itself.", priority: "urgent", status: "in_progress", assigned_to: "support@example.com",
        notes: [{ at: iso(0.3), by: "support@example.com", note: "Told her to keep windows open and not to switch anything; Rafiq visiting tomorrow 10 am.", status: "in_progress" }], created_at: iso(0.35), created_by: "support@example.com", updated_at: iso(0.3), updated_by: "support@example.com" },
      tk2: { customer_id: "cu2", name: "Rose View Tower (4 flats)", phone: "01811000222", kind: "question", subject: "How to add a second phone to the app", details: "", priority: "normal", status: "waiting", assigned_to: "marketing@example.com",
        notes: [{ at: iso(2), by: "marketing@example.com", note: "Sent the App tour link; waiting for him to try.", status: "waiting" }], created_at: iso(3), created_by: "support@example.com", updated_at: iso(2), updated_by: "marketing@example.com" },
      tk3: { customer_id: "", name: "Nusrat Jahan", phone: "01755000333", kind: "warranty", subject: "Relay does not start the hood", details: "Bought through dealer DH-042.", priority: "normal", status: "resolved", resolved_at: iso(8), assigned_to: "support@example.com",
        notes: [{ at: iso(8), by: "support@example.com", note: "Loose wire at the hood; fixed on visit.", status: "resolved" }], created_at: iso(10), created_by: "support@example.com", updated_at: iso(8), updated_by: "support@example.com" },
    },
    activity: { a1: { at: iso(0.1), user: "support@example.com", action: "order_update", ref: Object.keys(orders)[0], detail: "status → contacted" } },
  };
}
