import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const runtime = fs.readFileSync(
  fileURLToPath(new URL("../app/CustomerQrisRuntime.js", import.meta.url)),
  "utf8",
);
const customerPage = fs.readFileSync(
  fileURLToPath(new URL("../app/page.js", import.meta.url)),
  "utf8",
);

test("customer QRIS payload and visual QR are restricted to pending payment", () => {
  assert.match(
    customerPage,
    /payment\.qr_payload\s*&&\s*payment\.status\s*===\s*"PENDING"/,
  );
  assert.match(runtime, /const removeStaleRuntimeViews = \(\) =>/);
  assert.match(runtime, /if \(!pendingCode\) container\.remove\(\)/);
});

test("successful QRIS UAT payment removes the QR before broadcasting PAID", () => {
  assert.match(
    runtime,
    /container\.remove\(\);\s*window\.dispatchEvent\(\s*new CustomEvent\("warkost:qris-demo-paid"/s,
  );
});

test("QRIS simulation controls remain gated by the demo-complete endpoint", () => {
  assert.match(runtime, /async function demoModeEnabled\(\)/);
  assert.match(runtime, /fetch\("\/api\/payment\/demo-complete"/);
  assert.match(runtime, /data\?\.enabled === true/);
  assert.match(runtime, /if \(demoEnabled\)/);
});
