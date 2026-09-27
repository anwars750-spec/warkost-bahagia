import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "payment-test-")),
  "data.db",
);
const { db } = await import("../lib/db.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const database = db();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@pay.test','x','ADMIN')",
  )
  .run();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Customer','cust@pay.test','x','CUSTOMER')",
  )
  .run();
database.prepare("INSERT INTO categories(name) VALUES('Food')").run();
database
  .prepare(
    "INSERT INTO products(category_id,name,price) VALUES(1,'Nasi',20000)",
  )
  .run();
database
  .prepare(
    "INSERT INTO addresses(user_id,label,detail) VALUES(2,'Rumah','Alamat panjang benar')",
  )
  .run();
const admin = { id: 1, role: "ADMIN" },
  customer = { id: 2, role: "CUSTOMER" };
test("verifikasi pembayaran atomic, role, duplikasi dan pembatalan", async () => {
  const first = await createOrder(customer, {
    addressId: 1,
    method: "BANK_TRANSFER",
    items: [{ productId: 1, quantity: 1 }],
  });
  await assert.rejects(verifyPayment(customer, first.id, "PAID"), /Akses/);
  await verifyPayment(admin, first.id, "PAID");
  await assert.rejects(
    changeStatus(admin, first.id, "CANCELLED"),
    /refund/,
  );
  assert.equal(
    database
      .prepare("SELECT status,paid_at FROM payments WHERE order_id=?")
      .get(first.id).status,
    "PAID",
  );
  assert.ok(database.prepare("SELECT paid_at FROM payments WHERE order_id=?").get(first.id).paid_at);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id=?").get(first.id).status, "PENDING");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='PAYMENT_VERIFIED'",
      )
      .get().n,
    1,
  );
  await assert.rejects(verifyPayment(admin, first.id, "PAID"), /tidak dapat/);
  const second = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  await changeStatus(admin, second.id, "CANCELLED");
  assert.equal(
    database.prepare("SELECT status FROM payments WHERE order_id=?").get(second.id).status,
    "CANCELLED",
  );
  await assert.rejects(verifyPayment(admin, second.id, "PAID"), /tidak dapat/);
  const third = await createOrder(customer, {
    addressId: 1,
    method: "BANK_TRANSFER",
    items: [{ productId: 1, quantity: 1 }],
  });
  const racing = await Promise.allSettled([
    verifyPayment(admin, third.id, "PAID"),
    changeStatus(admin, third.id, "CANCELLED"),
  ]);
  assert.equal(racing.filter((result) => result.status === "fulfilled").length, 1);
  const final = database
    .prepare("SELECT o.status order_status,p.status payment_status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=?")
    .get(third.id);
  assert.notDeepEqual(final, { order_status: "CANCELLED", payment_status: "PAID" });
});
