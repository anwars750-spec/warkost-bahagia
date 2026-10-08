import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "cod-batch-test-")),
  "data.db",
);
process.env.SESSION_SECRET =
  "cod-batch-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { createOrder, COD_MAX_ORDER_AMOUNT } = await import("../lib/domain.mjs");
const {
  getCodBatch,
  getDriverCodBatch,
  listAdminCodBatches,
  submitCodBatch,
  verifyCodBatch,
} = await import("../lib/cod-settlement-batches.mjs");
const { submitCodSettlement, verifyCodSettlement } =
  await import("../lib/cod-settlements.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Admin','admin@batch.test','x','ADMIN'),
    (2,'Driver Exact','driver2@batch.test','x','DRIVER'),
    (3,'Driver Kurang','driver3@batch.test','x','DRIVER'),
    (4,'Driver Lebih','driver4@batch.test','x','DRIVER'),
    (5,'Driver Concurrent','driver5@batch.test','x','DRIVER'),
    (6,'Driver Rollback','driver6@batch.test','x','DRIVER'),
    (7,'Driver Single','driver7@batch.test','x','DRIVER'),
    (8,'Driver Empty','driver8@batch.test','x','DRIVER'),
    (9,'Driver Limit','driver9@batch.test','x','DRIVER'),
    (10,'Owner','owner@batch.test','x','OWNER'),
    (20,'Customer Exact','customer20@batch.test','x','CUSTOMER'),
    (21,'Customer Kurang','customer21@batch.test','x','CUSTOMER'),
    (22,'Customer Lebih','customer22@batch.test','x','CUSTOMER'),
    (23,'Customer Concurrent','customer23@batch.test','x','CUSTOMER'),
    (24,'Customer Rollback','customer24@batch.test','x','CUSTOMER'),
    (25,'Customer Single','customer25@batch.test','x','CUSTOMER'),
    (26,'Customer Limit','customer26@batch.test','x','CUSTOMER');
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default) VALUES
    (20,20,'Rumah','Alamat Exact',0,0,1),
    (21,21,'Rumah','Alamat Kurang',0,0,1),
    (22,22,'Rumah','Alamat Lebih',0,0,1),
    (23,23,'Rumah','Alamat Concurrent',0,0,1),
    (24,24,'Rumah','Alamat Rollback',0,0,1),
    (25,25,'Rumah','Alamat Single',0,0,1),
    (26,26,'Rumah','Alamat Limit',0,0,1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity) VALUES
    (1,1,'Batas COD',150000,100),
    (2,1,'Di atas batas COD',150001,100);
  INSERT OR REPLACE INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('printer_simulation','true'),
    ('cod_max_order_amount','150000');
