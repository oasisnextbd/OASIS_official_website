// Money and stock rules of the dashboard. Run: node --test team-dashboard/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { promoProblem, promoDiscount, totals, stockNeeds, stockDelta, invoiceNo, channelOf } from "../js/calc.js";

test("promo codes: switched off, dates and usage limit", () => {
  const p = { active: true, starts: "2026-10-01", ends: "2026-10-31", max_uses: 2, used: 1 };
  assert.equal(promoProblem(p, "2026-10-15"), "");
  assert.match(promoProblem(p, "2026-09-30"), /starts/);
  assert.match(promoProblem(p, "2026-11-01"), /ended/);
  assert.match(promoProblem({ ...p, used: 2 }, "2026-10-15"), /maximum/);
  assert.match(promoProblem({ ...p, active: false }, "2026-10-15"), /off/);
  assert.match(promoProblem(null), /does not exist/);
  assert.equal(promoProblem({ active: true, max_uses: 0, used: 99 }, "2026-10-15"), "");
});

test("promo discount never goes over the amount", () => {
  assert.equal(promoDiscount({ type: "percent", value: 10 }, 29000), 2900);
  assert.equal(promoDiscount({ type: "percent", value: 150 }, 1000), 1000);
  assert.equal(promoDiscount({ type: "amount", value: 500 }, 300), 300);
  assert.equal(promoDiscount(null, 300), 0);
});

test("invoice totals: discounts, delivery, VAT, paid and due", () => {
  const t = totals({ lines: [{ qty: 2, unit_price: 14500 }, { qty: "1", unit_price: "1000" }], promo: { type: "percent", value: 10 }, extra_discount: 400, delivery: 500, vat_rate: 5, paid: 500 });
  assert.equal(t.subtotal, 30000);
  assert.equal(t.promo_discount, 3000);
  assert.equal(t.extra_discount, 400);
  assert.equal(t.vat, Math.round((26600 + 500) * 0.05));
  assert.equal(t.total, 26600 + 500 + 1355);
  assert.equal(t.due, t.total - 500);
  assert.equal(totals({ lines: [{ qty: 1, unit_price: 100 }], extra_discount: 999 }).total, 0);
});

test("stock: packages take their parts; a revision takes only the difference", () => {
  const products = { complete: { components: { DET: 1, VALVE: 1, RELAY: 1 } }, dr: { components: { DET: 1, RELAY: 1 } } };
  const a = stockNeeds([{ product_id: "complete", qty: 2 }, { product_id: "dr", qty: 1 }, { sku: "VALVE", qty: 1 }, { name: "Installation", qty: 1 }], products);
  assert.deepEqual(a, { DET: 3, VALVE: 3, RELAY: 3 });
  assert.deepEqual(stockDelta(a, { DET: 4, VALVE: 3 }), { DET: 1, RELAY: -3 });
});

test("invoice numbers and marketing channels", () => {
  assert.equal(invoiceNo("inv", 2026, 7), "INV-2026-0007");
  assert.equal(invoiceNo("", 2026, 12345), "INV-2026-12345");
  assert.equal(channelOf({ utm_source: "fb" }), "facebook");
  assert.equal(channelOf({ heard_from: "whatsapp", dealer_code: "DH-042" }), "dealer");
  assert.equal(channelOf({ heard_from: "fair" }), "fair");
  assert.equal(channelOf({}), "");
});

