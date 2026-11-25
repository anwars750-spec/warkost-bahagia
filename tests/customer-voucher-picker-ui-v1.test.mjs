import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/CustomerQrisOnlyRuntime.js", "utf8");

test("voucher list is converted into a popup picker", () => {
  assert.match(source, /warkost-voucher-picker-list/);
  assert.match(source, /is-voucher-picker-open/);
  assert.match(source, /Pilih Promo/);
  assert.match(source, /Ganti Promo/);
});

test("voucher picker clearly states promotions cannot be combined", () => {
  assert.match(source, /Promo tidak dapat digabungkan/);
  assert.match(source, /Pilih satu promo/);
});

test("voucher picker supports backdrop and escape close", () => {
  assert.match(source, /warkost-voucher-picker-backdrop/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /closeVoucherPicker/);
});