`);

const admin = { id: 1, role: "ADMIN" };
const owner = { id: 10, role: "OWNER" };
const driver = (id) => ({ id, role: "DRIVER" });
const customer = (id) => ({ id, role: "CUSTOMER" });

function directOrder({
  driverId,
  customerId,
  amount,
  method = "CASH",
  status = "DELIVERED",
  paymentStatus = method === "CASH" ? "UNPAID" : "PAID",
  settlementStatus = "AWAITING_COD_SETTLEMENT",
}) {
  const order = database
    .prepare(
      "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(?,?,?,?,?)",
    )
    .run(customerId, customerId, status, amount, amount);
  const orderId = Number(order.lastInsertRowid);
  database
    .prepare(
      "INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,?,?)",
    )
    .run(orderId, method, paymentStatus, amount);
  database
    .prepare(
      "INSERT INTO deliveries(order_id,driver_id,accepted_at,delivered_at) VALUES(?,?,CURRENT_TIMESTAMP,?)",
    )
    .run(
      orderId,
      driverId,
      status === "DELIVERED" ? new Date().toISOString() : null,
    );
  if (method === "CASH" && status === "DELIVERED")
    database
      .prepare(
        "INSERT INTO cod_settlements(order_id,driver_id,expected_amount,cash_amount,status,verified_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        orderId,
        driverId,
        amount,
        settlementStatus === "VERIFIED" ? amount : null,
        settlementStatus,
        settlementStatus === "VERIFIED" ? new Date().toISOString() : null,
      );
  return orderId;
}

function paymentStatus(orderId) {
  return database
    .prepare("SELECT status FROM payments WHERE order_id=?")
    .get(orderId).status;
}

function settlementStatus(orderId) {
  return database
    .prepare("SELECT status FROM cod_settlements WHERE order_id=?")
    .get(orderId).status;
}

const exactCod = [18000, 22000, 15000].map((amount) =>
  directOrder({ driverId: 2, customerId: 20, amount }),
);
const exactQris = [31000, 42000].map((amount) =>
  directOrder({
    driverId: 2,
    customerId: 20,
    amount,
    method: "QRIS",
    paymentStatus: "PAID",
  }),
);
const undelivered = directOrder({
  driverId: 2,
  customerId: 20,
  amount: 12000,
  status: "ON_DELIVERY",
});
const verifiedCod = directOrder({
  driverId: 2,
  customerId: 20,
  amount: 13000,
  paymentStatus: "PAID",
  settlementStatus: "VERIFIED",
});
const otherDriverCod = directOrder({
  driverId: 3,
  customerId: 21,
  amount: 14000,
});

let exactBatchId;

test("eligible batch hanya berisi 3 COD milik Driver dan menghitung total server-side", async () => {
  const state = await getDriverCodBatch(driver(2));
  assert.deepEqual(
    state.eligible_orders.map((item) => item.order_id),
    exactCod,
  );
  assert.equal(state.eligible_expected_amount, 55000);
  assert.deepEqual(state.qris_excluded, { order_count: 2, amount: 73000 });
  assert.equal(
    state.eligible_orders.some((item) => exactQris.includes(item.order_id)),
    false,
  );
  assert.equal(
    state.eligible_orders.some((item) => item.order_id === undelivered),
    false,
  );
  assert.equal(
    state.eligible_orders.some((item) => item.order_id === verifiedCod),
    false,
  );
  assert.equal(
    state.eligible_orders.some((item) => item.order_id === otherDriverCod),
    false,
  );
});

test("Driver exact submission menghasilkan satu batch SUBMITTED dan traceable items", async () => {
  const batch = await submitCodBatch(driver(2), {
    cashAmount: 55000,
    evidenceReference: "handoff-3-cod",
  });
  exactBatchId = batch.id;
  assert.equal(batch.status, "SUBMITTED");
  assert.equal(batch.expected_amount, 55000);
  assert.equal(batch.submitted_amount, 55000);
  assert.equal(batch.order_count, 3);
  assert.deepEqual(
    batch.orders.map((item) => item.order_id),
    exactCod,
  );
  assert.ok(batch.orders.every((item) => item.settlement_id > 0));

  const replay = await submitCodBatch(driver(2), {
    cashAmount: 55000,
    evidenceReference: "handoff-3-cod",
  });
  assert.equal(replay.id, exactBatchId);
  assert.equal(replay.replayed, true);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM cod_settlement_batches WHERE driver_id=2",
      )
      .get().count,
    1,
  );
});

test("batch tidak dapat diakses Driver lain dan single-order action konflik ditolak", async () => {
  await assert.rejects(
    getCodBatch(driver(3), exactBatchId),
    (error) => error.status === 403,
  );
  await assert.rejects(
    submitCodSettlement(driver(2), {
      orderId: exactCod[0],
      cashAmount: 18000,
    }),
    /dikelola melalui batch COD/,
  );
  await assert.rejects(
    verifyCodSettlement(admin, exactCod[0]),
    /dikelola melalui batch COD/,
  );
});

test("underpayment membuat NEEDS_REVIEW dan semua pembayaran tetap UNPAID", async () => {
  const orders = [25000, 30000].map((amount) =>
    directOrder({ driverId: 3, customerId: 21, amount }),
  );
  const batch = await submitCodBatch(driver(3), {
    cashAmount: 50000,
    evidenceReference: "kurang-5000",
  });
  assert.equal(batch.expected_amount, 69000);
  assert.equal(batch.status, "NEEDS_REVIEW");
  assert.equal(batch.discrepancy_amount, -19000);
  assert.ok(
    [...orders, otherDriverCod].every((id) => paymentStatus(id) === "UNPAID"),
  );
  await assert.rejects(
    verifyCodBatch(admin, batch.id),
    (error) => error.status === 409,
  );
  const corrected = await submitCodBatch(driver(3), {
    cashAmount: 69000,
    evidenceReference: "koreksi-exact",
  });
  assert.equal(corrected.id, batch.id);
  assert.equal(corrected.status, "SUBMITTED");
  assert.equal(corrected.discrepancy_amount, 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='BATCH_CORRECTED' AND details LIKE ?",
      )
      .get(`%\"batchId\":${batch.id}%`).count,
    1,
  );
  for (const action of ["BATCH_SUBMITTED", "BATCH_DISCREPANCY"])
    assert.ok(
      database
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE action=? AND details LIKE ?",
        )
        .get(action, `%\"batchId\":${batch.id}%`).count >= 1,
      action,
    );
});

