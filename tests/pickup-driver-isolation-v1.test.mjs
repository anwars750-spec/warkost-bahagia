import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-pickup-driver-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
const { db } = await import("../lib/db.mjs");
const { listDriverOrders, claimDelivery, claimReadyDeliveries } = await import("../lib/domain.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Customer','pickup-driver-customer@test.local','hash','CUSTOMER',1),
    (4,'Driver','pickup-driver@test.local','hash','DRIVER',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES(1,1,'Rumah','Alamat pengujian');
`);

beforeEach(() => {
  database.exec("DELETE FROM deliveries; DELETE FROM payments; DELETE FROM orders;");
  database.exec(`
    INSERT INTO orders(id,customer_id,address_id,status,subtotal,delivery_fee,distance_meters,total,fulfillment_type)
    VALUES(101,1,1,'READY',18000,0,0,18000,'PICKUP'),
          (102,1,1,'READY',18000,5000,5000,23000,'DELIVERY');
    INSERT INTO payments(order_id,method,status,amount) VALUES
      (101,'QRIS','PAID',18000),(102,'QRIS','PAID',23000);
  `);
});

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("driver queue and single claim exclude pickup from persisted fulfillment type", async () => {
  const driver = { id: 4, role: "DRIVER" };
  const rows = await listDriverOrders(driver);
  assert.deepEqual(rows.map((row) => row.id), [102]);

  await assert.rejects(
    () => claimDelivery(driver, 101),
    /Pesanan ambil di tempat tidak membutuhkan driver/,
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM deliveries WHERE order_id=101").get().total, 0);
});

test("batch claim atomically claims delivery orders only", async () => {
  const driver = { id: 4, role: "DRIVER" };
  const result = await claimReadyDeliveries(driver);
  assert.deepEqual(result.claimedOrderIds, [102]);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM deliveries WHERE order_id=101").get().total, 0);
  assert.equal(database.prepare("SELECT driver_id FROM deliveries WHERE order_id=102").get().driver_id, 4);
});
