import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const page = read("../app/page.js");
const domain = read("../lib/domain.mjs");
const migration = read("../migrations/029_pickup_fulfillment_type.sql");
const runtime = read("../app/CustomerQrisOnlyRuntime.js");
const pickupAddressRoute = read("../app/api/pickup-address/route.js");

test("checkout renders pickup and delivery natively in React", () => {
  assert.match(page, /Ambil di tempat/);
  assert.match(page, /Dikirim ke lokasi/);
  assert.match(page, /selectFulfillmentMode/);
  assert.match(page, /fulfillmentType:\s*fulfillmentMode/);
  assert.doesNotMatch(runtime, /CustomerFulfillmentRuntime/);
});

test("pickup is persisted as an explicit fulfillment type", () => {
  assert.match(migration, /fulfillment_type/);
  assert.match(migration, /'DELIVERY','PICKUP'/);
  assert.match(domain, /FULFILLMENT_PICKUP/);
  assert.match(domain, /INSERT INTO orders\([\s\S]*fulfillment_type/);
});

test("pickup uses the protected internal Warkost address and zero delivery fee", () => {
  assert.match(pickupAddressRoute, /Ambil di Warkost/);
  assert.match(pickupAddressRoute, /business_latitude/);
  assert.match(pickupAddressRoute, /business_longitude/);
  assert.match(domain, /deliveryFee:\s*0/);
  assert.match(domain, /distanceMeters:\s*0/);
});

test("customer pickup labels distinguish READY and completed states", () => {
  assert.match(page, /Siap Diambil/);
  assert.match(page, /Sudah Diambil \/ Selesai/);
  assert.match(page, /Ambil langsung di Warkost · tanpa Driver/);
});