test("overpayment membuat NEEDS_REVIEW tanpa mengalokasikan selisih ke order", async () => {
  const orders = [20000, 35000].map((amount) =>
    directOrder({ driverId: 4, customerId: 22, amount }),
  );
  const batch = await submitCodBatch(driver(4), { cashAmount: 60000 });
  assert.equal(batch.expected_amount, 55000);
  assert.equal(batch.status, "NEEDS_REVIEW");
  assert.equal(batch.discrepancy_amount, 5000);
  assert.ok(orders.every((id) => paymentStatus(id) === "UNPAID"));
  assert.ok(
    orders.every((id) => settlementStatus(id) === "AWAITING_COD_SETTLEMENT"),
  );
});

test("hanya Admin dapat memverifikasi batch exact", async () => {
  await assert.rejects(
    verifyCodBatch(owner, exactBatchId),
    (error) => error.status === 403,
  );
  await assert.rejects(
    verifyCodBatch(driver(2), exactBatchId),
    (error) => error.status === 403,
  );
});

test("verifikasi Admin exact membayar seluruh COD atomik, QRIS tidak berubah, loyalty idempotent", async () => {
  const verified = await verifyCodBatch(admin, exactBatchId);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.admin_verifier_id, admin.id);
  assert.ok(exactCod.every((id) => paymentStatus(id) === "PAID"));
  assert.ok(exactCod.every((id) => settlementStatus(id) === "VERIFIED"));
  assert.ok(exactQris.every((id) => paymentStatus(id) === "PAID"));
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=20")
      .get().balance,
    4,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE user_id=20 AND kind='EARN'",
      )
      .get().count,
    3,
  );
  const replay = await verifyCodBatch(admin, exactBatchId);
  assert.equal(replay.replayed, true);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=20")
      .get().balance,
    4,
  );
  for (const action of [
    "BATCH_CREATED",
    "BATCH_SUBMITTED",
    "BATCH_VERIFIED",
    "BATCH_CLOSED",
  ])
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE action=? AND details LIKE ?",
        )
        .get(action, `%\"batchId\":${exactBatchId}%`).count,
      1,
      action,
    );
  for (const orderId of exactCod)
    for (const action of [
      "COD_SETTLEMENT_VERIFIED",
      "COD_SETTLEMENT_CLOSED",
      "PAYMENT_PAID",
    ])
      assert.equal(
        database
          .prepare(
            "SELECT COUNT(*) count FROM audit_logs WHERE action=? AND details LIKE ?",
          )
          .get(action, `%\"orderId\":${orderId}%`).count,
        1,
        `${action}:${orderId}`,
      );
  await assert.rejects(
    submitCodSettlement(driver(2), {
      orderId: exactCod[0],
      cashAmount: 18000,
    }),
    /terverifikasi tidak dapat diubah/,
  );
});

test("Admin dapat melihat pending/detail/history batch tanpa membuka role lain", async () => {
  const pending = await listAdminCodBatches(admin, "pending");
  assert.ok(pending.some((batch) => batch.driver.id === 3));
  assert.equal(
    pending.some((batch) => batch.id === exactBatchId),
    false,
  );
  const history = await listAdminCodBatches(admin, "history");
  assert.ok(history.some((batch) => batch.id === exactBatchId));
  const detail = await getCodBatch(admin, exactBatchId);
  assert.equal(detail.order_count, 3);
  await assert.rejects(
    listAdminCodBatches(owner),
    (error) => error.status === 403,
  );
});

