import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isProductOrderable,
  canIncreaseProductQuantity,
  isCartQuantityAvailable,
} from "../lib/customer-cart.mjs";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-sold-out-")),
  "test.db",
);
const { db } = await import("../lib/db.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active)
    VALUES(81,'Customer Soldout','soldout@warkost.local','x','CUSTOMER',1);
  INSERT INTO categories(id,name,active) VALUES(81,'Makanan',1);
  INSERT INTO products(id,category_id,name,price,prep_station,stock_quantity,unlimited_stock,stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,active)
    VALUES
      (81,81,'Sold Out Menu',25000,'KITCHEN',0,0,'PCS',1,1,1,1),
      (82,81,'Limited Menu',25000,'KITCHEN',2,0,'PCS',1,1,1,1),
      (83,81,'Unlimited Menu',25000,'KITCHEN',0,1,'PCS',1,1,1,1),
      (84,81,'Gram Below Minimum',18000,'KITCHEN',200,0,'GRAM',100,500,100,1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude)
    VALUES(81,81,'Rumah','Alamat untuk uji stok habis',-6.9217,106.9272);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','-6.9217'),
    ('business_longitude','106.9272'),
    ('delivery_fee_per_km','2500'),
    ('printer_simulation','true');
`);

test("katalog publik menampilkan flag stok dan menghitung stok nol termasuk gram", async () => {
  const items = (await listCatalog(false)).products;
  const soldOut = items.find((item) => item.id === 81);
  const limited = items.find((item) => item.id === 82);
  const unlimited = items.find((item) => item.id === 83);
  const grams = items.find((item) => item.id === 84);
  assert.equal(soldOut.in_stock, 0);
  assert.equal(soldOut.available_quantity, 0);
  assert.equal(isProductOrderable(soldOut), false);
  assert.equal(isProductOrderable(limited), true);
  assert.equal(canIncreaseProductQuantity(limited, 2), false);
  assert.equal(canIncreaseProductQuantity(limited, 1), true);
  assert.equal(unlimited.unlimited_stock, 1);
  assert.equal(isProductOrderable(unlimited), true);
  assert.equal(canIncreaseProductQuantity(unlimited, 100), true);
  assert.equal(isProductOrderable(grams), false);
});

test("keranjang lama yang melebihi stok dinyatakan tidak valid", async () => {
  const products = (await listCatalog(false)).products;
  const limited = products.find((item) => item.id === 82);
  const soldOut = products.find((item) => item.id === 81);
  assert.equal(isCartQuantityAvailable(limited, 2), true);
  assert.equal(isCartQuantityAvailable(limited, 3), false);
  assert.equal(isCartQuantityAvailable(soldOut, 1), false);
});

test("server menolak checkout stok nol tanpa menyimpan order atau print job", async () => {
  const user = { id: 81, role: "CUSTOMER" };
  const orderCount = database.prepare("SELECT COUNT(*) count FROM orders").get().count;
  const printCount = database.prepare("SELECT COUNT(*) count FROM print_jobs").get().count;
  await assert.rejects(
    createOrder(user, {
      addressId: 81,
      method: "CASH",
      items: [{ productId: 81, quantity: 1 }],
    }, { nowMs: Date.parse("2026-11-07T12:00:00+07:00") }),
    /Stok Sold Out Menu tidak mencukupi/,
  );
  assert.equal(database.prepare("SELECT COUNT(*) count FROM orders").get().count, orderCount);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM print_jobs").get().count, printCount);
});

test("Customer UI tidak mengizinkan kartu habis dan checkout stok lama", () => {
  const page = fs.readFileSync(path.resolve("app/page.js"), "utf8");
  const css = fs.readFileSync(path.resolve("app/customer-catalog-final-polish.css"), "utf8");
  assert.match(page, /const outOfStock = !isProductOrderable\(p\)/);
  assert.match(page, /is-out-of-stock/);
  assert.match(page, /customer-stock-out-badge/);
  assert.match(page, /if \(!isProductOrderable\(product\)\) return;/);
  assert.match(page, /unavailableCartProducts\.length > 0/);
  assert.match(page, /disabled=\{!canIncreaseProductQuantity\(p, cart\[p\.id\]\)\}/);
  assert.match(css, /\.customer-product\.is-out-of-stock/);
  assert.match(css, /grayscale\(100%\)/);
});
