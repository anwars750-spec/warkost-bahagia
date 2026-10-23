import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-preparing-eta-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const {
  PREPARATION_ETA_MINUTES,
  calculatePreparationEta,
  listPreparationEta,
} = await import("../lib/preparing-eta.mjs");

const database = db();
after(() => {
  try {
    database.close();
  } catch {}
});

const order = (overrides = {}) => ({
  id: 1,
  status: "PREPARING",
  fulfillment_type: "DELIVERY",
  ...overrides,
});
const station = (overrides = {}) => ({
  station: "KITCHEN",
  status: "PREPARING",
  started_at: "2026-10-23 05:00:00",
  ready_at: null,
  ...overrides,
});

const now = Date.parse("2026-10-23T05:05:00.000Z");

test("default Preparing ETA V1 terkunci 15 menit dan menunggu start tanpa countdown palsu", () => {
  assert.equal(PREPARATION_ETA_MINUTES, 15);
  const result = calculatePreparationEta(
    order({ status: "CONFIRMED", fulfillment_type: "PICKUP" }),
    [station({ status: "QUEUED", started_at: null })],
    now,
  );
  assert.equal(result.state, "WAITING_START");
  assert.equal(result.fulfillmentType, "PICKUP");
  assert.equal(result.estimatedReadyAt, null);
  assert.equal(result.remainingSeconds, null);
});

test("single station menghitung countdown dari started_at server", () => {
  const result = calculatePreparationEta(order(), [station()], now);
  assert.equal(result.state, "PREPARING");
  assert.equal(result.estimatedReadyAt, "2026-10-23T05:15:00.000Z");
  assert.equal(result.remainingSeconds, 600);
  assert.equal(result.overdue, false);
});

test("ETA menjadi overdue setelah deadline tanpa mengubah status order", () => {
  const result = calculatePreparationEta(
    order(),
    [station()],
    Date.parse("2026-10-23T05:17:00.000Z"),
  );
  assert.equal(result.state, "OVERDUE");
  assert.equal(result.remainingSeconds, 0);
  assert.equal(result.overdueSeconds, 120);
  assert.equal(result.status, "PREPARING");
});

test("mixed order mengikuti station yang selesai paling akhir", () => {
  const result = calculatePreparationEta(
    order(),
    [
      station({ station: "KITCHEN", started_at: "2026-10-23 05:00:00" }),
      station({ station: "CASHIER", started_at: "2026-10-23 05:05:00" }),
    ],
    now,
  );
  assert.equal(result.estimatedReadyAt, "2026-10-23T05:20:00.000Z");
  assert.equal(result.remainingSeconds, 900);
});

test("station queued pada mixed order memakai window awal sampai benar-benar mulai", () => {
  const result = calculatePreparationEta(
    order(),
    [
      station({ station: "KITCHEN", started_at: "2026-10-23 05:00:00" }),
      station({ station: "CASHIER", status: "QUEUED", started_at: null }),
    ],
    now,
  );
  assert.equal(result.estimatedReadyAt, "2026-10-23T05:15:00.000Z");
  assert.equal(
    result.stations.find((item) => item.station === "CASHIER").estimatedReadyAt,
    "2026-10-23T05:15:00.000Z",
  );
});

test("Customer hanya menerima ETA order miliknya dan Kitchen hanya order station Kitchen", async () => {
  database.exec(`
    INSERT INTO users(id,name,email,password_hash,role,active) VALUES
      (1,'Customer A','eta-a@test.local','x','CUSTOMER',1),
      (2,'Customer B','eta-b@test.local','x','CUSTOMER',1),
      (3,'Kitchen','eta-kitchen@test.local','x','KITCHEN',1);
    INSERT INTO addresses(id,user_id,label,detail) VALUES
      (1,1,'Rumah A','Alamat customer A untuk ETA'),
      (2,2,'Rumah B','Alamat customer B untuk ETA');
    INSERT INTO orders(id,customer_id,address_id,status,subtotal,total,fulfillment_type) VALUES
      (101,1,1,'PREPARING',10000,10000,'DELIVERY'),
      (102,2,2,'PREPARING',10000,10000,'PICKUP');
    INSERT INTO order_stations(order_id,station,status,started_at) VALUES
      (101,'KITCHEN','PREPARING','2026-10-23 05:00:00'),
      (102,'CASHIER','PREPARING','2026-10-23 05:00:00');
  `);

  const customer = await listPreparationEta(
    { id: 1, role: "CUSTOMER" },
    { nowMs: now },
  );
  assert.deepEqual(
    customer.orders.map((item) => item.orderId),
    [101],
  );

  const kitchen = await listPreparationEta(
    { id: 3, role: "KITCHEN" },
    { nowMs: now },
  );
  assert.deepEqual(
    kitchen.orders.map((item) => item.orderId),
    [101],
  );
});

test("route dan runtime menjaga scope Customer/Kitchen serta wiring realtime", () => {
  const route = fs.readFileSync(
    path.resolve("app/api/preparing-eta/route.js"),
    "utf8",
  );
  const runtime = fs.readFileSync(
    path.resolve("app/PreparingEtaRuntime.js"),
    "utf8",
  );
  assert.match(route, /required\(user, \["CUSTOMER", "KITCHEN"\]\)/);
  assert.match(route, /listPreparationEta/);
  assert.match(runtime, /\/api\/preparing-eta/);
  assert.match(runtime, /customer-order-card/);
  assert.match(runtime, /delivery-status-card/);
  assert.match(runtime, /kitchen-time-chip/);
  assert.match(runtime, /STATION_STATUS_CHANGED/);
  assert.match(runtime, /warkost:realtime-recovered/);
});
