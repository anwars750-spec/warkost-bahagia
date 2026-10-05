import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-test-")),
  "test.db",
);
process.env.SESSION_SECRET =
  "a-secure-test-secret-with-more-than-32-characters";
const { db } = await import("../lib/db.mjs");
const { hashPassword, checkPassword, issueSession, sessionSecret } =
  await import("../lib/auth.mjs");
const { createOrder, changeStatus, claimDelivery, updateStationStatus } =
  await import("../lib/domain.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const database = db();
const insert = database.prepare(
  "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
);
let people = {};
for (const role of ["CUSTOMER", "ADMIN", "DRIVER", "KITCHEN"]) {
  const id = Number(
    insert.run(
      role,
      role + "@test.local",
      hashPassword("strongpassword12"),
      role,
    ).lastInsertRowid,
  );
  people[role] = { id, role };
}
database.prepare("INSERT INTO categories(name) VALUES('Makanan')").run();
database
  .prepare(
    "INSERT INTO products(name,price,category_id) VALUES('Nasi Goreng',25000,1)",
  )
  .run();
database
  .prepare(
    "INSERT INTO addresses(user_id,label,detail) VALUES(?,'Rumah','Alamat panjang valid')",
  )
  .run(people.CUSTOMER.id);
test("password dan sesi bekerja", async () => {
  assert.ok(
    checkPassword(
      "strongpassword12",
      database
        .prepare("SELECT password_hash FROM users WHERE id=?")
        .get(people.ADMIN.id).password_hash,
    ),
  );
  assert.ok(await issueSession(people.ADMIN));
});
test("produksi menolak secret sesi kosong atau pendek", () => {
  const previousMode = process.env.NODE_ENV;
  const previousSecret = process.env.SESSION_SECRET;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    assert.throws(() => sessionSecret(), /minimal 32 byte/);
    process.env.SESSION_SECRET = "short";
    assert.throws(() => sessionSecret(), /minimal 32 byte/);
    process.env.SESSION_SECRET =
      "a-secure-test-secret-with-more-than-32-characters";
    assert.ok(sessionSecret().length >= 32);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});
test("order sampai delivered, poin tepat sekali, otorisasi dan status tervalidasi", async () => {
  await assert.rejects(
    createOrder(people.DRIVER, {
      addressId: 1,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Akses/,
  );
  const o = await createOrder(people.CUSTOMER, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 2 }],
  });
  assert.equal(o.total, 50000);
  await assert.rejects(
    changeStatus(people.ADMIN, o.id, "DELIVERED"),
    /tidak diizinkan/,
  );
  await changeStatus(people.ADMIN, o.id, "CONFIRMED");
  await verifyPayment(people.ADMIN, o.id, "PAID");
  await updateStationStatus(people.KITCHEN, o.id, "PREPARING");
  await updateStationStatus(people.KITCHEN, o.id, "READY");
  await claimDelivery(people.DRIVER, o.id);
  for (const status of ["PICKED_UP", "ON_DELIVERY", "DELIVERED"])
    await changeStatus(people.DRIVER, o.id, status);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=?")
      .get(people.CUSTOMER.id).balance,
    5,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) n FROM loyalty_transactions WHERE order_id=?")
      .get(o.id).n,
    1,
  );
  await assert.rejects(
    changeStatus(people.DRIVER, o.id, "DELIVERED"),
    /tidak diizinkan/,
  );
});
test("checkout menolak alamat dan produk tidak aktif", async () => {
  await assert.rejects(
    createOrder(people.CUSTOMER, {
      addressId: 999,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Alamat/,
  );
  database.prepare("UPDATE products SET active=0 WHERE id=1").run();
  await assert.rejects(
    createOrder(people.CUSTOMER, {
      addressId: 1,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /tidak tersedia/,
  );
});
