import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "setting-test-")),
  "data.db",
);
const { db } = await import("../lib/db.mjs");
const { saveSettings, getSettings } = await import("../lib/settings.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const { createOrder, changeStatus, acceptDelivery, updateStationStatus } =
  await import("../lib/domain.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const database = db();
for (const role of ["ADMIN", "DRIVER", "CUSTOMER", "KITCHEN"])
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, role + "@test.local", "x", role);
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
const kitchen = { id: 4, role: "KITCHEN" };
test("pengaturan hanya admin, brand tersimpan dan earn rate tetap Rp10.000", async () => {
  await assert.rejects(getSettings(customer), /Akses/);
  await assert.rejects(
    saveSettings(admin, { brandName: "X", rupiahPerPoint: 1 }),
    /tidak valid/,
  );
  await saveSettings(admin, {
    brandName: "Kafe Test",
    rupiahPerPoint: 5000,
    deliveryFreeKm: 5,
    deliveryFeePerKm: 3000,
    deliveryMaxKm: 15,
  });
  assert.deepEqual(
    (({ deliveryFreeKm, deliveryFeePerKm, deliveryMaxKm }) => ({
      deliveryFreeKm,
      deliveryFeePerKm,
      deliveryMaxKm,
    }))(await getSettings(admin)),
    { deliveryFreeKm: 5, deliveryFeePerKm: 3000, deliveryMaxKm: 15 },
  );
  await assert.rejects(
    saveSettings(admin, {
      brandName: "Kafe Test",
      rupiahPerPoint: 5000,
      deliveryFreeKm: 16,
      deliveryFeePerKm: 3000,
      deliveryMaxKm: 15,
    }),
    /Konfigurasi ongkir tidak valid/,
  );
  assert.equal((await listCatalog()).brand, "Kafe Test");
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1 }],
  });
  await changeStatus(admin, order.id, "CONFIRMED");
  await verifyPayment(admin, order.id, "PAID");
  await updateStationStatus(kitchen, order.id, "PREPARING");
  await updateStationStatus(kitchen, order.id, "READY");
  await changeStatus(admin, order.id, "ASSIGNED", driver.id);
  await acceptDelivery(driver, order.id);
  for (const status of ["PICKED_UP", "ON_DELIVERY", "DELIVERED"])
    await changeStatus(driver, order.id, status);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=?")
      .get(customer.id).balance,
    2,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='SETTINGS_UPDATED'",
      )
      .get().n,
    1,
  );
});
