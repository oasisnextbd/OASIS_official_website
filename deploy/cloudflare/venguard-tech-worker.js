/* venguard.tech → the VenGuard website and team dashboard, served from GitHub Pages.
 *
 * The site is built and published from this repository to
 *   https://oasisnextbd.github.io/OASIS_official_website/   (OASIS page, /VENGuard/, /Rod_Bondhu/, /team/)
 * A repository can have only one custom domain, so this Cloudflare Worker (free plan) puts the VenGuard
 * part at the root of venguard.tech instead. Visitors keep venguard.tech in the address bar:
 *   venguard.tech/            → /VENGuard/            (the VenGuard website; /en/ is English)
 *   venguard.tech/team/       → /team/                (team dashboard)
 *   venguard.tech/VENGuard/…  → /VENGuard/…           (old links, and the dashboard's ../VENGuard/ files)
 *   www.venguard.tech/…       → 301 to venguard.tech/…
 * Setup (Cloudflare dashboard, once): deploy/cloudflare/README.md. Tests: node --test deploy/cloudflare/
 */
export const ORIGIN = "https://oasisnextbd.github.io/OASIS_official_website";
export const HOST = "venguard.tech";
const KEEP = ["/VENGuard", "/team", "/Rod_Bondhu"];   // paths served as they are

/** Path on GitHub Pages for a path on venguard.tech. */
export function mapPath(path) {
  if (KEEP.some((p) => path === p || path.startsWith(p + "/"))) return path;
  return "/VENGuard" + path;
}

/** GitHub Pages redirects (e.g. a folder without its trailing slash) point at github.io: bring them back here. */
export function mapLocation(location) {
  if (!location || !location.startsWith(ORIGIN + "/")) return location;
  let path = location.slice(ORIGIN.length);
  if (path === "/VENGuard" || path.startsWith("/VENGuard/")) path = path.slice("/VENGuard".length) || "/";
  return "https://" + HOST + path;
}

const FORWARD = ["accept", "accept-encoding", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== HOST) return Response.redirect("https://" + HOST + url.pathname + url.search, 301);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const headers = new Headers();
    for (const h of FORWARD) { const v = request.headers.get(h); if (v) headers.set(h, v); }
    const res = await fetch(ORIGIN + mapPath(url.pathname) + url.search, { method: request.method, headers, redirect: "manual" });
    const out = new Response(res.body, res);
    const loc = res.headers.get("location");
    if (loc) out.headers.set("location", mapLocation(loc));
    return out;
  },
};
