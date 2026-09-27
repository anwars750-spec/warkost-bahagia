import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "report-test-")), "data.db");
const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const { dailyReport } = await import("../lib/reports.mjs");
const database = db();
database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@report.test','x','ADMIN')").run();
database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Cust','cust@report.test','x','CUSTOMER')").run();
database.prepare("INSERT INTO categories(name) VALUES('Makanan')").run();
database.prepare("INSERT INTO products(category_id,name,price) VALUES(1,'Nasi',20000)").run();
database.prepare("INSERT INTO addresses(user_id,label,detail) VALUES(2,'Rumah','Alamat cukup panjang')").run();
const admin = { id: 1, role: "ADMIN" }, customer = { id: 2, role: "CUSTOMER" };
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

test("laporan hanya admin, tanggal valid, revenue dari pembayaran lunas", async () => {
  await assert.rejects(dailyReport(customer, date), /Akses/);
  await assert.rejects(dailyReport(admin, "2026-02-30"), /Tanggal/);
  const paidOrder = await createOrder(customer, {
    addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 2 }],
  });
  const cancelledOrder = await createOrder(customer, {
    addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 1 }],
  });
  await changeStatus(admin, cancelledOrder.id, "CANCELLED");
  const before = await dailyReport(admin, date);
  assert.equal(before.orders.count, 2);
  assert.equal(before.orders.order_value, 40000);
  assert.equal(before.paid.revenue, 0);
  assert.equal(before.products[0].quantity, 2);
  await verifyPayment(admin, paidOrder.id, "PAID");
  const after = await dailyReport(admin, date);
  assert.equal(after.paid.count, 1);
  assert.equal(after.paid.revenue, 40000);
  assert.equal(after.statuses.find((row) => row.status === "CANCELLED").count, 1);
});
