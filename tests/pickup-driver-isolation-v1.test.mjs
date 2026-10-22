import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ordersRoute = fs.readFileSync("app/api/orders/route.js", "utf8");
const singleClaimRoute = fs.readFileSync(
  "app/api/claim-delivery/route.js",
  "utf8",
);
const batchClaimRoute = fs.readFileSync(
  "app/api/claim-all-deliveries/route.js",
  "utf8",
);

test("pickup orders are hidden from the driver order queue", () => {
  assert.match(ordersRoute, /Ambil di tempat/);
  assert.match(ordersRoute, /listDriverOrders/);
  assert.match(ordersRoute, /filter/);
});

test("single driver claim rejects pickup orders", () => {
  assert.match(singleClaimRoute, /Pesanan ambil di tempat tidak membutuhkan driver/);
  assert.match(singleClaimRoute, /address_label === PICKUP_LABEL/);
});

test("batch driver claim excludes pickup orders at query level", () => {
  assert.match(batchClaimRoute, /a\.label<>\?/);
  assert.match(batchClaimRoute, /PICKUP_LABEL/);
});
