import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "admin-shift-settlement-flow-")),
  "data.db",
);
process.env.SESSION_SECRET = "admin-shift-settlement-flow-test-secret-32-bytes";

const { db } = await import("../lib/db.mjs");
const { getAdminCashState, startAdminShift } = await import(
  "../lib/admin-cash-control.mjs"
);
const { createOwnerAdminOperator } = await import(
  "../lib/owner-admin-operators.mjs"
);
const {
  submitCodBatchCashHandover,
  verifyCodBatchWithOperator,
} = await import("../lib/cod-cash-handover-v1.mjs");
const {
  getManagerCashState,
  submitAdminShiftSettlement,
} = await import("../lib/cash-settlement-control.mjs");

const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin Shared','admin@shift-flow.test','x','ADMIN',1),
    (2,'Driver Budi','driver@shift-flow.test','x','DRIVER',1),
    (3,'Customer','customer@shift-flow.test','x','CUSTOMER',1),
    (4,'Owner','owner@shift-flow.test','x','OWNER',1),
    (5,'Manager','manager@shift-flow.test','x','MANAGER',1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default,active)
    VALUES(3,3,'Rumah','Alamat Customer Test',0,0,1,1);
`);

const admin = { id: 1, name: "Admin Shared", role: "ADMIN" };
const driver = { id: 2, name: "Driver Budi", role: "DRIVER" };
const owner = { id: 4, name: "Owner", role: "OWNER" };
const manager = { id: 5, name: "Manager", role: "MANAGER" };

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

test("shift aktif pulih setelah relogin dan exact Rp18.000 selesai ke Manager tanpa duplikasi", async () => {
  const operator = await createOwnerAdminOperator(owner, {
    name: "Virsa",
    pin: "2580",
  });
  const started = await startAdminShift(admin, {
    operatorId: operator.id,
    pin: "2580",
  });

  createDeliveredCod(18000);
  const batch = await submitCodBatchCashHandover(driver, {
    cashAmount: 18000,
  });
  await verifyCodBatchWithOperator(admin, batch.id);

  const beforeLogout = await getAdminCashState(admin);
  assert.equal(beforeLogout.current_shift.id, started.id);
  assert.equal(beforeLogout.current_shift.operator_name, "Virsa");
  assert.equal(beforeLogout.current_shift.cash_custody, 18000);

  // Logout hanya menghapus session browser; source of truth shift tetap ledger.
  const afterRelogin = await getAdminCashState(admin);
  assert.equal(afterRelogin.current_shift.id, started.id);
  assert.equal(afterRelogin.current_shift.cash_custody, 18000);

  const submitted = await submitAdminShiftSettlement(admin, {
    shiftId: started.id,
    submittedAmount: 18000,
  });
  assert.equal(submitted.no_cash, false);
  assert.equal(submitted.replayed, false);
  assert.equal(submitted.settlement.shift_id, started.id);
  assert.equal(submitted.settlement.operator_name, "Virsa");
  assert.equal(submitted.settlement.expected_amount, 18000);
  assert.equal(submitted.settlement.submitted_amount, 18000);
  assert.equal(submitted.settlement.admin_overage_amount, 0);
  assert.match(submitted.settlement.slip_number, /^ST-/);

  const closed = await getAdminCashState(admin);
  assert.equal(closed.current_shift, null);

  const managerState = await getManagerCashState(manager);
  assert.equal(managerState.summary.pending_count, 1);
  assert.equal(managerState.summary.pending_amount, 18000);
  assert.equal(managerState.pending[0].shift_id, started.id);

  const replay = await submitAdminShiftSettlement(admin, {
    shiftId: started.id,
    submittedAmount: 18000,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.settlement.id, submitted.settlement.id);
});
