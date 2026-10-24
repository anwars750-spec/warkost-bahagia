import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const service = read("lib/delivery-history.mjs");
const route = read("app/api/delivery-history/route.js");
const center = read("app/DeliveryHistoryCenter.js");
const centerStyles = read("app/DeliveryHistoryCenter.module.css");
const runtime = read("app/DeliveryHistoryRuntime.js");
const managerPolish = read("app/ManagerDashboardUiPolish.js");
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

test("history memakai list operasional sederhana dan detail shared untuk Manager Owner", () => {
  assert.match(center, /historyList/);
  assert.match(center, /historyRow/);
  assert.match(center, /detailDialog/);
  assert.match(center, /detailMeta/);
  assert.match(center, /detailContent/);
});

test("close detail dipusatkan secara presisi", () => {
  assert.match(center, /aria-label="Tutup detail delivery"/);
  assert.match(centerStyles, /detailHeader button\{display:grid;place-items:center;flex:0 0 36px;/);
  assert.match(centerStyles, /detailHeader button>span\{display:block;font-size:20px;line-height:1;/);
});

test("Manager Dashboard memakai struktur view sebagai source of truth nav aktif", () => {
  assert.match(managerPolish, /function activeNavFromContext/);
  assert.match(managerPolish, /root\?\.querySelector\("\.manager-dashboard"\)/);
  assert.match(managerPolish, /const activeNav = activeNavFromContext\(root, heading\)/);
});

test("launcher Manager tersedia di header desktop dan menu mobile tanpa mengubah navigation core", () => {
  assert.match(runtime, /header\.top nav/);
  assert.match(runtime, /manager-more-menu/);
  assert.match(runtime, /Riwayat Delivery/);
  assert.match(runtime, /item\.textContent\.trim\(\) === "Keluar"/);
});

test("launcher Owner memakai icon dan panah SVG native serta runtime tetap dimount dari layout", () => {
  assert.match(runtime, /owner-control-grid-v3/);
  assert.match(runtime, /Riwayat Delivery/);
  assert.match(runtime, /<svg viewBox="0 0 24 24">/);
  assert.match(runtime, /<svg aria-hidden="true" viewBox="0 0 24 24">/);
  assert.match(runtime, /M5 12h14m-5-5 5 5-5 5/);
  assert.doesNotMatch(runtime, /styles\.ownerArrow/);
  assert.match(layout, /import DeliveryHistoryRuntime/);
  assert.match(layout, /<DeliveryHistoryRuntime \/>/);
});
