import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const runtime = fs.readFileSync(
  fileURLToPath(new URL("../app/CustomerQrisOnlyRuntime.js", import.meta.url)),
  "utf8",
);

test("fulfillment choice receives dedicated pickup and delivery icon styling", () => {
  assert.match(runtime, /customer-fulfillment-option:first-child::before/);
  assert.match(runtime, /customer-fulfillment-option:nth-child\(2\)::before/);
});

test("pickup hides checkout address actions", () => {
  assert.match(runtime, /mode === "PICKUP"/);
  assert.match(runtime, /container\.style\.setProperty\("display", "none", "important"\)/);
});

test("delivery keeps one location launcher and removes duplicates", () => {
  assert.match(runtime, /const \[primaryLauncher, \.\.\.duplicates\] = launchers/);
  assert.match(runtime, /duplicates\.forEach\(\(button\) => button\.remove\(\)\)/);
  assert.match(runtime, /quick-address-toggle:not\(\.wloc-location-launcher\)/);
});
