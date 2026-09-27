import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "account-test-")),
  "data.db",
);
process.env.SESSION_SECRET = "account-test-secret-with-over-32-characters";
const { db } = await import("../lib/db.mjs");
const { addAddress, replaceAddress, removeAddress, updateProfile } =
  await import("../lib/account.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const { checkPassword, hashPassword, issueSession, currentUser } =
  await import("../lib/auth.mjs");
const database = db();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Pelanggan','pelanggan@test.local',?,'CUSTOMER')",
  )
  .run(hashPassword("password-awal-yang-panjang"));
database.prepare("INSERT INTO categories(name) VALUES('Food')").run();
database
  .prepare(
    "INSERT INTO products(category_id,name,price) VALUES(1,'Nasi',20000)",
  )
  .run();
const customer = { id: 1, role: "CUSTOMER", name: "Pelanggan" };
test("perubahan alamat mempertahankan histori dan menghalangi checkout alamat nonaktif", async () => {
  const address = await addAddress(customer, {
    label: "Rumah",
    detail: "Jalan Lama Nomor 100",
  });
  const order = await createOrder(customer, {
    addressId: address.id,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  const newAddress = await replaceAddress(customer, address.id, {
    label: "Kantor",
    detail: "Jalan Baru Nomor 200",
  });
  assert.equal(
    database.prepare("SELECT address_id FROM orders WHERE id=?").get(order.id)
      .address_id,
    address.id,
  );
  assert.equal(
    database.prepare("SELECT detail FROM addresses WHERE id=?").get(address.id)
      .detail,
    "Jalan Lama Nomor 100",
  );
  await assert.rejects(
    createOrder(customer, {
      addressId: address.id,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Alamat/,
  );
  await removeAddress(customer, newAddress.id);
  await assert.rejects(
    createOrder(customer, {
      addressId: newAddress.id,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Alamat/,
  );
  await assert.rejects(
    removeAddress({ id: 99, role: "CUSTOMER" }, address.id),
    /tidak ditemukan/,
  );
});
test("ganti password memerlukan password lama dan mencabut sesi lama", async () => {
  const token = await issueSession(customer);
  const req = { cookies: { get: () => ({ value: token }) } };
  assert.ok(await currentUser(req));
  await assert.rejects(
    updateProfile(customer, {
      name: "Nama Baru",
      newPassword: "password-baru-aman-12",
      currentPassword: "salah",
    }),
    /Password saat ini salah/,
  );
  const result = await updateProfile(customer, {
    name: "Nama Baru",
    newPassword: "password-baru-aman-12",
    currentPassword: "password-awal-yang-panjang",
  });
  assert.equal(result.user.name, "Nama Baru");
  assert.equal(await currentUser(req), null);
  assert.ok(
    checkPassword(
      "password-baru-aman-12",
      database.prepare("SELECT password_hash FROM users WHERE id=1").get()
        .password_hash,
    ),
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='PROFILE_UPDATED'",
      )
      .get().n,
    1,
  );
});
