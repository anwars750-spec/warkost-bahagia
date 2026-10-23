import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-unlimited-stock-"));
process.env.DATABASE_PATH = path.join(directory, "data.db");
process.env.WARKOST_TEST_STORE_NOW_MS = String(Date.parse("2026-10-23T05:00:00.000Z"));

const { db } = await import("../lib/db.mjs");
const store = await import("../lib/store.mjs");
const { saveProduct, listCatalog } = await import("../lib/catalog.mjs");
const { adjustStock, listStock } = await import("../lib/operations.mjs");
const { createOrder, commitOrderStock, DomainError } = await import("../lib/domain.mjs");

const database = db();
const manager = { id: 20, role: "MANAGER" };
const customer = { id: 10, role: "CUSTOMER" };

after(async () => {
  try { await store.close(); } catch {}
  try { database.close(); } catch {}
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (10,'Customer Unlimited','unlimited-customer@test.local','x','CUSTOMER',1),
    (20,'Manager Unlimited','unlimited-manager@test.local','x','MANAGER',1);
  INSERT OR IGNORE INTO categories(id,name,active) VALUES(900,'Makanan',1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default,active)
    VALUES(900,10,'Rumah','Alamat test unlimited stock',-6.9217,106.9272,1,1);
`);

function productInput(overrides = {}) {
  return {
    name: "Produk Unlimited Test",
    description: "Produk test unlimited",
    price: 10000,
    categoryId: 900,
    subcategoryId: null,
    imageUrl: "",
    stockUnit: "PCS",
    priceUnitQuantity: 1,
    minimumOrderQuantity: 1,
    orderStepQuantity: 1,
    lowStockThreshold: 2,
    active: true,
    unlimitedStock: true,
    ...overrides,
  };
}

test("schema Unlimited Stock V1 tersedia dan default tetap finite", () => {
  const columns = database.prepare("PRAGMA table_info(products)").all();
  assert.ok(columns.some((column) => column.name === "unlimited_stock"));
  const migration = fs.readFileSync(path.resolve("migrations/031_unlimited_stock_v1.sql"), "utf8");
  assert.match(migration, /unlimited_stock BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("Manager dapat menyimpan flag unlimited dan Customer catalog selalu in-stock", async () => {
  await saveProduct(manager, productInput());
  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");
  assert.equal(Number(product.unlimited_stock), 1);
  assert.equal(Number(product.stock_quantity), 0);

  const catalog = await listCatalog(false);
  const publicProduct = catalog.products.find((row) => Number(row.id) === Number(product.id));
  assert.equal("unlimited_stock" in publicProduct, false);
  assert.equal(Number(publicProduct.in_stock), 1);
});

test("produk finite dengan stok nol tetap tidak tersedia", async () => {
  await saveProduct(manager, productInput({ name: "Produk Finite Test", unlimitedStock: false }));
  const catalog = await listCatalog(false);
  const finite = catalog.products.find((row) => row.name === "Produk Finite Test");
  const finiteDb = database.prepare("SELECT unlimited_stock FROM products WHERE name=?").get("Produk Finite Test");
  assert.equal(Number(finiteDb.unlimited_stock), 0);
  assert.equal("unlimited_stock" in finite, false);
  assert.equal(Number(finite.in_stock), 0);
});

test("checkout unlimited membuat reservation tetapi commit tidak mengurangi stok dan tetap idempotent", async () => {
  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");
  const created = await createOrder(customer, {
    addressId: 900,
    fulfillmentType: "DELIVERY",
    method: "CASH",
    items: [{ productId: Number(product.id), quantity: 3 }],
  }, { nowMs: Date.parse("2026-10-23T05:00:00.000Z") });

  const reserved = database.prepare("SELECT * FROM stock_reservations WHERE order_id=?").get(created.id);
  assert.equal(reserved.status, "RESERVED");
  assert.equal(Number(reserved.quantity), 3);

  const firstCommit = await store.transaction((tx, mysql) =>
    commitOrderStock(tx, mysql, created.id, manager.id),
  );
  assert.equal(firstCommit, true);
  assert.equal(Number(database.prepare("SELECT stock_quantity FROM products WHERE id=?").get(product.id).stock_quantity), 0);
  assert.equal(Number(database.prepare("SELECT COUNT(*) count FROM stock_movements WHERE order_id=? AND product_id=? AND kind='SALE'").get(created.id, product.id).count), 0);
  assert.equal(database.prepare("SELECT status FROM stock_reservations WHERE order_id=?").get(created.id).status, "COMMITTED");

  const secondCommit = await store.transaction((tx, mysql) =>
    commitOrderStock(tx, mysql, created.id, manager.id),
  );
  assert.equal(secondCommit, false);
});

test("stock center menandai unlimited dan penyesuaian stok fisik ditolak", async () => {
  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");
  const stock = await listStock(manager);
  const row = stock.products.find((item) => Number(item.id) === Number(product.id));
  assert.equal(row.stock_status, "UNLIMITED");
  await assert.rejects(
    () => adjustStock(manager, { productId: Number(product.id), quantity: 10, reason: "restock test" }),
    (error) => error instanceof DomainError && error.status === 409 && /unlimited/i.test(error.message),
  );
});

test("saat unlimited dimatikan, stok fisik tersimpan kembali menjadi authoritative", async () => {
  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");
  await saveProduct(manager, productInput({ id: Number(product.id), unlimitedStock: false }));
  const saved = database.prepare("SELECT stock_quantity,unlimited_stock FROM products WHERE id=?").get(product.id);
  assert.equal(Number(saved.unlimited_stock), 0);
  assert.equal(Number(saved.stock_quantity), 0);

  await assert.rejects(
    () => createOrder(customer, {
      addressId: 900,
      fulfillmentType: "DELIVERY",
      method: "CASH",
      items: [{ productId: Number(product.id), quantity: 1 }],
    }, { nowMs: Date.parse("2026-10-23T05:00:00.000Z") }),
    (error) => error instanceof DomainError && error.status === 409 && /Stok/.test(error.message),
  );
});
