import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeSource = await readFile(
  new URL("../app/CustomerHelpRoutingRuntime.js", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/layout.js", import.meta.url),
  "utf8",
);

test("customer help chat stays inside Customer Service and call action is hidden", () => {
  assert.match(layoutSource, /<CustomerHelpRoutingRuntime \/>/);
  assert.match(runtimeSource, /\.customer-help \.help-actions a\[href\^="tel:"\]/);
  assert.match(runtimeSource, /display: none !important/);
  assert.match(runtimeSource, /support-communication-card\.primary-chat/);
  assert.match(runtimeSource, /support-admin-action/);
  assert.match(runtimeSource, /aria-label="Bantuan"/);
});
