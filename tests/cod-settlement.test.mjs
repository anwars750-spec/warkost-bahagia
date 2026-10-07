import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "cod-settlement-test-")),
  "data.db",
);
process.env.SESSION_SECRET =
  "cod-settlement-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus, claimDelivery, updateStationStatus } =
  await import("../lib/domain.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const { submitCodSettlement, verifyCodSettlement } =
  await import("../lib/cod-settlements.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Admin','admin@cod.test','x','ADMIN'),
    (2,'Driver Satu','driver1@cod.test','x','DRIVER'),
    (3,'Driver Dua','driver2@cod.test','x','DRIVER'),
    (4,'Customer','customer@cod.test','x','CUSTOMER'),
    (5,'Kitchen','kitchen@cod.test','x','KITCHEN'),
    (6,'Owner','owner@cod.test','x','OWNER');
  INSERT INTO loyalty_accounts(user_id,balance) VALUES(4,0);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity) VALUES(1,1,'Paket COD',50000,100);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,4,'Rumah','Alamat pelanggan COD',0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('printer_simulation','true');
`);

const admin = { id: 1, role: "ADMIN" };
const driver = { id: 2, role: "DRIVER" };
const otherDriver = { id: 3, role: "DRIVER" };
const customer = { id: 4, role: "CUSTOMER" };
const kitchen = { id: 5, role: "KITCHEN" };
const owner = { id: 6, role: "OWNER" };

async function newCodOrder() {
  return createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
}

async function prepare(orderId) {
  await changeStatus(admin, orderId, "CONFIRMED");
  await updateStationStatus(kitchen, orderId, "PREPARING");
}

async function ready(orderId) {
  await prepare(orderId);
  await updateStationStatus(kitchen, orderId, "READY");
}

async function delivery(orderId) {
  await ready(orderId);
  await claimDelivery(driver, orderId);
  await changeStatus(driver, orderId, "PICKED_UP");
  await changeStatus(driver, orderId, "ON_DELIVERY");
}

async function delivered(orderId) {
  await delivery(orderId);
  await changeStatus(driver, orderId, "DELIVERED");
}

async function rejectsManualSettlement(orderId) {
  for (const status of ["PAID", "FAILED"])
    await assert.rejects(
      verifyPayment(admin, orderId, status),
      (error) =>
        error.status === 409 && /verifikasi setoran/.test(error.message),
    );
}

test("COD tidak dapat ditandai PAID/FAILED sebelum terminal delivery", async () => {
  const pending = await newCodOrder();
  await rejectsManualSettlement(pending.id);

  const preparing = await newCodOrder();
  await prepare(preparing.id);
  await rejectsManualSettlement(preparing.id);

  const readyOrder = await newCodOrder();
  await ready(readyOrder.id);
  await rejectsManualSettlement(readyOrder.id);

  const inDelivery = await newCodOrder();
  await delivery(inDelivery.id);
  await rejectsManualSettlement(inDelivery.id);
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(inDelivery.id).status,
    "UNPAID",
  );
});

test("delivery membuat settlement awaiting dan hanya assigned driver dapat submit", async () => {
  const order = await newCodOrder();
  await delivery(order.id);
  await assert.rejects(
    submitCodSettlement(driver, { orderId: order.id, cashAmount: order.total }),
    /belum tersedia/,
  );
  await changeStatus(driver, order.id, "DELIVERED");
  const initial = database
    .prepare("SELECT * FROM cod_settlements WHERE order_id=?")
    .get(order.id);
  assert.equal(initial.status, "AWAITING_COD_SETTLEMENT");
  assert.equal(initial.expected_amount, order.total);
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(order.id).status,
    "UNPAID",
  );
  await assert.rejects(
    submitCodSettlement(otherDriver, {
      orderId: order.id,
      cashAmount: order.total,
    }),
    (error) => error.status === 403,
  );
  const submitted = await submitCodSettlement(driver, {
    orderId: order.id,
    cashAmount: order.total,
    evidenceReference: "handoff-admin-001",
  });
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.expected_amount, order.total);
  assert.equal(submitted.cash_amount, order.total);
  assert.ok(submitted.submitted_at);
});

test("underpayment dan overpayment menjadi discrepancy serta tetap unpaid", async () => {
  for (const cashAmount of [49000, 51000]) {
    const order = await newCodOrder();
    await delivered(order.id);
    await submitCodSettlement(driver, { orderId: order.id, cashAmount });
    const result = await verifyCodSettlement(admin, order.id);
    assert.equal(result.status, "NEEDS_REVIEW");
    assert.equal(result.discrepancy_amount, cashAmount - order.total);
    assert.equal(result.payment_status, "UNPAID");
    assert.equal(
      database
        .prepare("SELECT status FROM payments WHERE order_id=?")
        .get(order.id).status,
      "UNPAID",
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE action='COD_SETTLEMENT_DISCREPANCY' AND details LIKE ?",
        )
        .get(`%\"orderId\":${order.id}%`).count,
      1,
    );
  }
});

test("Admin exact settlement menutup COD, idempotent, dan loyalty tepat sekali", async () => {
  const order = await newCodOrder();
  await delivered(order.id);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=4")
      .get().balance,
    0,
  );
  await submitCodSettlement(driver, {
    orderId: order.id,
    cashAmount: order.total,
  });
  await assert.rejects(
    verifyCodSettlement(owner, order.id),
    (error) => error.status === 403,
  );
  await assert.rejects(
    verifyCodSettlement(driver, order.id),
    (error) => error.status === 403,
  );

  const verified = await verifyCodSettlement(admin, order.id);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.payment_status, "PAID");
  assert.equal(verified.admin_verifier_id, admin.id);
  assert.ok(verified.verified_at);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=4")
      .get().balance,
    5,
  );
  const replay = await verifyCodSettlement(admin, order.id);
  assert.equal(replay.replayed, true);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(order.id).count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=4")
      .get().balance,
    5,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='COD_SETTLEMENT_VERIFIED' AND details LIKE ?",
      )
      .get(`%\"orderId\":${order.id}%`).count,
    1,
  );
  for (const action of [
    "COD_SETTLEMENT_AWAITING",
    "COD_CASH_SUBMITTED",
    "COD_SETTLEMENT_VERIFIED",
    "COD_SETTLEMENT_CLOSED",
    "PAYMENT_PAID",
  ])
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM audit_logs WHERE action=? AND details LIKE ?",
        )
        .get(action, `%\"orderId\":${order.id}%`).count,
      1,
      action,
    );
});

test("driver dapat memperbaiki discrepancy lalu Admin menutup settlement", async () => {
  const order = await newCodOrder();
  await delivered(order.id);
  await submitCodSettlement(driver, {
    orderId: order.id,
    cashAmount: order.total - 1000,
  });
  await verifyCodSettlement(admin, order.id);
  const corrected = await submitCodSettlement(driver, {
    orderId: order.id,
    cashAmount: order.total,
  });
  assert.equal(corrected.status, "SUBMITTED");
  const closed = await verifyCodSettlement(admin, order.id);
  assert.equal(closed.status, "VERIFIED");
  assert.equal(closed.payment_status, "PAID");
});
