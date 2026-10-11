import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "admin-cash-control-")),
  "data.db",
);
process.env.SESSION_SECRET = "admin-cash-control-test-secret-32-bytes-minimum";

const { db } = await import("../lib/db.mjs");
const {
  bootstrapAdminOperator,
  getAdminCashState,
  startAdminShift,
} = await import("../lib/admin-cash-control.mjs");
const {
  submitCodBatchCashHandover,
  verifyCodBatchWithOperator,
} = await import("../lib/cod-cash-handover-v1.mjs");

const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin Shared','admin@cash.test','x','ADMIN',1),
    (2,'Driver Budi','driver@cash.test','x','DRIVER',1),
    (3,'Customer','customer@cash.test','x','CUSTOMER',1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default,active)
    VALUES(3,3,'Rumah','Alamat Customer',0,0,1,1);
`);

const admin = { id: 1, role: "ADMIN" };
const driver = { id: 2, role: "DRIVER" };

function createDeliveredCod(amount) {
  const order = database
    .prepare(
      "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(?,?,?,?,?)",
    )
    .run(3, 3, "DELIVERED", amount, amount);
  const orderId = Number(order.lastInsertRowid);
  database
    .prepare(
      "INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,?,?)",
    )
    .run(orderId, "CASH", "UNPAID", amount);
  database
    .prepare(
      "INSERT INTO deliveries(order_id,driver_id,accepted_at,delivered_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    )
    .run(orderId, 2);
  database
    .prepare(
      "INSERT INTO cod_settlements(order_id,driver_id,expected_amount,status) VALUES(?,?,?,'AWAITING_COD_SETTLEMENT')",
    )
    .run(orderId, 2, amount);
  return orderId;
}

let operatorId;

test("operator pertama dapat dibuat tetapi shift belum otomatis aktif", async () => {
  const operator = await bootstrapAdminOperator(admin, {
    name: "Virsa",
    pin: "2580",
  });
  operatorId = operator.id;
  const state = await getAdminCashState(admin);
  assert.equal(state.operators.length, 1);
  assert.equal(state.operators[0].name, "Virsa");
  assert.equal(state.current_shift, null);
});

test("Admin tidak dapat menerima COD sebelum shift operator dimulai", async () => {
  createDeliveredCod(50000);
  const batch = await submitCodBatchCashHandover(driver, {
    cashAmount: 50000,
  });
  assert.equal(batch.status, "SUBMITTED");
  await assert.rejects(
    verifyCodBatchWithOperator(admin, batch.id),
    /Mulai shift operator Admin terlebih dahulu/,
  );
});

test("PIN operator memulai shift dan setoran exact masuk custody operator", async () => {
  await assert.rejects(
    startAdminShift(admin, { operatorId, pin: "0000" }),
    /PIN operator salah/,
  );
  const shift = await startAdminShift(admin, { operatorId, pin: "2580" });
  assert.equal(shift.operator_name, "Virsa");

  const pending = database
    .prepare("SELECT id FROM cod_settlement_batches WHERE status='SUBMITTED' ORDER BY id LIMIT 1")
    .get();
  const verified = await verifyCodBatchWithOperator(admin, pending.id);
  assert.equal(verified.status, "VERIFIED");

  const state = await getAdminCashState(admin);
  assert.equal(state.current_shift.operator_name, "Virsa");
  assert.equal(state.current_shift.cash_custody, 50000);
  assert.equal(state.current_shift.overage_total, 0);
  assert.equal(state.current_shift.receipt_count, 1);
});

test("setoran lebih boleh diverifikasi dan seluruh actual masuk Kas Admin", async () => {
  createDeliveredCod(40000);
  const batch = await submitCodBatchCashHandover(driver, {
    cashAmount: 45000,
    evidenceReference: "kelebihan-bayar-customer",
  });
  assert.equal(batch.status, "SUBMITTED");
  assert.equal(batch.expected_amount, 40000);
  assert.equal(batch.submitted_amount, 45000);
  assert.equal(batch.discrepancy_amount, 5000);

  const verified = await verifyCodBatchWithOperator(admin, batch.id);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.discrepancy_amount, 5000);

  const state = await getAdminCashState(admin);
  assert.equal(state.current_shift.cash_custody, 95000);
  assert.equal(state.current_shift.expected_received, 90000);
  assert.equal(state.current_shift.overage_total, 5000);
  assert.equal(state.recent_receipts[0].actual_amount, 45000);
  assert.equal(state.recent_receipts[0].overage_amount, 5000);
});

test("setoran kurang tetap NEEDS_REVIEW dan tidak dapat masuk custody", async () => {
  createDeliveredCod(30000);
  const batch = await submitCodBatchCashHandover(driver, {
    cashAmount: 25000,
  });
  assert.equal(batch.status, "NEEDS_REVIEW");
  assert.equal(batch.discrepancy_amount, -5000);
  await assert.rejects(
    verifyCodBatchWithOperator(admin, batch.id),
    /Batch belum siap diverifikasi/,
  );

  const state = await getAdminCashState(admin);
  assert.equal(state.current_shift.cash_custody, 95000);
  assert.equal(state.issues.count, 1);
});
