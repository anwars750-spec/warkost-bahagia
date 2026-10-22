import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const runtime = fs.readFileSync(
  fileURLToPath(new URL("../app/CustomerFulfillmentRuntime.js", import.meta.url)),
  "utf8",
);
const route = fs.readFileSync(
  fileURLToPath(new URL("../app/api/pickup-address/route.js", import.meta.url)),
  "utf8",
);

test("customer fulfillment UI menawarkan pickup dan delivery sebelum cart", () => {
  assert.match(runtime, /Ambil di tempat/);
  assert.match(runtime, /Dikirim ke lokasi/);
  assert.match(runtime, /cart-checkout-card/);
  assert.match(runtime, /delivery-checkout-card/);
});

test("pickup memakai alamat internal Warkost dengan koordinat bisnis", () => {
  assert.match(route, /Ambil di Warkost/);
  assert.match(route, /business_latitude/);
  assert.match(route, /business_longitude/);
  assert.match(route, /is_default,active\) VALUES\(\?,\?,\?,\?,\?,0,1\)/);
});
