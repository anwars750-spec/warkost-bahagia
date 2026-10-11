import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const gate = fs.readFileSync(new URL("../app/AdminShiftGateRuntime.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../app/AdminSettlementStabilityBridge.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");

test("known active Admin shift stays sticky across transient UI refresh", () => {
  assert.match(gate, /shiftActiveRef\.current = hasShift/);
  assert.match(gate, /if \(!shiftActiveRef\.current && adminSurface\)/);
  assert.doesNotMatch(gate, /setInterval\([^)]*900/);
});

test("end shift submission pauses shift gate reconciliation", () => {
  assert.match(gate, /warkost:admin-shift-submitting/);
  assert.match(gate, /submittingRef\.current/);
  assert.match(bridge, /admin-shift-settlement-primary/);
  assert.match(bridge, /warkost:admin-shift-submitting/);
});

test("cash live DOM unlocks mandatory shift gate through stability bridge", () => {
  assert.match(bridge, /admin-cash-live/);
  assert.match(bridge, /warkost:admin-shift-started/);
});

test("stability bridge is mounted globally", () => {
  assert.match(layout, /import AdminSettlementStabilityBridge/);
  assert.match(layout, /<AdminSettlementStabilityBridge \/>/);
});
