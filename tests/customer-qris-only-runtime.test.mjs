import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const runtime = fs.readFileSync(
  fileURLToPath(new URL("../app/CustomerQrisOnlyRuntime.js", import.meta.url)),
  "utf8",
);
const layout = fs.readFileSync(
  fileURLToPath(new URL("../app/layout.js", import.meta.url)),
  "utf8",
);

test("customer checkout runtime hides COD and forces QRIS", () => {
  assert.match(runtime, /value=\"CASH\"/);
  assert.match(runtime, /value=\"QRIS\"/);
  assert.match(runtime, /cash\.disabled = true/);
  assert.match(runtime, /option\.hidden = true/);
  assert.match(runtime, /qris\.click\(\)/);
});

test("QRIS-only runtime is mounted globally", () => {
  assert.match(layout, /import CustomerQrisOnlyRuntime/);
  assert.match(layout, /<CustomerQrisOnlyRuntime \/>/);
});
