import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const service = read("lib/delivery-history.mjs");
const route = read("app/api/delivery-history/route.js");
const center = read("app/DeliveryHistoryCenter.js");
const runtime = read("app/DeliveryHistoryRuntime.js");
const layout = read("app/layout.js");

test("riwayat delivery hanya untuk Manager dan Owner", () => {
  assert.match(service, /\["MANAGER", "OWNER"\]/);
  assert.match(service, /required\(user, HISTORY_ROLES\)/);
  assert.match(runtime, /\["MANAGER", "OWNER"\]\.includes/);
});

test("history hanya membaca delivery selesai dan tidak mengubah status", () => {
  assert.match(service, /o\.fulfillment_type='DELIVERY'/);
  assert.match(service, /o\.status='DELIVERED'/);
  assert.doesNotMatch(service, /UPDATE orders/);
  assert.doesNotMatch(service, /changeStatus/);
});

test("history membawa proof, Driver, customer, payment, dan timeline existing", () => {
  assert.match(service, /LEFT JOIN delivery_proofs/);
  assert.match(service, /driver\.name driver_name/);
  assert.match(service, /customer\.name customer_name/);
  assert.match(service, /p\.method/);
  assert.match(service, /FROM order_events/);
  assert.match(service, /proof_image_url/);
});

test("endpoint delivery history memakai sesi existing dan no-store", () => {
  assert.match(route, /currentUser\(request\)/);
  assert.match(route, /listDeliveryHistory/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});

test("UI menampilkan bukti foto dan timeline read-only", () => {
  assert.match(center, /Riwayat Delivery/);
  assert.match(center, /proof_image_url/);
  assert.match(center, /BUKTI PENGANTARAN/);
  assert.match(center, /TIMELINE ORDER/);
  assert.doesNotMatch(center, /changeStatus/);
  assert.doesNotMatch(center, /status.*POST/);
});

test("launcher Manager tersedia di header desktop dan menu mobile tanpa mengubah navigation core", () => {
  assert.match(runtime, /header\.top nav/);
  assert.match(runtime, /manager-more-menu/);
  assert.match(runtime, /Riwayat Delivery/);
  assert.match(runtime, /item\.textContent\.trim\(\) === "Keluar"/);
});

test("launcher Owner tetap terpasang global dan runtime tetap dimount dari layout", () => {
  assert.match(runtime, /owner-control-grid-v3/);
  assert.match(runtime, /Riwayat Delivery/);
  assert.match(layout, /import DeliveryHistoryRuntime/);
  assert.match(layout, /<DeliveryHistoryRuntime \/>/);
});
