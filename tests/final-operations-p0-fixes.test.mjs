import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-final-ops-p0-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const { extendAdminPreparationEta } =
  await import("../lib/preparing-eta-extensions.mjs");
const { listPreparationEta } = await import("../lib/preparing-eta.mjs");

const database = db();
after(() => {
  try {
    database.close();
  } catch {}
});

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Customer','final-ops-customer@test.local','x','CUSTOMER',1),
    (2,'Admin','final-ops-admin@test.local','x','ADMIN',1),
    (3,'Kitchen','final-ops-kitchen@test.local','x','KITCHEN',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,1,'Rumah','Alamat final operations test');
  INSERT INTO orders(id,customer_id,address_id,status,subtotal,total,fulfillment_type) VALUES
    (701,1,1,'PREPARING',40000,40000,'DELIVERY');
  INSERT INTO order_stations(order_id,station,status,started_at) VALUES
    (701,'CASHIER','PREPARING','2026-11-01 03:00:00');
`);

const admin = { id: 2, role: "ADMIN" };
const kitchen = { id: 3, role: "KITCHEN" };
const now = Date.parse("2026-11-01T03:05:00.000Z");

test("hanya Admin dapat menambah ETA station minuman dan setiap klik menambah 5 menit persisten", async () => {
  await assert.rejects(
    extendAdminPreparationEta(kitchen, 701),
    /Akses|role|izin/i,
  );

  const first = await extendAdminPreparationEta(admin, 701);
  assert.equal(first.addedMinutes, 5);
  assert.equal(first.extraMinutes, 5);

  let eta = await listPreparationEta(admin, { orderId: 701, nowMs: now });
  let cashier = eta.orders[0].stations.find((station) => station.station === "CASHIER");
  assert.equal(cashier.extraMinutes, 5);
  assert.equal(cashier.estimatedReadyAt, "2026-11-01T03:20:00.000Z");
  assert.equal(cashier.remainingSeconds, 900);

  const second = await extendAdminPreparationEta(admin, 701);
  assert.equal(second.extraMinutes, 10);
  eta = await listPreparationEta(admin, { orderId: 701, nowMs: now });
  cashier = eta.orders[0].stations.find((station) => station.station === "CASHIER");
  assert.equal(cashier.estimatedReadyAt, "2026-11-01T03:25:00.000Z");
  assert.equal(cashier.remainingSeconds, 1200);

  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='PREPARATION_ETA_EXTENDED'")
      .get().count,
    2,
  );
});

test("ETA tidak dapat ditambah setelah station Admin selesai", async () => {
  database
    .prepare("UPDATE order_stations SET status='READY',ready_at=CURRENT_TIMESTAMP WHERE order_id=701 AND station='CASHIER'")
    .run();
  await assert.rejects(
    extendAdminPreparationEta(admin, 701),
    /hanya dapat ditambah saat Admin sedang menyiapkan minuman/i,
  );
});

test("runtime Admin hanya menyediakan +5 menit pada ETA aktif dan me-refresh snapshot server", () => {
  const runtime = fs.readFileSync(
    path.resolve("app/AdminEtaExtensionRuntime.js"),
    "utf8",
  );
  const route = fs.readFileSync(
    path.resolve("app/api/preparing-eta/extend/route.js"),
    "utf8",
  );
  const layout = fs.readFileSync(path.resolve("app/layout.js"), "utf8");
  assert.match(runtime, /classList\.contains\("active"\)/);
  assert.match(runtime, /classList\.contains\("overdue"\)/);
  assert.match(runtime, /\+5 menit/);
  assert.match(runtime, /\/api\/preparing-eta\/extend/);
  assert.match(runtime, /warkost:realtime-recovered/);
  assert.match(route, /extendAdminPreparationEta/);
  assert.match(layout, /<AdminEtaExtensionRuntime \/>/);
});

test("Driver proof UI menjelaskan HTTP 413 dan tetap membatasi file 8 MB", () => {
  const runtime = fs.readFileSync(
    path.resolve("app/DriverDeliveryProofRuntime.js"),
    "utf8",
  );
  assert.match(runtime, /selected\.size > 8 \* 1024 \* 1024/);
  assert.match(runtime, /response\.status === 413/);
  assert.match(runtime, /ukuran request terlalu besar/);
  assert.match(runtime, /HTTP \$\{response\.status\}/);
});
