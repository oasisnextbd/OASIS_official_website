/* Ratings: the stars visitors give in the website footer (the VenGuard device, the website, our service
   and support). Anonymous, one record per browser; a visitor who changes their stars updates that record.
   Founders can delete obvious spam. Website side: setupRatings() in venguard/assets/js/site.js. */

import { esc, fmtN, ago, when, kpi, countBy, hbars, emptyRow, toast, on, ICON } from "../ui.js";
import { S, can, deleteRating } from "../store.js";
import { RATING_FOR, ratingSummary } from "../calc.js";
import { R } from "../redraw.js";

const KEYS = Object.keys(RATING_FOR);
let range = 0;
const inRange = (iso) => !range || (Date.now() - new Date(iso)) / 864e5 <= range;
const starText = (v) => (v ? `<span class="stars-txt" aria-label="${v} of 5">${"★".repeat(v)}<span>${"★".repeat(5 - v)}</span></span>` : '<span class="muted">—</span>');

export default {
  id: "ratings", label: "Ratings", icon: "ratings", deps: ["ratings"],
  visible: () => can("ratings"),
  render() {
    const rows = S.data.ratings.filter((r) => inRange(r.updated_at));
    const sum = Object.fromEntries(KEYS.map((k) => [k, ratingSummary(rows, k)]));
    const label = range ? `last ${range} days` : "all time";
    const seg = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]].map(([v, l]) => `<button type="button" data-act="rt:range" data-v="${v}" aria-pressed="${range === v}">${l}</button>`).join("");
    const few = rows.length && rows.length < 10 ? `<div class="banner">${ICON.info}<div><strong>Only ${fmtN(rows.length)} ${rows.length === 1 ? "person" : "people"} so far.</strong> With so few ratings one visitor moves the average a lot; read each one rather than the average.</div></div>` : "";
    const low = rows.filter((r) => KEYS.some((k) => r[k] && r[k] <= 2)).length;
    const del = can("ratings:delete");
    return `<div class="topline"><div><h1>Ratings</h1><div class="sub">Stars from the website footer, ${label}. Anonymous: no names or phone numbers.</div></div><div class="seg" role="group" aria-label="Period">${seg}</div></div>
      ${few}
      <div class="kpis">${kpi("People who rated", fmtN(rows.length), low ? `${fmtN(low)} gave 1 or 2 stars somewhere` : "nobody gave 1 or 2 stars", true)}
        ${KEYS.map((k) => kpi(RATING_FOR[k], sum[k].avg == null ? "—" : sum[k].avg.toFixed(1) + " / 5", sum[k].n ? `from ${fmtN(sum[k].n)} ${sum[k].n === 1 ? "person" : "people"}` : "no ratings yet")).join("")}</div>
      <div class="grid3">${KEYS.map((k) => `<section class="panel"><h2>${esc(RATING_FOR[k])}</h2>${sum[k].n ? hbars([5, 4, 3, 2, 1].map((s) => [`${s} ★`, sum[k].dist[s - 1]])) : '<p class="muted">No ratings in this period.</p>'}</section>`).join("")}</div>
      <section class="panel" style="margin-top:16px"><h2>Pages they rated from</h2>${hbars(countBy(rows, (r) => pageName(r.page)).slice(0, 8))}</section>
      <h2 class="section-h">Each rating</h2>
      <div class="table-wrap"><table><thead><tr><th>When</th>${KEYS.map((k) => `<th>${esc(RATING_FOR[k])}</th>`).join("")}<th>Page</th><th>Language</th>${del ? "<th></th>" : ""}</tr></thead><tbody>
      ${rows.length ? rows.slice(0, 300).map((r) => `<tr class="no-hover"><td title="${esc(when(r.updated_at))}">${esc(ago(r.updated_at))}</td>${KEYS.map((k) => `<td>${starText(r[k])}</td>`).join("")}
        <td>${esc(pageName(r.page))}</td><td>${r.lang === "bn" ? "Bangla" : "English"}</td>
        ${del ? `<td><button class="btn" data-act="rt:del" data-id="${esc(r.id)}" title="Delete this rating (spam only)">${ICON.trash}Delete</button></td>` : ""}</tr>`).join("")
        : emptyRow(KEYS.length + 3 + (del ? 1 : 0), "No ratings yet. They appear here the moment a visitor taps a star.")}</tbody></table></div>`;
  },
};

/** "/VENGuard/en/how-it-works/" → "How it works"; the home page → "Home". */
const PAGE = { "pre-order": "Pre-order", "thank-you": "Pre-order thank-you", faq: "FAQ", "home-kit": "Home kit", "app-guide": "App guide", "landlords-restaurants": "Landlords & restaurants", "agro-marine": "Agro & marine" };
function pageName(path) {
  const p = String(path || "").replace(/^\/(OASIS_official_website\/)?VENGuard\/?/i, "").replace(/^(en|bn)(\/|$)/, "").replace(/\/$/, "");
  if (!p) return "Home";
  const last = p.split("/").pop();
  if (PAGE[last]) return PAGE[last];
  const s = last.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

on.act("rt:range", (t) => { range = +t.dataset.v; R.draw(); });
on.act("rt:del", async (t) => {
  if (!confirm("Delete this rating? Do this only for spam: it cannot be undone.")) return;
  try { await deleteRating(t.dataset.id); toast("Rating deleted"); } catch (e) { toast("Could not delete: " + e.message); }
});
