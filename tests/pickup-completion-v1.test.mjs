import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-pickup-complete-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../lib/db.mjs");
const { completePickupOrder } = await import("../lib/domain.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Customer','pickup-complete-customer@test.local','hash','CUSTOMER',1),
    (2,'Admin','pickup-complete-admin@test.local','hash','ADMIN',1),
    (4,'Driver','pickup-complete-driver@test.local','hash','DRIVER',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES(1,1,'Ambil di Warkost','Warkost Bahagia · Ambil di tempat');
`);

beforeEach(() => {
  database.exec(`
    DELETE FROM loyalty_transactions;
    DELETE FROM loyalty_accounts;
    DELETE FROM notifications;
    DELETE FROM audit_logs;
    DELETE FROM order_events;
    DELETE FROM deliveries;
    DELETE FROM payments;
    DELETE FROM orders;
  `);
});

after(() => { try { database.close(); } catch {} fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function insertOrder({ id, fulfillment = "PICKUP", status = "READY", payment = "PAID" }) {
  database
    .prepare(
      `INSERT INTO orders(id,customer_id,address_id,status,subtotal,delivery_fee,distance_meters,total,fulfillment_type)
       VALUES(?,1,1,?,20000,0,0,20000,?)`,
    )
    .run(id, status, fulfillment);
  database
    .prepare("INSERT INTO payments(order_id,method,status,amount) VALUES(?,'QRIS',?,20000)")
    .run(id, payment);
}

test("paid READY pickup completes without delivery and awards loyalty exactly once", async () => {
  insertOrder({ id: 201 });
  const admin = { id: 2, role: "ADMIN" };

  const first = await completePickupOrder(admin, 201);
  assert.equal(first.status, "DELIVERED");
  assert.equal(first.fulfillmentType, "PICKUP");
  assert.equal(first.pickup, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM deliveries WHERE order_id=201").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM order_events WHERE order_id=201 AND previous_status='READY' AND next_status='DELIVERED'").get().total, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action='PICKUP_ORDER_COMPLETED'").get().total, 1);

  const ledgerBefore = database.prepare("SELECT COUNT(*) AS total FROM loyalty_transactions WHERE order_id=201").get().total;
  const second = await completePickupOrder(admin, 201);
  const ledgerAfter = database.prepare("SELECT COUNT(*) AS total FROM loyalty_transactions WHERE order_id=201").get().total;
  assert.equal(second.replayed, true);
  assert.equal(ledgerBefore, 1);
  assert.equal(ledgerAfter, ledgerBefore);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM order_events WHERE order_id=201").get().total, 1);
});

test("pickup completion enforces role, fulfillment and QRIS paid gates", async () => {
  insertOrder({ id: 202 });
  insertOrder({ id: 203, fulfillment: "DELIVERY" });
  insertOrder({ id: 204, payment: "PENDING" });

  await assert.rejects(() => completePickupOrder({ id: 4, role: "DRIVER" }, 202), /Akses ditolak/);
  await assert.rejects(() => completePickupOrder({ id: 2, role: "ADMIN" }, 203), /bukan pesanan ambil di tempat/i);
  await assert.rejects(() => completePickupOrder({ id: 2, role: "ADMIN" }, 204), /QRIS belum terverifikasi/i);
});

test("native React owns the pickup completion control", () => {
  const page = fs.readFileSync("app/page.js", "utf8");
  const runtime = fs.readFileSync("app/CustomerQrisOnlyRuntime.js", "utf8");
  assert.match(page, /Pesanan Sudah Diambil/);
  assert.match(page, /action\("pickup-complete"/);
  assert.match(page, /\["ADMIN", "OWNER"\]\.includes\(role\)/);
  assert.doesNotMatch(runtime, /PickupOrderCompletionRuntime/);
});
