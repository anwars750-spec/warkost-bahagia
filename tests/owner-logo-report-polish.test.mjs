import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridge = await readFile(new URL("../app/OwnerControlDirectBridge.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/owner-business-report/route.js", import.meta.url), "utf8");

test("Owner logo returns to the real Dashboard navigation", () => {
  assert.match(bridge, /header\.top \.brand-button/);
  assert.match(bridge, /data-owner-nav-key=\\?"Dashboard\\?"/);
  assert.match(bridge, /retry\(openOwnerDashboard\)/);
});

test("Owner report does not label an empty period as healthy 100", () => {
  assert.match(route, /BELUM ADA DATA/);
  assert.match(route, /kesehatan bisnis belum dapat dinilai/i);
  assert.match(route, /normalizeEmptyBusinessHealth/);
});

test("Owner report has sticky-header scroll offset and neutral empty health styling", () => {
  assert.match(bridge, /scroll-padding-top: 118px/);
  assert.match(bridge, /scroll-margin-top: 118px/);
  assert.match(bridge, /\.obr-health\.belum-ada-data/);
});
