import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const checkoutRoute = read("../app/api/checkout/route.js");
const pickupRoute = read("../app/api/pickup-address/route.js");
const pickupHelper = read("../lib/pickup.mjs");

test("pickup checkout resolves the internal Warkost address on the server", () => {
  assert.match(checkoutRoute, /fulfillmentType === "PICKUP"/);
  assert.match(checkoutRoute, /ensurePickupAddress\(user\.id\)/);
  assert.match(checkoutRoute, /addressId = pickupAddress\.id/);
});

test("pickup address UI route and checkout share one resolver", () => {
  assert.match(pickupRoute, /ensurePickupAddress\(user\.id\)/);
  assert.match(pickupHelper, /Ambil di Warkost/);
  assert.match(pickupHelper, /Warkost Bahagia · Ambil di tempat/);
});
