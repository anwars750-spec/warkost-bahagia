import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "manager-control-")),
  "data.db",
);
const { db } = await import("../lib/db.mjs");
const { managerAnalytics, resolveManagerPeriod, formatWeightedQuantity } =
  await import("../lib/manager-analytics.mjs");
const { listCatalog, saveProduct, saveSubcategory } =
  await import("../lib/catalog.mjs");
const { listStock, adjustStock } = await import("../lib/operations.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Manager','manager@control.test','x','MANAGER'),
    (2,'Admin','admin@control.test','x','ADMIN'),
    (3,'Kitchen','kitchen@control.test','x','KITCHEN'),
    (4,'Customer','customer@control.test','x','CUSTOMER');
  INSERT INTO addresses(id,user_id,label,detail) VALUES(1,4,'Rumah','Alamat pelanggan yang lengkap');
  INSERT INTO categories(id,name,active) VALUES(1,'Makanan',1),(2,'Minuman',1),(3,'Bahan Baku',1);
  INSERT INTO product_subcategories(id,category_id,name,active,sort_order) VALUES(1,1,'Makanan Berat',1,10),(2,3,'Kopi',1,10);
  INSERT INTO products(id,category_id,subcategory_id,name,description,price,active,prep_station,stock_quantity,stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold)
    VALUES(1,1,1,'Nasi Manager','Nasi',20000,1,'KITCHEN',20,'PCS',1,1,1,5),
          (2,3,2,'Biji Kopi','Arabika',18000,1,'CASHIER',5000,'GRAM',100,100,100,500);
  INSERT INTO orders(id,customer_id,address_id,status,subtotal,total,created_at) VALUES
    (1,4,1,'DELIVERED',40000,40000,'2026-10-09 03:00:00'),
    (2,4,1,'CONFIRMED',270000,270000,'2026-10-09 04:00:00'),
    (3,4,1,'CANCELLED',20000,20000,'2026-10-09 05:00:00'),
    (4,4,1,'DELIVERED',10000,10000,'2026-10-08 03:00:00');
  INSERT INTO payments(order_id,method,status,amount,paid_at) VALUES
    (1,'QRIS','PAID',40000,'2026-10-09 03:05:00'),
    (2,'BANK_TRANSFER','PAID',270000,'2026-10-09 04:05:00'),
    (3,'QRIS','PAID',20000,'2026-10-09 05:05:00'),
    (4,'QRIS','PAID',10000,'2026-10-08 03:05:00');
  INSERT INTO order_items(order_id,product_id,name,price,quantity,prep_station,stock_unit,price_unit_quantity) VALUES
    (1,1,'Nasi Manager',20000,2,'KITCHEN','PCS',1),
    (2,2,'Biji Kopi',18000,1500,'CASHIER','GRAM',100),
    (3,1,'Nasi Manager',20000,1,'KITCHEN','PCS',1),
    (4,1,'Nasi Manager',10000,1,'KITCHEN','PCS',1);
`);

const manager = { id: 1, role: "MANAGER" };
const now = new Date("2026-10-09T12:00:00Z");

test("periode Manager tervalidasi untuk hari ini dan custom", () => {
  const today = resolveManagerPeriod({ preset: "today" }, now);
  assert.equal(today.fromDate, "2026-10-09");
  assert.equal(today.grouping, "hour");
  const custom = resolveManagerPeriod(
    { preset: "custom", from: "2026-10-01", to: "2026-10-09" },
    now,
  );
  assert.equal(custom.days, 9);
  assert.equal(custom.grouping, "day");
  assert.throws(
    () =>
      resolveManagerPeriod(
        { preset: "custom", from: "2026-10-10", to: "2026-10-01" },
        now,
      ),
    /Rentang/,
  );
});

test("analytics Manager server-authoritative mengecualikan cancelled dan menghitung KPI", async () => {
  await assert.rejects(
    managerAnalytics({ id: 2, role: "ADMIN" }, { preset: "today" }, now),
    (error) => error.status === 403,
  );
  await assert.rejects(
    managerAnalytics(null, { preset: "today" }, now),
    (error) => error.status === 401,
  );
  const result = await managerAnalytics(manager, { preset: "today" }, now);
  assert.equal(result.summary.total_orders, 2);
  assert.equal(result.summary.revenue, 310000);
  assert.equal(result.summary.quantity, 1502);
  assert.equal(result.summary.aov, 155000);
  assert.equal(result.summary.status.paid, 2);
  assert.equal(result.summary.status.waiting, 1);
  assert.equal(result.summary.status.done, 1);
  assert.equal(result.trend.length, 2);
});

test("ranking kategori, subkategori, produk dan contribution benar", async () => {
  const result = await managerAnalytics(manager, { preset: "today" }, now);
  assert.deepEqual(
    result.categories.map((row) => row.name),
    ["Bahan Baku", "Makanan"],
  );
  assert.equal(result.categories[0].revenue, 270000);
  assert.equal(
    result.categories.reduce((sum, row) => sum + row.contribution, 0),
    100,
  );
  assert.equal(result.subcategories[0].name, "Kopi");
  assert.equal(result.products[0].name, "Biji Kopi");
  assert.equal(result.products[0].quantity_label, "1,5 kg");
  assert.equal(formatWeightedQuantity(500, "GRAM"), "500 g");
  assert.equal(formatWeightedQuantity(1000, "GRAM"), "1 kg");
  assert.match(result.insights[0], /Bahan Baku/);
});

test("empty-state analytics disengaja dan tidak memalsukan insight", async () => {
  const result = await managerAnalytics(
    manager,
    { preset: "custom", from: "2026-09-01", to: "2026-09-02" },
    now,
  );
  assert.equal(result.empty, true);
  assert.equal(result.summary.revenue, 0);
  assert.deepEqual(result.insights, []);
});

test("Product Master menyinkronkan scope Customer, Kitchen, Admin, stok, dan snapshot", async () => {
  await saveSubcategory(manager, {
    name: "Rice Bowl",
    categoryId: 1,
    sortOrder: 20,
  });
  await saveProduct(manager, {
    name: "Rice Bowl Sambal Matah",
    description: "Pedas segar",
    price: 25000,
    categoryId: 1,
    subcategoryId: 3,
    active: true,
    stockUnit: "PCS",
    priceUnitQuantity: 1,
    minimumOrderQuantity: 1,
    orderStepQuantity: 1,
    lowStockThreshold: 3,
  });
  await saveProduct(manager, {
    name: "Matcha Latte",
    description: "Matcha",
    price: 22000,
    categoryId: 2,
    active: true,
    stockUnit: "PCS",
    priceUnitQuantity: 1,
    minimumOrderQuantity: 1,
    orderStepQuantity: 1,
    lowStockThreshold: 3,
  });
  const publicCatalog = await listCatalog(false);
  assert.equal(
    publicCatalog.products.some((row) => row.name === "Rice Bowl Sambal Matah"),
    true,
  );
  const kitchen = await listStock({ id: 3, role: "KITCHEN" });
  const admin = await listStock({ id: 2, role: "ADMIN" });
  assert.equal(
    kitchen.products.some((row) => row.name === "Rice Bowl Sambal Matah"),
    true,
  );
  assert.equal(
    kitchen.products.some((row) => row.name === "Matcha Latte"),
    false,
  );
  assert.equal(
    admin.products.some((row) => row.name === "Matcha Latte"),
    true,
  );
  assert.equal(
    admin.products.some((row) => row.name === "Rice Bowl Sambal Matah"),
    false,
  );
  const created = (await listCatalog(true)).products.find(
    (row) => row.name === "Rice Bowl Sambal Matah",
  );
  await adjustStock(manager, {
    productId: created.id,
    quantity: 10,
    reason: "Restock test Manager",
  });
  assert.equal(
    (await listStock(manager)).products.find((row) => row.id === created.id)
      .stock_quantity,
    10,
  );
  await saveProduct(manager, {
    id: 1,
    name: "Nasi Manager",
    description: "Harga baru",
    price: 25000,
    categoryId: 1,
    subcategoryId: 1,
    active: true,
    stockUnit: "PCS",
    priceUnitQuantity: 1,
    minimumOrderQuantity: 1,
    orderStepQuantity: 1,
    lowStockThreshold: 5,
  });
  assert.equal(
    (await listCatalog(false)).products.find((row) => row.id === 1).price,
    25000,
  );
  assert.equal(
    database.prepare("SELECT price FROM order_items WHERE order_id=1").get()
      .price,
    20000,
  );
});

test("deaktivasi menghilangkan produk baru tanpa merusak order historis", async () => {
  await saveProduct(manager, {
    id: 1,
    name: "Nasi Manager",
    description: "Nonaktif",
    price: 25000,
    categoryId: 1,
    subcategoryId: 1,
    active: false,
    stockUnit: "PCS",
    priceUnitQuantity: 1,
    minimumOrderQuantity: 1,
    orderStepQuantity: 1,
    lowStockThreshold: 5,
  });
  assert.equal(
    (await listCatalog(false)).products.some((row) => row.id === 1),
    false,
  );
  const historical = database
    .prepare("SELECT name,price FROM order_items WHERE order_id=1")
    .get();
  assert.equal(historical.name, "Nasi Manager");
  assert.equal(historical.price, 20000);
});

test("kontrak React Manager menyediakan dashboard, filter global, product master, mobile nav tanpa DOM hack", () => {
  const component = fs.readFileSync(
    path.resolve("app/ManagerControlCenter.js"),
    "utf8",
  );
  const page = fs.readFileSync(path.resolve("app/page.js"), "utf8");
  assert.match(component, /manager-dashboard\?\$\{query\}/);
  assert.match(component, /Produk &amp; Menu/);
  assert.match(component, /manager-mobile-nav/);
  assert.match(
    component,
    /category\?\.name === "Makanan"[\s\S]*?"Kitchen"[\s\S]*?: "Admin"/,
  );
  assert.match(
    page,
    /setInventory\(await api\("inventory"[\s\S]*?setStock\(await api\("stock"/,
  );
  assert.doesNotMatch(component, /MutationObserver|querySelector/);
});
