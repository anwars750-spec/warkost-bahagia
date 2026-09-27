import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "notification-test-")),
  "data.db",
);
const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus, acceptDelivery } =
  await import("../lib/domain.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const { listNotifications, readNotification } =
  await import("../lib/notifications.mjs");
const database = db();
for (const role of ["ADMIN", "DRIVER", "CUSTOMER"])
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, role + "@notif.test", "x", role);
database.prepare("INSERT INTO categories(name) VALUES('Food')").run();
database
  .prepare(
    "INSERT INTO products(category_id,name,price) VALUES(1,'Nasi',20000)",
  )
  .run();
database
  .prepare(
    "INSERT INTO addresses(user_id,label,detail) VALUES(3,'Rumah','Alamat panjang benar')",
  )
  .run();
const admin = { id: 1, role: "ADMIN" },
  driver = { id: 2, role: "DRIVER" },
  customer = { id: 3, role: "CUSTOMER" };
test("notifikasi terikat status, role, pembacaan dan duplikasi", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal((await listNotifications(admin)).unread, 1);
  const first = (await listNotifications(customer)).notifications[0];
  await readNotification(admin, first.id);
  assert.equal((await listNotifications(customer)).unread, 1);
  await readNotification(customer, first.id);
  assert.equal((await listNotifications(customer)).unread, 0);
  for (const status of ["CONFIRMED", "PREPARING", "READY"])
    await changeStatus(admin, order.id, status);
  await changeStatus(admin, order.id, "ASSIGNED", driver.id);
  assert.equal((await listNotifications(driver)).unread, 1);
  await acceptDelivery(driver, order.id);
  for (const status of ["PICKED_UP", "ON_DELIVERY", "DELIVERED"])
    await changeStatus(driver, order.id, status);
  const count = (await listNotifications(customer)).notifications.length;
  await assert.rejects(
    changeStatus(driver, order.id, "DELIVERED"),
    /tidak diizinkan/,
  );
  assert.equal((await listNotifications(customer)).notifications.length, count);
  await verifyPayment(admin, order.id, "PAID");
  assert.match(
    (await listNotifications(customer)).notifications[0].message,
    /Pembayaran/,
  );
  await assert.rejects(readNotification(customer, 0), /tidak valid/);
});
