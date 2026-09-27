import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "customer-test-")), "data.db");
process.env.SESSION_SECRET = "customer-test-secret-longer-than-32-characters";
const { db } = await import("../lib/db.mjs");
const { listCustomers, setCustomerActive } = await import("../lib/customers.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const { issueSession, currentUser, hashPassword } = await import("../lib/auth.mjs");
const database = db();
const insert = database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'CUSTOMER')");
database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@customer.test','x','ADMIN')").run();
insert.run("Pelanggan", "one@customer.test", hashPassword("password-customer-one"));
database.prepare("INSERT INTO categories(name) VALUES('Menu')").run();
database.prepare("INSERT INTO products(category_id,name,price) VALUES(1,'Nasi',20000)").run();
database.prepare("INSERT INTO addresses(user_id,label,detail) VALUES(2,'Rumah','Jalan yang panjang sekali')").run();
const admin = { id: 1, role: "ADMIN" }, customer = { id: 2, role: "CUSTOMER" };

test("admin dapat mencari tanpa membocorkan password dan role lain ditolak", async () => {
  await assert.rejects(listCustomers(customer), /Akses/);
  const list = await listCustomers(admin, "one@customer.test");
  assert.equal(list.customers.length, 1);
  assert.equal(list.customers[0].order_count, 0);
  assert.equal(Object.hasOwn(list.customers[0], "password_hash"), false);
  assert.equal((await listCustomers(admin, "%")).customers.length, 0);
  for (let n = 0; n < 51; n++)
    insert.run("Pelanggan " + n, `bulk-${n}@customer.test`, "x");
  const first = await listCustomers(admin);
  const second = await listCustomers(admin, "", first.nextCursor);
  assert.equal(first.customers.length, 50);
  assert.equal(second.customers.length, 2);
  assert.equal(second.nextCursor, null);
  assert.ok(second.customers.every((entry) => entry.id < first.nextCursor));
});

test("nonaktif customer mencabut sesi dan dilarang selama order aktif", async () => {
  const token = await issueSession(customer);
  const request = { cookies: { get: () => ({ value: token }) } };
  const order = await createOrder(customer, {
    addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 1 }],
  });
  await assert.rejects(setCustomerActive(admin, customer.id, false), /pesanan aktif/);
  await changeStatus(admin, order.id, "CANCELLED");
  await setCustomerActive(admin, customer.id, false);
  assert.equal(await currentUser(request), null);
  await assert.rejects(createOrder(customer, {
    addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 1 }],
  }), /tidak aktif/);
  await setCustomerActive(admin, customer.id, true);
  assert.equal(await currentUser(request), null);
  await assert.rejects(setCustomerActive(customer, customer.id, false), /Akses/);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='CUSTOMER_ACTIVE_CHANGED'").get().n, 2);
});
