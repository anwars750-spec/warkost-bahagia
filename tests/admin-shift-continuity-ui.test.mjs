import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settlementSource = await readFile(
  new URL("../app/AdminShiftSettlementRuntime.js", import.meta.url),
  "utf8",
);
const gateSource = await readFile(
  new URL("../app/AdminShiftGateRuntime.js", import.meta.url),
  "utf8",
);
const cashSource = await readFile(
  new URL("../app/AdminCashControlCenter.js", import.meta.url),
  "utf8",
);

test("end shift submission is bounded, idempotent by shift, and hands off to Printer", () => {
  assert.match(settlementSource, /AbortController/);
  assert.match(settlementSource, /SETTLEMENT_TIMEOUT/);
  assert.match(settlementSource, /recoverSubmission/);
  assert.match(settlementSource, /shiftId/);
  assert.match(settlementSource, /data-admin-nav=\"Printer\"/);
  assert.match(settlementSource, /window\.print\(\)/);
  assert.match(settlementSource, /warkost:admin-shift-ended/);
});

test("admin shift gate only opens mandatory Setoran when shift is actually locked", () => {
  assert.match(gateSource, /warkost:admin-session-restored/);
  assert.match(gateSource, /admin-shift-gate-checking/);
  assert.match(gateSource, /if \(!isAdmin \|\| checking \|\| !locked\) return/);
  assert.match(gateSource, /autoOpened\.current = hasShift/);
  assert.doesNotMatch(gateSource, /setInterval\([^)]*900/);
});

test("cash control hydrates persisted shift after relogin and emits deterministic start event", () => {
  assert.match(cashSource, /warkost:admin-session-restored/);
  assert.match(cashSource, /current_shift:/);
  assert.match(cashSource, /load\(\{ force: true \}\)/);
  assert.match(cashSource, /warkost:admin-shift-started/);
  assert.match(cashSource, /detail: \{ currentShift \}/);
});
