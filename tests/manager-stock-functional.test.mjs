import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "manager-stock-functional-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const { adjustStock, listStock } = await import("../lib/operations.mjs");

const database = db();
const manager = { id: 1, role: "MANAGER" };

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Manager Stok','manager-stock@test.local','x','MANAGER'),
    (2,'Customer Stok','customer-stock@test.local','x','CUSTOMER');
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,2,'Rumah','Alamat fixture inventori');
  INSERT INTO categories(id,name,active) VALUES
    (1,'Makanan',1),(2,'Minuman',1),(3,'Bahan Baku',1);
  INSERT INTO product_subcategories(id,category_id,name,active,sort_order) VALUES
    (1,1,'Menu Utama',1,20),
    (2,1,'Camilan',1,10),
    (3,2,'Kopi',1,10),
    (4,3,'Bahan Kering',1,10);
  INSERT INTO products(
    id,category_id,subcategory_id,name,description,price,image_url,active,prep_station,
    stock_quantity,stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold
  ) VALUES
    (1,1,1,'Mie Ayam Bahagia','Menu aktif',18000,'/demo/mie-ayam.svg',1,'KITCHEN',50,'PCS',1,1,1,5),
    (2,2,3,'Kopi Susu','Minuman aktif',15000,'/demo/kopi-susu.svg',1,'CASHIER',30,'PCS',1,1,1,5),
    (3,3,4,'Biji Kopi','Bahan timbang',20000,'/demo/promo-warkost.webp',1,'CASHIER',500,'GRAM',100,100,100,100),
    (4,1,2,'Roti Lama','Produk nonaktif',10000,'',0,'KITCHEN',8,'PCS',1,1,1,2);
  INSERT INTO orders(id,customer_id,address_id,status,subtotal,total)
    VALUES(1,2,1,'PENDING',18000,18000);
  INSERT INTO stock_reservations(product_id,order_id,quantity,status,expires_at)
    VALUES(1,1,4,'RESERVED','2099-01-01 00:00:00');
`);

test("Manager Stock menjaga urutan kategori dan urutan subkategori", async () => {
  const result = await listStock(manager);
  assert.deepEqual(
    result.products.map((row) => row.name),
    ["Roti Lama", "Mie Ayam Bahagia", "Kopi Susu", "Biji Kopi"],
  );
  assert.deepEqual(
    result.products.map((row) => row.category_name),
    ["Makanan", "Makanan", "Minuman", "Bahan Baku"],
  );
});

test("produk nonaktif tetap tampil di stok tetapi hilang dari katalog jual", async () => {
  const stock = await listStock(manager);
  const inactive = stock.products.find((row) => row.id === 4);
  assert.ok(inactive);
  assert.equal(Number(inactive.active), 0);
  assert.equal(
    (await listCatalog(false)).products.some((row) => row.id === 4),
    false,
  );

  await adjustStock(manager, {
    productId: 4,
    quantity: 2,
    reason: "Hitung ulang stok fisik",
  });
  const after = (await listStock(manager)).products.find((row) => row.id === 4);
  assert.equal(after.stock_quantity, 10);
  assert.equal(Number(after.active), 0);
  assert.equal(
    (await listCatalog(false)).products.some((row) => row.id === 4),
    false,
  );
});

test("adjustment PCS dan GRAM memakai ledger serta menjaga reserved", async () => {
  const pcsBefore = (await listStock(manager)).products.find(
    (row) => row.id === 1,
  );
  assert.equal(pcsBefore.stock_quantity, 50);
  assert.equal(pcsBefore.reserved_quantity, 4);
  assert.equal(pcsBefore.available_quantity, 46);

  await adjustStock(manager, {
    productId: 1,
    quantity: 10,
    reason: "Restock supplier",
  });
  await adjustStock(manager, {
    productId: 3,
    quantity: 125,
    reason: "Restock bahan timbang",
  });

  const stock = await listStock(manager);
  const pcs = stock.products.find((row) => row.id === 1);
  const grams = stock.products.find((row) => row.id === 3);
  assert.equal(pcs.stock_quantity, 60);
  assert.equal(pcs.reserved_quantity, 4);
  assert.equal(pcs.available_quantity, 56);
  assert.equal(grams.stock_quantity, 625);
  assert.equal(grams.stock_unit, "GRAM");
});

test("Manager Stock memiliki satu drawer React dengan lifecycle penutupan lengkap", () => {
  const component = fs.readFileSync(
    path.resolve("app/ManagerControlCenter.js"),
    "utf8",
  );
  assert.match(component, /setSelectedProductId\(row\.id\)[\s\S]*?Atur Stok/);
  assert.match(component, /role="dialog"[\s\S]*?manager-stock-drawer-title/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /event\.target === event\.currentTarget/);
  assert.match(component, />\s*Batal\s*</);
  assert.match(component, /selectedProduct\.image_url/);
  assert.match(component, /Current[\s\S]*Reserved[\s\S]*Available/);
  assert.match(component, /\["inactive", "Nonaktif"\]/);
  assert.doesNotMatch(component, /MutationObserver|querySelector/);
});