import { daysUntil, nextRenewal, monthlyCost, renewalState } from "../js/calc.js";
test("subscriptions: renewal dates, reminders and monthly cost", () => {
  assert.equal(daysUntil("2026-11-01", "2026-10-18"), 14);
  assert.equal(daysUntil("2026-10-01", "2026-10-18"), -17);
  assert.equal(nextRenewal("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextRenewal("2024-02-29", "yearly"), "2025-02-28");
  assert.equal(nextRenewal("2026-10-18", "quarterly"), "2027-01-18");
  assert.equal(nextRenewal("2026-10-18", "free"), "");
  assert.equal(monthlyCost({ cost: 2400, cycle: "yearly" }), 200);
  assert.equal(monthlyCost({ cost: 500, cycle: "once" }), 0);
  assert.equal(renewalState({ renews_on: "2026-11-01", cycle: "yearly" }, "2026-10-18"), "soon");
  assert.equal(renewalState({ renews_on: "2026-11-01", cycle: "yearly", remind_days: 7 }, "2026-10-18"), "ok");
  assert.equal(renewalState({ renews_on: "2026-10-01", cycle: "monthly" }, "2026-10-18"), "overdue");
  assert.equal(renewalState({ cycle: "free" }, "2026-10-18"), "none");
});

test("ratings: average, count and spread per kind; missing or invalid stars are skipped", async () => {
  const { ratingSummary } = await import("../js/calc.js");
  const rows = [{ website: 5, product: 4 }, { website: 4 }, { website: 4, service: 1 }, { website: "x" }, { website: 9 }, {}];
  assert.deepEqual(ratingSummary(rows, "website"), { n: 3, avg: 4.3, dist: [0, 0, 0, 2, 1] });
  assert.deepEqual(ratingSummary(rows, "product"), { n: 1, avg: 4, dist: [0, 0, 0, 1, 0] });
  assert.deepEqual(ratingSummary([], "service"), { n: 0, avg: null, dist: [0, 0, 0, 0, 0] });
});

test("tasks: state, grouping by kind, on time, monthly summary", async () => {
  const { taskState, myWork, onTime, taskStats } = await import("../js/calc.js");
  const today = "2026-10-21";
  const T = (o) => ({ assignee: "a@x", kind: "daily", due: today, status: "open", ...o });
  assert.equal(taskState(T({}), today), "open");
  assert.equal(taskState(T({ due: "2026-10-20" }), today), "overdue");
  assert.equal(taskState(T({ due: "2026-10-20", status: "submitted" }), today), "submitted");
  assert.equal(taskState(T({ status: "returned" }), today), "returned");
  const w = myWork([T({ id: 1, due: "2026-10-22" }), T({ id: 2, due: "2026-10-19" }), T({ id: 3, kind: "milestone", due: "2026-12-01" }),
    T({ id: 4, status: "approved", reviewed_at: "2026-10-01T10:00:00Z" }), T({ id: 5, status: "approved", reviewed_at: "2026-10-20T10:00:00Z" }), T({ id: 6, kind: "yearly" })], today);
  assert.deepEqual(w.daily.map((t) => t.id), [2, 1, 5]);          // overdue first, old approvals hidden
  assert.deepEqual(w.milestone.map((t) => t.id), [3]);
  assert.equal(onTime(T({ submitted_at: "2026-10-21T17:30:00Z" })), true);    // 23:30 in Dhaka
  assert.equal(onTime(T({ submitted_at: "2026-10-21T18:30:00Z" })), false);   // 00:30 next day in Dhaka
  const s = taskStats([T({ submitted_at: "2026-10-21T10:00:00Z", status: "approved" }), T({ due: "2026-10-10", submitted_at: "2026-10-12T10:00:00Z", status: "submitted", returned_count: 1 }),
    T({ due: "2026-10-15" }), T({ assignee: "b@x", due: "2026-11-02" })], "2026-10", today);
  assert.deepEqual(s, [{ assignee: "a@x", name: "", assigned: 3, onTime: 1, late: 1, approved: 1, sentBack: 1, overdue: 1 }]);
});

test("online status and access end date", async () => {
  const { presenceOf, endOfDayDhaka } = await import("../js/calc.js");
  const now = Date.parse("2026-10-21T10:00:00Z");
  assert.equal(presenceOf({ last_seen: "2026-10-21T09:59:00Z", online: true }, now).online, true);
  assert.equal(presenceOf({ last_seen: "2026-10-21T09:50:00Z", online: true }, now).online, false);
  assert.equal(presenceOf({ last_seen: "2026-10-21T09:59:30Z", online: false }, now).online, false);
  assert.equal(presenceOf(null, now).online, false);
  assert.equal(new Date(endOfDayDhaka("2026-11-30")).toISOString(), "2026-11-30T17:59:59.000Z");
});
