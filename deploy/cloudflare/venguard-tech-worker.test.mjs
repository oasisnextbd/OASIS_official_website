// node --test deploy/cloudflare/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPath, mapLocation, ORIGIN } from "./venguard-tech-worker.js";

test("venguard.tech paths map to the VenGuard part of the GitHub Pages site", () => {
  assert.equal(mapPath("/"), "/VENGuard/");
  assert.equal(mapPath("/en/"), "/VENGuard/en/");
  assert.equal(mapPath("/pre-order/"), "/VENGuard/pre-order/");
  assert.equal(mapPath("/assets/css/venguard.css"), "/VENGuard/assets/css/venguard.css");
  assert.equal(mapPath("/team/"), "/team/");
  assert.equal(mapPath("/team"), "/team");
  assert.equal(mapPath("/team/js/app.js"), "/team/js/app.js");
  assert.equal(mapPath("/VENGuard/assets/img/logo/x.svg"), "/VENGuard/assets/img/logo/x.svg");
  assert.equal(mapPath("/teamwork/"), "/VENGuard/teamwork/");           // only the exact folders are kept
});

test("GitHub redirects come back to venguard.tech", () => {
  assert.equal(mapLocation(ORIGIN + "/VENGuard/en/"), "https://venguard.tech/en/");
  assert.equal(mapLocation(ORIGIN + "/VENGuard"), "https://venguard.tech/");
  assert.equal(mapLocation(ORIGIN + "/team/"), "https://venguard.tech/team/");
  assert.equal(mapLocation("https://example.com/x"), "https://example.com/x");
  assert.equal(mapLocation(null), null);
});
