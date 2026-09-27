import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "checkout-test-")), "data.db");
const { db } = await import("../lib/db.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const database = db();
database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@idempotent.test','x','ADMIN')").run();
database.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Customer','customer@idempotent.test','x','CUSTOMER')").run();
database.prepare("INSERT INTO categories(name) VALUES('Menu')").run();
database.prepare("INSERT INTO products(category_id,name,price) VALUES(1,'Kopi',15000)").run();
database.prepare("INSERT INTO addresses(user_id,label,detail) VALUES(2,'Rumah','Jalan menuju rumah panjang')").run();
const customer = { id: 2, role: "CUSTOMER" };

test("checkout serentak dengan kunci sama menghasilkan satu order", async () => {
  const payload = {
    addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 2 }],
    idempotencyKey: crypto.randomUUID(),
  };
  const [first, second] = await Promise.all([
    createOrder(customer, payload),
    createOrder(customer, payload),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(first.total, 30000);
  assert.equal([first, second].filter((entry) => entry.replayed).length, 1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM orders").get().n, 1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM payments").get().n, 1);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM notifications").get().n, 2);
  await assert.rejects(
    createOrder(customer, { ...payload, items: [{ productId: 1, quantity: 1 }] }),
    { status: 409 },
  );
  assert.equal(database.prepare("SELECT COUNT(*) n FROM orders").get().n, 1);
  await assert.rejects(createOrder(customer, { ...payload, idempotencyKey: "invalid" }), /Kunci/);
});
