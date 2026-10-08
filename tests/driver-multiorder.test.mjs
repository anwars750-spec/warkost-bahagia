import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "driver-multiorder-test-")),
  "data.db",
);
process.env.SESSION_SECRET =
  "driver-multiorder-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const {
  MAX_ACTIVE_DELIVERIES,
  changeStatus,
  claimReadyDeliveries,
  customerDriverWaitNotice,
  deliveryAvailability,
  pickupAllDeliveries,
} = await import("../lib/domain.mjs");
const { getDriverCodBatch } = await import("../lib/cod-settlement-batches.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin','admin@multi.test','x','ADMIN',1),
    (2,'Customer','customer@multi.test','x','CUSTOMER',1),
    (3,'Driver A','driver-a@multi.test','x','DRIVER',1),
    (4,'Driver B','driver-b@multi.test','x','DRIVER',1),
    (5,'Driver C','driver-c@multi.test','x','DRIVER',1),
    (6,'Driver D','driver-d@multi.test','x','DRIVER',1),
    (7,'Driver Offline','driver-offline@multi.test','x','DRIVER',0),
    (8,'Driver Away','driver-away@multi.test','x','DRIVER',1),
    (9,'Driver COD','driver-cod@multi.test','x','DRIVER',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,2,'Rumah','Alamat Customer Multi-order');
`);

const driver = (id) => ({ id, role: "DRIVER" });

function createOrder({ status = "READY", driverId = null, amount = 20000 }) {
  const result = database
    .prepare(
      "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(2,1,?,?,?)",
    )
    .run(status, amount, amount);
  const orderId = Number(result.lastInsertRowid);
  database
    .prepare(
      "INSERT INTO payments(order_id,method,status,amount) VALUES(?,'CASH','UNPAID',?)",
    )
    .run(orderId, amount);
  if (driverId !== null)
    database
      .prepare(
        "INSERT INTO deliveries(order_id,driver_id,accepted_at) VALUES(?,?,CURRENT_TIMESTAMP)",
      )
      .run(orderId, driverId);
  return orderId;
}

function createDeliveredPayment({ driverId, method, amount }) {
  const order = database
    .prepare(
      "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(2,1,'DELIVERED',?,?)",
    )
    .run(amount, amount);
  const orderId = Number(order.lastInsertRowid);
  database
    .prepare(
      "INSERT INTO deliveries(order_id,driver_id,accepted_at,delivered_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    )
    .run(orderId, driverId);
  database
    .prepare(
      "INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,?,?)",
    )
    .run(orderId, method, method === "QRIS" ? "PAID" : "UNPAID", amount);
  if (method === "CASH")
    database
      .prepare(
        "INSERT INTO cod_settlements(order_id,driver_id,expected_amount) VALUES(?,?,?)",
      )
      .run(orderId, driverId, amount);
  return orderId;
}

test("customer wait notice mengikuti ketersediaan Driver di toko", async () => {
  assert.equal(MAX_ACTIVE_DELIVERIES, 5);
  let availability = await deliveryAvailability();
  assert.equal(availability.delayed, false);
  assert.equal(
    customerDriverWaitNotice(
      { status: "PENDING", driver_id: null },
      availability,
    ),
    0,
  );

  for (const id of [3, 4, 5, 6, 8, 9])
    createOrder({
      status: "PICKED_UP",
      driverId: id,
    });
  availability = await deliveryAvailability();
  assert.equal(availability.onlineDrivers, 6);
  assert.equal(availability.awayDrivers, 6);
  assert.equal(availability.availableAtStore, 0);
  assert.equal(availability.delayed, true);
  assert.equal(
    customerDriverWaitNotice(
      { status: "PENDING", driver_id: null },
      availability,
    ),
    1,
  );
  assert.equal(
    customerDriverWaitNotice(
      { status: "ASSIGNED", driver_id: 3 },
      availability,
    ),
    0,
  );

  database
    .prepare("UPDATE orders SET status='DELIVERED' WHERE status='PICKED_UP'")
    .run();
  availability = await deliveryAvailability();
  assert.equal(availability.availableAtStore, 6);
  assert.equal(availability.delayed, false);
});

test("Ambil Semua membatasi load lima dan hanya mengambil sisa kapasitas", async () => {
  const existing = [
    createOrder({ status: "ASSIGNED", driverId: 3 }),
    createOrder({ status: "ASSIGNED", driverId: 3 }),
  ];
  const ready = Array.from({ length: 5 }, () =>
    createOrder({ status: "READY" }),
  );

  const result = await claimReadyDeliveries(driver(3));
  assert.equal(result.count, 3);
  assert.equal(result.remainingCapacity, 0);
  assert.deepEqual(result.claimedOrderIds, ready.slice(0, 3));
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM orders o JOIN deliveries d ON d.order_id=o.id WHERE d.driver_id=3 AND o.status='ASSIGNED'",
      )
      .get().count,
    5,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM orders WHERE status='READY'")
      .get().count,
    2,
  );
  assert.equal(existing.length, 2);
});

test("dua Driver yang menekan Ambil Semua tidak dapat memiliki order yang sama", async () => {
  database.prepare("UPDATE users SET active=0 WHERE id IN (3,4)").run();
  const ready = Array.from({ length: 3 }, () =>
    createOrder({ status: "READY" }),
  );
  const [first, second] = await Promise.all([
    claimReadyDeliveries(driver(5)),
    claimReadyDeliveries(driver(6)),
  ]);
  assert.equal(first.count + second.count, 5);
  const deliveries = database
    .prepare(
      `SELECT order_id,COUNT(*) count
         FROM deliveries
        WHERE order_id IN (${ready.map(() => "?").join(",")})
        GROUP BY order_id`,
    )
    .all(...ready);
  assert.equal(deliveries.length, 3);
  assert.ok(deliveries.every((row) => row.count === 1));
});

test("Driver offline dan Driver yang sedang pergi tidak dapat memulai pickup batch", async () => {
  await assert.rejects(claimReadyDeliveries(driver(7)), /offline|tidak aktif/);
  const awayOrder = createOrder({ status: "ON_DELIVERY", driverId: 8 });
  await assert.rejects(
    claimReadyDeliveries(driver(8)),
    /Selesaikan trip aktif/,
  );
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id=?").get(awayOrder)
      .status,
    "ON_DELIVERY",
  );
});

test("Pickup Semua hanya mengubah order milik Driver dan retry idempotent", async () => {
  const ownOrders = database
    .prepare(
      "SELECT o.id FROM orders o JOIN deliveries d ON d.order_id=o.id WHERE d.driver_id=5 AND o.status='ASSIGNED' ORDER BY o.id",
    )
    .all()
    .map((row) => Number(row.id));
  assert.ok(ownOrders.length > 0);
  const otherOrder = database
    .prepare(
      "SELECT o.id FROM orders o JOIN deliveries d ON d.order_id=o.id WHERE d.driver_id=6 AND o.status='ASSIGNED' ORDER BY o.id LIMIT 1",
    )
    .get();

  const result = await pickupAllDeliveries(driver(5));
  assert.deepEqual(result.pickedUpOrderIds, ownOrders);
  assert.equal(result.count, ownOrders.length);
  assert.ok(
    database
      .prepare(
        `SELECT status FROM orders WHERE id IN (${ownOrders.map(() => "?").join(",")})`,
      )
      .all(...ownOrders)
      .every((row) => row.status === "PICKED_UP"),
  );
  if (otherOrder)
    assert.equal(
      database
        .prepare("SELECT status FROM orders WHERE id=?")
        .get(otherOrder.id).status,
      "ASSIGNED",
    );

  const eventCount = database
    .prepare(
      "SELECT COUNT(*) count FROM order_events WHERE actor_id=5 AND next_status='PICKED_UP'",
    )
    .get().count;
  const retry = await pickupAllDeliveries(driver(5));
  assert.equal(retry.count, 0);
  assert.equal(retry.duplicate, true);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM order_events WHERE actor_id=5 AND next_status='PICKED_UP'",
      )
      .get().count,
    eventCount,
  );

  await changeStatus(driver(5), ownOrders[0], "ON_DELIVERY");
  if (ownOrders.length > 1)
    assert.equal(
      database.prepare("SELECT status FROM orders WHERE id=?").get(ownOrders[1])
        .status,
      "PICKED_UP",
    );
});

test("grouped COD menghitung 3 COD server-side dan mengecualikan 2 QRIS", async () => {
  const cod = [18000, 18000, 36000].map((amount) =>
    createDeliveredPayment({ driverId: 9, method: "CASH", amount }),
  );
  const qris = [21000, 24000].map((amount) =>
    createDeliveredPayment({ driverId: 9, method: "QRIS", amount }),
  );
  const batch = await getDriverCodBatch(driver(9));
  assert.equal(batch.eligible_orders.length, 3);
  assert.deepEqual(
    batch.eligible_orders.map((row) => row.order_id),
    cod,
  );
  assert.equal(batch.eligible_expected_amount, 72000);
  assert.equal(batch.qris_excluded.order_count, 2);
  assert.ok(batch.eligible_orders.every((row) => !qris.includes(row.order_id)));
});

test("UI menggunakan batch trip dan tidak lagi menawarkan setoran COD per order", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "app/page.js"), "utf8");
  const batchCenter = fs.readFileSync(
    path.join(process.cwd(), "app/CodBatchSettlementCenter.js"),
    "utf8",
  );
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/[action]/route.js"),
    "utf8",
  );

  assert.match(page, /Ambil Semua Pesanan/);
  assert.match(page, /Pickup Semua/);
  assert.match(page, /Setoran COD/);
  assert.match(page, /Driver sedang mengantar pesanan lain/);
  assert.match(page, /Waktu pengantaran mungkin sedikit/);
  assert.match(page, /lebih lama dari biasanya/);
  assert.doesNotMatch(page, /Serahkan tunai ke Admin/);
  assert.doesNotMatch(page, /Kirim setoran COD/);
  assert.doesNotMatch(page, /cod-settlement-submit/);
  assert.doesNotMatch(page, /Antar Semua|Selesaikan Semua/);
  assert.match(batchCenter, /cod-batch-submit/);
  assert.match(batchCenter, /QRIS/);
  assert.match(route, /claim-all-deliveries/);
  assert.match(route, /pickup-all-deliveries/);
});