test("concurrent duplicate submission memiliki satu batch dan satu ownership per order", async () => {
  const orders = [17000, 19000].map((amount) =>
    directOrder({ driverId: 5, customerId: 23, amount }),
  );
  const [first, second] = await Promise.all([
    submitCodBatch(driver(5), { cashAmount: 36000 }),
    submitCodBatch(driver(5), { cashAmount: 36000 }),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(Number(first.replayed) + Number(second.replayed), 1);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM cod_settlement_batches WHERE driver_id=5",
      )
      .get().count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM cod_settlement_batch_items WHERE batch_id=?",
      )
      .get(first.id).count,
    2,
  );
  assert.throws(() =>
    database
      .prepare(
        "INSERT INTO cod_settlement_batch_items(batch_id,order_id,settlement_id,expected_amount) SELECT ?,order_id,settlement_id,expected_amount FROM cod_settlement_batch_items WHERE order_id=?",
      )
      .run(first.id, orders[0]),
  );
});

test("kegagalan di tengah verifikasi me-roll back batch, seluruh settlement, payment, loyalty, dan audit", async () => {
  const orders = [24000, 26000].map((amount) =>
    directOrder({ driverId: 6, customerId: 24, amount }),
  );
  const batch = await submitCodBatch(driver(6), { cashAmount: 50000 });
  database.exec(`
    CREATE TRIGGER force_batch_failure
    BEFORE UPDATE OF status ON payments
    WHEN NEW.order_id=${orders[1]} AND NEW.status='PAID'
    BEGIN
      SELECT RAISE(ABORT,'forced batch payment failure');
    END;
  `);
  await assert.rejects(
    verifyCodBatch(admin, batch.id),
    /forced batch payment failure/,
  );
  database.exec("DROP TRIGGER force_batch_failure");
  assert.ok(orders.every((id) => paymentStatus(id) === "UNPAID"));
  assert.ok(
    orders.every((id) => settlementStatus(id) === "AWAITING_COD_SETTLEMENT"),
  );
  assert.equal(
    database
      .prepare("SELECT status FROM cod_settlement_batches WHERE id=?")
      .get(batch.id).status,
    "SUBMITTED",
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE user_id=24",
      )
      .get().count,
    0,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='BATCH_VERIFIED' AND details LIKE ?",
      )
      .get(`%\"batchId\":${batch.id}%`).count,
    0,
  );
});

test("single-order COD settlement tetap kompatibel di luar batch", async () => {
  const orderId = directOrder({
    driverId: 7,
    customerId: 25,
    amount: 28000,
  });
  const submitted = await submitCodSettlement(driver(7), {
    orderId,
    cashAmount: 28000,
    evidenceReference: "single-compatible",
  });
  assert.equal(submitted.status, "SUBMITTED");
  const verified = await verifyCodSettlement(admin, orderId);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(paymentStatus(orderId), "PAID");
});

test("batas COD memakai final payable: <=150000 boleh, >150000 ditolak, non-cash tetap boleh", async () => {
  assert.equal(COD_MAX_ORDER_AMOUNT, 150000);
  const atLimit = await createOrder(customer(26), {
    addressId: 26,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(atLimit.total, 150000);
  assert.equal(atLimit.payment.method, "CASH");
  const before = database
    .prepare("SELECT COUNT(*) count FROM orders")
    .get().count;
  await assert.rejects(
    createOrder(customer(26), {
      addressId: 26,
      method: "CASH",
      items: [{ productId: 2, quantity: 1 }],
    }),
    (error) =>
      error.status === 422 && /maksimal Rp150\.000/.test(error.message),
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    before,
  );
  const nonCash = await createOrder(customer(26), {
    addressId: 26,
    method: "BANK_TRANSFER",
    items: [{ productId: 2, quantity: 1 }],
  });
  assert.equal(nonCash.total, 150001);
  assert.equal(nonCash.payment.method, "BANK_TRANSFER");
});

test("API contract menyediakan operasi Driver dan Admin batch tanpa UI redesign", () => {
  const route = fs.readFileSync(
    new URL("../app/api/[action]/route.js", import.meta.url),
    "utf8",
  );
  for (const action of [
    "cod-batch-driver",
    "cod-batches",
    "cod-batch",
    "cod-batch-submit",
    "cod-batch-verify",
  ])
    assert.match(route, new RegExp(`action === [\"']${action}[\"']`));
});
