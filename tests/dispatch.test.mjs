import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-test-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const {
  claimDelivery,
  changeStatus,
  createOrder,
  listDriverOrders,
  updateStationStatus,
} = await import("../lib/domain.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Owner','owner@dispatch.test','x','OWNER',1),
    (2,'Admin','admin@dispatch.test','x','ADMIN',1),
    (3,'Kitchen','kitchen@dispatch.test','x','KITCHEN',1),
    (4,'Customer','customer@dispatch.test','x','CUSTOMER',1),
    (5,'Driver A','driver-a@dispatch.test','x','DRIVER',1),
    (6,'Driver B','driver-b@dispatch.test','x','DRIVER',1),
    (7,'Driver Offline','driver-offline@dispatch.test','x','DRIVER',0),
    (8,'Manager','manager@dispatch.test','x','MANAGER',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan'),(2,'Minuman');
  INSERT INTO products(id,category_id,name,price,prep_station,stock_quantity) VALUES
    (1,1,'Nasi',20000,'KITCHEN',100),
    (2,2,'Es Teh',5000,'CASHIER',100);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,4,'Rumah','Alamat pengantaran yang valid');
`);

const owner = { id: 1, role: "OWNER" };
const admin = { id: 2, role: "ADMIN" };
const kitchen = { id: 3, role: "KITCHEN" };
const customer = { id: 4, role: "CUSTOMER" };
const driverA = { id: 5, role: "DRIVER" };
const driverB = { id: 6, role: "DRIVER" };
const offlineDriver = { id: 7, role: "DRIVER" };
const manager = { id: 8, role: "MANAGER" };

async function createPreparedOrder(productIds) {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: productIds.map((productId) => ({ productId, quantity: 1 })),
  });
  await changeStatus(admin, order.id, "CONFIRMED");
  return order;
}

async function readyStation(orderId, actor) {
  await updateStationStatus(actor, orderId, "PREPARING");
  return updateStationStatus(actor, orderId, "READY");
}

test("pool READY mengikuti kebutuhan stasiun makanan, minuman, dan campuran", async () => {
  const food = await createPreparedOrder([1]);
  assert.equal(
    (await listDriverOrders(driverA)).some((row) => row.id === food.id),
    false,
  );
  await readyStation(food.id, kitchen);
  assert.equal(
    (await listDriverOrders(driverA)).find((row) => row.id === food.id)
      .available_to_claim,
    1,
  );

  const beverage = await createPreparedOrder([2]);
  await readyStation(beverage.id, admin);
  assert.equal(
    (await listDriverOrders(driverA)).find((row) => row.id === beverage.id)
      .available_to_claim,
    1,
  );

  const mixed = await createPreparedOrder([1, 2]);
  await readyStation(mixed.id, kitchen);
  assert.equal(
    (await listDriverOrders(driverA)).some((row) => row.id === mixed.id),
    false,
  );
  await readyStation(mixed.id, admin);
  assert.equal(
    (await listDriverOrders(driverA)).find((row) => row.id === mixed.id)
      .available_to_claim,
    1,
  );
});

test("Driver aktif self-claim, duplicate idempotent, dan claim tersimpan", async () => {
  const order = await createPreparedOrder([1]);
  await readyStation(order.id, kitchen);
  const first = await claimDelivery(driverA, order.id);
  const duplicate = await claimDelivery(driverA, order.id);
  assert.equal(first.status, "ASSIGNED");
  assert.equal(duplicate.duplicate, true);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM deliveries WHERE order_id=?")
      .get(order.id).count,
    1,
  );
  const delivery = database
    .prepare("SELECT driver_id,accepted_at FROM deliveries WHERE order_id=?")
    .get(order.id);
  assert.equal(delivery.driver_id, driverA.id);
  assert.ok(delivery.accepted_at);
  assert.equal(
    (await listDriverOrders(driverB)).some((row) => row.id === order.id),
    false,
  );
});

test("dua Driver berlomba dan hanya satu memenangkan pesanan", async () => {
  const order = await createPreparedOrder([2]);
  await readyStation(order.id, admin);
  const results = await Promise.allSettled([
    claimDelivery(driverA, order.id),
    claimDelivery(driverB, order.id),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM deliveries WHERE order_id=?")
      .get(order.id).count,
    1,
  );
});

test("Driver offline, role tanpa izin, unauthenticated, dan assignment Admin ditolak", async () => {
  const order = await createPreparedOrder([1]);
  await readyStation(order.id, kitchen);
  await assert.rejects(
    claimDelivery(offlineDriver, order.id),
    /offline|tidak aktif/,
  );
  for (const actor of [admin, owner, manager, kitchen, customer])
    await assert.rejects(
      claimDelivery(actor, order.id),
      (error) => error.status === 403,
    );
  await assert.rejects(
    claimDelivery(null, order.id),
    (error) => error.status === 401,
  );
  await assert.rejects(
    changeStatus(admin, order.id, "ASSIGNED", driverA.id),
    (error) => error.status === 403,
  );
  await assert.rejects(listDriverOrders(offlineDriver), /offline|tidak aktif/);
});

test("UI menghapus assignment Admin dan menyediakan self-claim Driver", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/page.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /Pilih driver|Tugaskan driver/);
  assert.match(source, /Pesanan siap diantar/);
  assert.match(source, /Ambil Pesanan/);
  assert.match(source, /claim-delivery/);
});
