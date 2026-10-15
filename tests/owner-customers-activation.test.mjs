import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("app/OwnerCustomersCenter.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");

test("Owner Customer Center is mounted globally", () => {
  assert.match(layout, /import OwnerCustomersCenter from "\.\/OwnerCustomersCenter"/);
  assert.match(layout, /<OwnerCustomersCenter\s*\/>/);
  assert.match(layout, /import "\.\/owner-customers-center\.css"/);
});

test("Owner Customer Center finds the legacy customer panel independent of main wrapper", () => {
  assert.match(source, /document\.querySelectorAll\("section\.panel"\)/);
  assert.doesNotMatch(source, /document\.querySelectorAll\("main section\.panel"\)/);
  assert.match(source, /owner-customers-center-active/);
  assert.match(source, /ownerCustomersLegacy/);
});

test("Owner Customer Center keeps customer controls and richer metrics", () => {
  assert.match(source, /\/api\/owner-customers/);
  assert.match(source, /\/api\/customer-active/);
  assert.match(source, /lifetime_value/);
  assert.match(source, /last_order_at/);
  assert.match(source, /Poin loyalty/);
});
