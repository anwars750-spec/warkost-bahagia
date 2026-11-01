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
const {
  addAddress,
  getCustomerAccount,
  replaceAddress,
  removeAddress,
  setDefaultAddress,
  updateProfile,
} = await import("../lib/account.mjs");
const { createOrder, quoteDelivery } = await import("../lib/domain.mjs");
const {
  checkPassword,
  hashPassword,
  issueSession,
  currentUser,
  revokeSession,
} = await import("../lib/auth.mjs");
const database = db();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Pelanggan','pelanggan@test.local',?,'CUSTOMER')",
  )
  .run(hashPassword("password-awal-yang-panjang"));
database
  .prepare(
    "UPDATE users SET phone='628111111111',birth_date='1995-05-10',terms_accepted_at=CURRENT_TIMESTAMP WHERE id=1",
  )
  .run();
database
  .prepare(
    "INSERT INTO users(name,email,phone,birth_date,password_hash,role) VALUES('Pelanggan B','b@test.local','628222222222','1990-01-01',?,'CUSTOMER')",
  )
  .run(hashPassword("password-customer-b-aman"));
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
    latitude: -6.9217,
    longitude: 106.9272,
  });
  const order = await createOrder(customer, {
    addressId: address.id,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  const newAddress = await replaceAddress(customer, address.id, {
    label: "Kantor",
    detail: "Jalan Baru Nomor 200",
    latitude: -6.92,
    longitude: 106.93,
  });
  const second = await addAddress(customer, {
    label: "Rumah orang tua",
    detail: "Jalan Kedua Nomor 300",
  });
  await setDefaultAddress(customer, second.id);
  const third = await addAddress(customer, {
    label: "Kantor cabang",
    detail: "Jalan Ketiga Nomor 400",
  });
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM addresses WHERE user_id=1 AND active=1 AND is_default=1",
      )
      .get().count,
    1,
  );
  await assert.rejects(
    replaceAddress({ id: 2, role: "CUSTOMER" }, second.id, {
      label: "Diserobot",
      detail: "Alamat customer lain tidak boleh diubah",
    }),
    /tidak ditemukan/,
  );
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
  await removeAddress(customer, second.id);
  assert.equal(
    database
      .prepare(
        "SELECT id FROM addresses WHERE user_id=1 AND active=1 AND is_default=1",
      )
      .get().id,
    third.id,
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
      email: "baru@test.local",
      phone: "0811-3333-4444",
      birthDate: "1995-05-10",
      newPassword: "password-baru-aman-12",
      currentPassword: "salah",
    }),
    /Password saat ini salah/,
  );
  const result = await updateProfile(customer, {
    name: "Nama Baru",
    email: "baru@test.local",
    phone: "0811-3333-4444",
    birthDate: "1995-05-10",
    newPassword: "password-baru-aman-12",
    currentPassword: "password-awal-yang-panjang",
  });
  assert.equal(result.user.name, "Nama Baru");
  assert.equal(result.profile.phone, "6281133334444");
  assert.equal("password_hash" in result.profile, false);
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

test("perubahan profil invalid ditolak server", async () => {
  await assert.rejects(
    updateProfile(customer, {
      name: "N",
      email: "bukan-email",
      phone: "123",
      birthDate: "2099-01-01",
    }),
    /tidak valid/,
  );
});

test("profil dan daftar alamat selalu mengikuti customer login tanpa password", async () => {
  const own = await getCustomerAccount(customer);
  const other = await getCustomerAccount({ id: 2, role: "CUSTOMER" });
  assert.equal(own.profile.email, "baru@test.local");
  assert.equal(other.profile.email, "b@test.local");
  assert.equal("password_hash" in own.profile, false);
  assert.deepEqual(Object.keys(own.profile).sort(), [
    "birth_date",
    "email",
    "name",
    "phone",
  ]);
});

test("quick address checkout tetap milik customer, non-default, dan memakai quote server", async () => {
  await assert.rejects(
    addAddress(null, {
      label: "Guest",
      detail: "Alamat guest tidak boleh disimpan",
    }),
    /Silakan masuk terlebih dahulu/,
  );
  const defaultBefore = database
    .prepare(
      "SELECT id FROM addresses WHERE user_id=1 AND active=1 AND is_default=1",
    )
    .get().id;
  const quick = await addAddress(customer, {
    label: "Lokasi checkout",
    detail: "Jalan Quick Address Nomor 10",
    latitude: -6.8677,
    longitude: 106.9272,
    isDefault: false,
  });
  const refreshed = await getCustomerAccount(customer);
  assert.ok(refreshed.addresses.some((address) => address.id === quick.id));
  assert.equal(
    database
      .prepare(
        "SELECT id FROM addresses WHERE user_id=1 AND active=1 AND is_default=1",
      )
      .get().id,
    defaultBefore,
  );
  await assert.rejects(
    replaceAddress({ id: 2, role: "CUSTOMER" }, quick.id, {
      label: "Bukan milik saya",
      detail: "Alamat customer lain tidak boleh diubah",
    }),
    /tidak ditemukan/,
  );
  const quote = await quoteDelivery(customer, quick.id);
  assert.equal(quote.available, true);
  const order = await createOrder(customer, {
    addressId: quick.id,
    method: "CASH",
    deliveryFee: 1,
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(order.deliveryFee, quote.delivery_fee);
  assert.equal(order.total, order.subtotal + quote.delivery_fee);
});

test("logout mencabut sesi aktif", async () => {
  const token = await issueSession(customer);
  const request = { cookies: { get: () => ({ value: token }) } };
  assert.ok(await currentUser(request));
  await revokeSession(request);
  assert.equal(await currentUser(request), null);
});
