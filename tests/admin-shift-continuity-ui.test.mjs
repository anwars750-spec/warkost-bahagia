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

test("end shift submission has timeout reconciliation instead of infinite busy state", () => {
  assert.match(settlementSource, /AbortController/);
  assert.match(settlementSource, /SETTLEMENT_TIMEOUT/);
  assert.match(settlementSource, /recoverSubmission/);
  assert.match(settlementSource, /recent_settlements/);
  assert.match(settlementSource, /warkost:admin-shift-ended/);
});

test("admin shift gate restores persisted shift after relogin without aggressive polling", () => {
  assert.match(gateSource, /warkost:admin-session-restored/);
  assert.match(gateSource, /admin-shift-gate-checking/);
  assert.match(gateSource, /6000/);
  assert.doesNotMatch(gateSource, /}, 900\);/);
  assert.match(gateSource, /resolvedRef/);
});
