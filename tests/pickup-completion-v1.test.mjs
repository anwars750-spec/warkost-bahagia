import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync("app/api/pickup-complete/route.js", "utf8");
const runtime = fs.readFileSync("app/PickupOrderCompletionRuntime.js", "utf8");

test("pickup completion is restricted to admin/owner and READY pickup orders", () => {
  assert.match(api, /required\(user, \["ADMIN", "OWNER"\]\)/);
  assert.match(api, /order\.address_label !== PICKUP_LABEL/);
  assert.match(api, /order\.status !== "READY"/);
  assert.match(api, /UPDATE orders SET status='DELIVERED'/);
});

test("pickup completion keeps QRIS paid gate and awards loyalty", () => {
  assert.match(api, /payment_method === "QRIS" && order\.payment_status !== "PAID"/);
  assert.match(api, /awardOrderPoints/);
  assert.match(api, /PICKUP_ORDER_COMPLETED/);
});

test("admin runtime exposes pickup completion and customer pickup wording", () => {
  assert.match(runtime, /Pesanan Sudah Diambil/);
  assert.match(runtime, /Siap Diambil/);
  assert.match(runtime, /Pesanan siap diambil di Warkost/);
  assert.match(runtime, /\/api\/pickup-complete/);
});
