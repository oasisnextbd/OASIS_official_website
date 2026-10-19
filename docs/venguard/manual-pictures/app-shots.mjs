// Customer guide pictures: the Android app (native layout) against the local Firebase emulators.
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { mark, unmark } from "./mark.mjs";
const [, , OUT, CTRL, lang] = process.argv;   // CTRL = folder shared with node-dash.mjs
const L = (bn, en) => (lang === "bn" ? bn : en);
const cmd = (c) => appendFileSync(CTRL + "/cmd.txt", c + "\n");
const log = (m) => console.log(`[${lang}] ${m}`);
while (!existsSync(CTRL + "/emu.json")) await new Promise((r) => setTimeout(r, 500));
const { id, code } = JSON.parse(readFileSync(CTRL + "/emu.json", "utf8"));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|firestore\.googleapis/, (r) => r.abort());
await ctx.addInitScript((lang) => {
  window.androidBridge = { postMessage() {} }; window.Capacitor = { isNativePlatform: () => true };
  try { if (!sessionStorage.getItem("s")) { localStorage.setItem("vg_app_v1", JSON.stringify({ lang, theme: "light", sound: true })); sessionStorage.setItem("s", "1"); } } catch (e) {}
}, lang);
const p = await ctx.newPage();
p.on("pageerror", (e) => { if (!/LocalNotifications|Haptics|StatusBar|CapacitorUpdater|not implemented/.test(e.message)) log("ERR " + e.message); });
const shot = async (name, items = []) => { await mark(p, items); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/${name}.png` }); await unmark(p); };
const hash = async (h) => { await p.evaluate((h) => { location.hash = h; }, h); await p.waitForTimeout(700); };
try {
  await p.goto("http://localhost:5173/#/"); await p.waitForTimeout(3200);
  await shot("01-signin", [[p.getByRole("button", { name: L("নতুন অ্যাকাউন্ট খুলুন", "Create an account"), exact: true }), 1]]);
  await p.getByRole("button", { name: L("নতুন অ্যাকাউন্ট খুলুন", "Create an account"), exact: true }).click();
  await p.fill('input[type="email"]', `rahima.${lang}@example.com`);
  await p.fill('input[type="password"]', "a-strong-password");
  await shot("02-create", [[p.locator('input[type="email"]'), 1], [p.locator('input[type="password"]'), 2], [p.getByRole("button", { name: L("অ্যাকাউন্ট খুলুন", "Create account"), exact: true }), 3]]);
  await p.getByRole("button", { name: L("অ্যাকাউন্ট খুলুন", "Create account"), exact: true }).click();
  await p.waitForSelector(".phome", { timeout: 20000 }); await p.waitForTimeout(600);
  await shot("03-empty", [[p.locator('.phome-head a[href="#/add"]'), 1]]);
  await p.locator('.phome-head a[href="#/add"]').click(); await p.waitForTimeout(500);
  const inputs = p.locator("form input");
  await inputs.nth(0).fill("VG-0001A3"); await inputs.nth(1).fill("K7Q2M9XW4TPA");
  await inputs.nth(2).fill(L("বাসা", "Home")); await inputs.nth(3).fill(L("মিরপুর ১১", "Mirpur 11"));
  await p.evaluate(() => document.activeElement.blur());
  await shot("04-add", [[inputs.nth(0), 1], [inputs.nth(1), 2], [inputs.nth(2), 3], [inputs.nth(3), 4], [p.locator('form button[type="submit"]'), 5]]);
  await inputs.nth(0).fill(id); await inputs.nth(1).fill(code);
  await p.locator('form button[type="submit"]').click();
  await p.waitForSelector(".pdev", { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector(".pdev-hero .pill")?.textContent.length > 0, null, { timeout: 20000 }); await p.waitForTimeout(1500);
  await hash("#/");
  await shot("05-home", [[p.locator(".dev-panel").first(), 1, 4]]);
  await p.locator(".dev-panel").first().click(); await p.waitForTimeout(1200);
  await shot("06-device", [[p.locator(".pdev-hero .pill"), 1], [p.locator(".gasbar"), 2, 10], [p.locator(".pdev-stats"), 3, 2]]);
  await p.locator(".pdev-parts").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 260)); await p.waitForTimeout(300);
  await shot("07-device-more", [[p.locator(".pdev-parts"), 1, 2], [p.getByRole("button", { name: L("এখনই গ্যাস বন্ধ করুন", "Close the gas now") }), 2]]);
  await p.evaluate(() => scrollTo(0, 0));
  cmd("leak");
  await p.waitForSelector(".pshell--alarm", { timeout: 40000 }); await p.waitForTimeout(3500);
  await shot("08-alarm", [[p.locator(".gasbar"), 1, 10], [p.locator(".leak-banner"), 2, 2]]);
  await p.waitForSelector(".mitigated", { timeout: 60000 }); await p.waitForTimeout(400);
  await shot("09-mitigated", [[p.locator(".mitigated"), 1, 2]]);
  await p.locator(".mitigated-x").click();
  const steps = p.locator("ol.steps").first();
  await steps.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 120)); await p.waitForTimeout(300);
  await shot("10-reset", [[steps.locator("xpath=.."), 1, 2]]);
  cmd("reset"); await p.waitForTimeout(2500); cmd("test"); await p.waitForTimeout(2500);
  await hash("#/alerts");
  await shot("11-history", [[p.locator(".phist-card").first(), 1, 2]]);
  await hash("#/");
  await p.getByRole("button", { name: L("সম্পাদনা", "Edit") }).click(); await p.waitForTimeout(300);
  await shot("12-edit", [[p.getByRole("button", { name: L("সম্পাদনা", "Edit") }).or(p.getByRole("button", { name: L("শেষ", "Done") })), 1], [p.locator(".dev-x"), 2, 4]]);
  await p.locator(".dev-x").click(); await p.waitForTimeout(300);
  await shot("13-remove", [[p.getByRole("button", { name: L("সরান", "Remove"), exact: true }), 1]]);
  await p.getByRole("button", { name: L("বাতিল", "Cancel") }).click();
  await p.getByRole("button", { name: L("শেষ", "Done") }).click();
  await hash("#/account");
  await shot("14-profile", [[p.locator(".ptop-profile"), 1, 3], [p.locator(".seg").first(), 2], [p.locator(".seg").nth(1), 3], [p.locator('a[href="#/family"]'), 4, 2]]);
  await p.locator('a[href="#/family"]').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, 200)); await p.waitForTimeout(300);
  await shot("15-signout", [[p.getByRole("button", { name: L("সাইন আউট", "Sign out") }), 1, 2]]);
  log("done");
} catch (e) {
  log("FAILED: " + e.message.split("\n")[0]); await p.screenshot({ path: `${OUT}/fail.png` });
} finally { cmd("stop"); await b.close(); }
