import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_ITEM_NOTE_LENGTH,
  normalizeItemNote,
  removeItemNote,
  updateCartQuantity,
  updateItemNote,
} from "../lib/customer-cart.mjs";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "customer-cart-v2-test-")),
  "test.db",
);
process.env.SESSION_SECRET =
  "customer-cart-v2-session-secret-with-over-32-characters";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const { db } = await import("../lib/db.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin','admin@cart.test','x','ADMIN',1),
    (2,'Kitchen','kitchen@cart.test','x','KITCHEN',1),
    (3,'Customer','customer@cart.test','x','CUSTOMER',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan'),(2,'Minuman');
  INSERT INTO products(id,category_id,name,price,prep_station,stock_quantity) VALUES
    (1,1,'Nasi Goreng Warkost',25000,'KITCHEN',20),
    (2,2,'Kopi Susu Rumah',18000,'CASHIER',20);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude)
    VALUES(1,3,'Rumah','Alamat customer cart test',-6.9217,106.9272);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','-6.9217'),
    ('business_longitude','106.9272'),
    ('delivery_fee_per_km','2500'),
    ('printer_simulation','true');
`);

const customer = { id: 3, role: "CUSTOMER" };

test("card add dan minus menjaga quantity non-negatif", () => {
  let cart = {};
  cart = updateCartQuantity(cart, 1, 1);
  assert.equal(cart[1], 1);
  cart = updateCartQuantity(cart, 1, 1);
  cart = updateCartQuantity(cart, 1, 1);
  assert.equal(cart[1], 3);
  cart = updateCartQuantity(cart, 1, -1);
  assert.equal(cart[1], 2);
  cart = updateCartQuantity(cart, 1, -1);
  cart = updateCartQuantity(cart, 1, -1);
  assert.equal(1 in cart, false);
  cart = updateCartQuantity(cart, 1, -1);
  assert.equal(cart[1] || 0, 0);
});

test("catatan per item independen, dapat diedit, dibersihkan, dan tervalidasi", () => {
  let notes = {};
  notes = updateItemNote(notes, 1, "  Pedas, tidak pakai timun  ");
  notes = updateItemNote(notes, 2, "Extra sugar");
  assert.deepEqual(notes, {
    1: "Pedas, tidak pakai timun",
    2: "Extra sugar",
  });

  const cart = updateCartQuantity({ 1: 1, 2: 1 }, 1, 2);
  assert.equal(cart[1], 3);
  assert.equal(notes[1], "Pedas, tidak pakai timun");

  notes = updateItemNote(notes, 1, "Pedas sedang");
  assert.equal(notes[1], "Pedas sedang");
  notes = updateItemNote(notes, 1, "   ");
  assert.equal(1 in notes, false);
  notes = removeItemNote(notes, 2);
  assert.deepEqual(notes, {});
  assert.equal(normalizeItemNote("  "), null);
  assert.throws(
    () => normalizeItemNote("x".repeat(MAX_ITEM_NOTE_LENGTH + 1)),
    /maksimal 200 karakter/,
  );
});

test("UI card memakai click dan keyboard tanpa bubbling dari minus", () => {
  const page = source("app/page.js");
  const style = source("app/style.css");
  assert.match(
    page,
    /onClick=\{\(event\) => activateProductCard\(event, p\)\}/,
  );
  assert.match(
    page,
    /onKeyDown=\{\(event\) => productCardKeyDown\(event, p\)\}/,
  );
  assert.match(page, /event\.stopPropagation\(\);[\s\S]*?step\(p, -1\)/);
  assert.match(page, /Ketuk untuk tambah/);
  assert.match(page, /Ketuk \+1/);
  assert.match(page, /maxLength=\{MAX_ITEM_NOTE_LENGTH\}/);
  assert.match(page, /Ubah catatan/);
  assert.match(style, /\.customer-product\[role="button"\]:focus-visible/);
  assert.match(style, /@media \(max-width: 620px\)[\s\S]*?\.item-note-editor/);
});

test("checkout menyimpan note terpisah dan print job merutekannya per station", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [
      {
        productId: 1,
        quantity: 1,
        note: "  Pedas, tidak pakai timun  ",
      },
      { productId: 2, quantity: 1, note: "Extra sugar" },
    ],
  });
  assert.deepEqual(
    database
      .prepare(
        "SELECT name,note,prep_station FROM order_items WHERE order_id=? ORDER BY id",
      )
      .all(order.id)
      .map((row) => ({ ...row })),
    [
      {
        name: "Nasi Goreng Warkost",
        note: "Pedas, tidak pakai timun",
        prep_station: "KITCHEN",
      },
      {
        name: "Kopi Susu Rumah",
        note: "Extra sugar",
        prep_station: "CASHIER",
      },
    ],
  );

  const kitchen = JSON.parse(
    database
      .prepare(
        "SELECT payload_json FROM print_jobs WHERE order_id=? AND station='KITCHEN'",
      )
      .get(order.id).payload_json,
  );
  assert.deepEqual(kitchen.items, [
    {
      name: "Nasi Goreng Warkost",
      price: 25000,
      quantity: 1,
      note: "Pedas, tidak pakai timun",
    },
  ]);

  const admin = JSON.parse(
    database
      .prepare(
        "SELECT payload_json FROM print_jobs WHERE order_id=? AND station='ADMIN'",
      )
      .get(order.id).payload_json,
  );
  assert.equal(
    admin.items.some((item) => item.name === "Nasi Goreng Warkost"),
    false,
  );
  assert.equal(
    admin.items.find((item) => item.name === "Kopi Susu Rumah").note,
    "Extra sugar",
  );
});

test("order lama atau whitespace note tetap kompatibel sebagai null", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 1, quantity: 1, note: "   " }],
  });
  assert.equal(
    database
      .prepare("SELECT note FROM order_items WHERE order_id=?")
      .get(order.id).note,
    null,
  );

  const withoutNote = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: 2, quantity: 1 }],
  });
  assert.equal(
    database
      .prepare("SELECT note FROM order_items WHERE order_id=?")
      .get(withoutNote.id).note,
    null,
  );
});

test("server menolak note lebih dari 200 karakter sebelum membuat order", async () => {
  const before = database
    .prepare("SELECT COUNT(*) count FROM orders")
    .get().count;
  await assert.rejects(
    createOrder(customer, {
      addressId: 1,
      method: "CASH",
      items: [
        {
          productId: 1,
          quantity: 1,
          note: "x".repeat(MAX_ITEM_NOTE_LENGTH + 1),
        },
      ],
    }),
    /maksimal 200 karakter/,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    before,
  );
});

test("operational API mempertahankan station filter dan mengirim note", () => {
  const route = source("app/api/[action]/route.js");
  assert.match(route, /SELECT name,price,quantity,note,prep_station/);
  assert.match(
    route,
    /user\.role === "KITCHEN" \? " AND prep_station='KITCHEN'"/,
  );
  const printer = source("lib/print-queue.mjs");
  assert.match(printer, /item\.prep_station !== "KITCHEN"/);
  assert.match(printer, /item\.note \|\| null/);
});
