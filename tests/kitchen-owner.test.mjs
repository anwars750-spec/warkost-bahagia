import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "kitchen-owner-test-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const {
  createOrder,
  changeStatus,
  claimDelivery,
  listDriverOrders,
  updateStationStatus,
} = await import("../lib/domain.mjs");
const { adjustStock, listAuditLogs, listStock } =
  await import("../lib/operations.mjs");

const database = db();
for (const role of [
  "ADMIN",
  "KITCHEN",
  "OWNER",
  "CUSTOMER",
  "DRIVER",
  "MANAGER",
])
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, role.toLowerCase() + "@ops.test", "x", role);
database
  .prepare("INSERT INTO categories(name) VALUES('Makanan'),('Minuman')")
  .run();
database
  .prepare(
    "INSERT INTO products(category_id,name,price,prep_station,stock_quantity) VALUES(1,'Nasi',20000,'KITCHEN',20),(2,'Es Teh',5000,'CASHIER',20)",
  )
  .run();
database
  .prepare(
    "INSERT INTO addresses(user_id,label,detail) VALUES(4,'Rumah','Alamat operasional yang valid')",
  )
  .run();

const admin = { id: 1, role: "ADMIN" };
const kitchen = { id: 2, role: "KITCHEN" };
const owner = { id: 3, role: "OWNER" };
const customer = { id: 4, role: "CUSTOMER" };
const driver = { id: 5, role: "DRIVER" };
const manager = { id: 6, role: "MANAGER" };

test("mixed order menunggu kedua stasiun dan stok tercatat serta pulih saat batal", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ],
  });
  await changeStatus(admin, order.id, "CONFIRMED");
  assert.deepEqual(
    database
      .prepare("SELECT stock_quantity FROM products ORDER BY id")
      .all()
      .map((row) => row.stock_quantity),
    [18, 19],
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM stock_movements WHERE kind='SALE'")
      .get().count,
    2,
  );
  await assert.rejects(
    changeStatus(admin, order.id, "READY"),
    /tidak diizinkan|hanya dapat diubah oleh stasiun/,
  );
  await assert.rejects(
    updateStationStatus(kitchen, order.id, "READY"),
    /tidak diizinkan/,
  );
  await updateStationStatus(kitchen, order.id, "PREPARING");
  await updateStationStatus(kitchen, order.id, "READY");
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id=?").get(order.id)
      .status,
    "PREPARING",
  );
  await updateStationStatus(admin, order.id, "PREPARING");
  await updateStationStatus(admin, order.id, "READY");
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id=?").get(order.id)
      .status,
    "READY",
  );
  await changeStatus(owner, order.id, "CANCELLED");
  assert.deepEqual(
    database
      .prepare("SELECT stock_quantity FROM products ORDER BY id")
      .all()
      .map((row) => row.stock_quantity),
    [20, 20],
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM stock_movements WHERE kind='RESTORE'",
      )
      .get().count,
    2,
  );
});

test("RBAC stok memberi Manager/Owner akses dan menolak Admin", async () => {
  await assert.rejects(
    adjustStock(admin, {
      productId: 1,
      quantity: 5,
      reason: "Belanja harian",
    }),
    /Akses ditolak/,
  );
  await adjustStock(manager, {
    productId: 1,
    quantity: 5,
    reason: "Belanja harian",
  });
  await adjustStock(manager, {
    productId: 1,
    quantity: -1,
    reason: "Koreksi",
  });
  await adjustStock(owner, {
    productId: 1,
    quantity: -2,
    reason: "Bahan rusak",
  });
  assert.equal((await listStock(owner)).products[1]?.stock_quantity >= 0, true);
  const audit = await listAuditLogs(owner);
  assert.ok(audit.logs.some((row) => row.action === "STOCK_ADJUSTED"));
  await assert.rejects(listAuditLogs(admin), /Akses ditolak/);
});

test("self-claim serentak menolak pesanan keenam pada Driver yang sama", async () => {
  const readyOrders = [];
  for (let index = 0; index < 6; index += 1) {
    const order = await createOrder(customer, {
      addressId: 1,
      method: "CASH",
      items: [{ productId: 2, quantity: 1 }],
    });
    await changeStatus(admin, order.id, "CONFIRMED");
    await updateStationStatus(admin, order.id, "PREPARING");
    await updateStationStatus(admin, order.id, "READY");
    readyOrders.push(order);
  }
  const outcomes = await Promise.allSettled(
    readyOrders.map((order) => claimDelivery(driver, order.id)),
  );
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    5,
  );
  assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  assert.match(
    outcomes.find((item) => item.status === "rejected").reason.message,
    /kapasitas 5/,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM orders WHERE status='ASSIGNED'")
      .get().count,
    5,
  );
  assert.equal(
    (await listDriverOrders(driver)).some(
      (entry) => entry.id === readyOrders[5].id && entry.available_to_claim,
    ),
    false,
  );
});
