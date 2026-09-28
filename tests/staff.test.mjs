import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "staff-test-")),
  "test.db",
);
process.env.SESSION_SECRET = "staff-test-secret-with-over-32-characters";
const { db } = await import("../lib/db.mjs");
const { createDriver, setDriverActive } = await import("../lib/staff.mjs");
const { createOrder, changeStatus, acceptDelivery, updateStationStatus } =
  await import("../lib/domain.mjs");
const { currentUser, issueSession, hashPassword } =
  await import("../lib/auth.mjs");
const database = db();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@t.test',?,'ADMIN')",
  )
  .run(hashPassword("password-that-is-long"));
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Customer','customer@t.test',?,'CUSTOMER')",
  )
  .run(hashPassword("password-that-is-long"));
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Kitchen','kitchen@t.test',?,'KITCHEN')",
  )
  .run(hashPassword("password-that-is-long"));
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
const kitchen = { id: 3, role: "KITCHEN" };
test("akun driver dilindungi, tugas aktif mencegah nonaktif, sesi dicabut saat dinonaktifkan", async () => {
  await assert.rejects(
    createDriver(customer, {
      name: "Fake",
      email: "fake@test.local",
      password: "a-very-long-password",
    }),
    /Akses/,
  );
  const driver = await createDriver(admin, {
    name: "Driver Baru",
    email: "driver@test.local",
    password: "a-very-long-password",
  });
  await assert.rejects(
    createDriver(admin, {
      name: "Duplicate",
      email: "driver@test.local",
      password: "a-very-long-password",
    }),
    /sudah terdaftar/,
  );
  const token = await issueSession({ id: driver.id, role: "DRIVER" });
  const request = { cookies: { get: () => ({ value: token }) } };
  assert.equal((await currentUser(request)).id, driver.id);
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  await changeStatus(admin, order.id, "CONFIRMED");
  await updateStationStatus(kitchen, order.id, "PREPARING");
  await updateStationStatus(kitchen, order.id, "READY");
  await changeStatus(admin, order.id, "ASSIGNED", driver.id);
  await assert.rejects(
    setDriverActive(admin, driver.id, false),
    /pengantaran aktif/,
  );
  await acceptDelivery({ id: driver.id, role: "DRIVER" }, order.id);
  for (const status of ["PICKED_UP", "ON_DELIVERY", "DELIVERED"])
    await changeStatus({ id: driver.id, role: "DRIVER" }, order.id, status);
  await setDriverActive(admin, driver.id, false);
  assert.equal(await currentUser(request), null);
  await assert.rejects(
    changeStatus(admin, order.id, "ASSIGNED", driver.id),
    /tidak diizinkan/,
  );
  await setDriverActive(admin, driver.id, true);
  assert.equal(await currentUser(request), null);
  const fresh = await issueSession({ id: driver.id, role: "DRIVER" });
  assert.equal(
    (await currentUser({ cookies: { get: () => ({ value: fresh }) } })).id,
    driver.id,
  );
});
