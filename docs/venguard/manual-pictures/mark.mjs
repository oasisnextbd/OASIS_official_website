// Draws numbered orange rings around the elements a step asks you to tap, for the manuals.
export async function mark(page, items) {
  const boxes = [];
  for (const [loc, n, pad = 6] of items) {
    const b = await loc.boundingBox().catch(() => null);
    if (b) boxes.push({ x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2, n });
    else console.log("  (mark", n, "not found)");
  }
  await page.evaluate((boxes) => {
    document.querySelectorAll(".vg-mark").forEach((e) => e.remove());
    const vw = innerWidth;
    for (const b of boxes) {
      const ring = document.createElement("div");
      ring.className = "vg-mark";
      Object.assign(ring.style, { position: "fixed", left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px", border: "3px solid #E85D0C", borderRadius: "14px", boxShadow: "0 0 0 4px rgba(232,93,12,.28)", zIndex: 99999, pointerEvents: "none" });
      const badge = document.createElement("div");
      badge.className = "vg-mark";
      badge.textContent = b.n;
      const left = Math.min(Math.max(b.x - 14, 4), vw - 34), top = Math.max(b.y - 14, 4);
      Object.assign(badge.style, { position: "fixed", left: left + "px", top: top + "px", width: "30px", height: "30px", borderRadius: "50%", background: "#0B2A4A", color: "#fff", font: "800 16px/30px Inter, system-ui, sans-serif", textAlign: "center", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,.3)", zIndex: 100000, pointerEvents: "none" });
      document.body.append(ring, badge);
    }
  }, boxes);
}
export const unmark = (page) => page.evaluate(() => document.querySelectorAll(".vg-mark").forEach((e) => e.remove()));
