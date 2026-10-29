import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("app/CustomerLoyaltyPickerRuntime.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");

const customerPage = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("loyalty summary keeps points visible and adds redeem action", () => {
  assert.match(runtime, /\.loyalty-checkout-card \.loyalty-summary/);
  assert.match(runtime, /Redeem Poin/);
  assert.match(runtime, /warkost-loyalty-picker-trigger/);
});

test("loyalty reward list is converted into popup picker", () => {
  assert.match(runtime, /warkost-loyalty-picker-list/);
  assert.match(runtime, /is-loyalty-picker-open/);
  assert.match(runtime, /Reward loyalty tidak dapat digabung dengan promo biasa/);
});

test("loyalty picker supports backdrop and escape close", () => {
  assert.match(runtime, /warkost-loyalty-picker-backdrop/);
  assert.match(runtime, /event\.key === "Escape"/);
  assert.match(runtime, /closeLoyaltyPicker/);
});

test("loyalty picker runtime is mounted inside the Customer boundary", () => {
  assert.match(customerPage, /CustomerLoyaltyPickerRuntime/);
  assert.match(customerPage, /<CustomerLoyaltyPickerRuntime \/>/);
});
