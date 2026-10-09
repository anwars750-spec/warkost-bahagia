import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "unified-inventory-v1-")),
  "test.db",
);
process.env.SESSION_SECRET = "unified-inventory-v1-secret-more-than-32-bytes";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const { db } = await import("../lib/db.mjs");
const { listCatalog, saveCategory, saveProduct, saveSubcategory } =
  await import("../lib/catalog.mjs");
const { adjustStock, listStock } = await import("../lib/operations.mjs");
const { changeStatus, createOrder } = await import("../lib/domain.mjs");
const { formatStockQuantity, productLineTotal, validateOrderQuantity } =
  await import("../lib/product-units.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Manager','manager@inventory.test','x','MANAGER',1),
    (2,'Admin','admin@inventory.test','x','ADMIN',1),
    (3,'Kitchen','kitchen@inventory.test','x','KITCHEN',1),
    (4,'Owner','owner@inventory.test','x','OWNER',1),
    (5,'Customer','customer@inventory.test','x','CUSTOMER',1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default)
    VALUES(1,5,'Rumah','Alamat inventory test',-6.9217,106.9272,1);
  INSERT OR REPLACE INTO settings(key,value) VALUES
    ('business_latitude','-6.9217'),
    ('business_longitude','106.9272'),
    ('delivery_free_km','3'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','10'),
    ('payment_expiry_minutes','15'),
    ('cod_max_order_amount','150000'),
    ('printer_simulation','true');
`);

const manager = { id: 1, role: "MANAGER" };
const admin = { id: 2, role: "ADMIN" };
const kitchen = { id: 3, role: "KITCHEN" };
const owner = { id: 4, role: "OWNER" };
const customer = { id: 5, role: "CUSTOMER" };

for (const name of ["Makanan", "Minuman", "Bahan Baku"])
  await saveCategory(manager, { name });
const categories = Object.fromEntries(
  database
    .prepare("SELECT id,name FROM categories")
    .all()
    .map((row) => [row.name, Number(row.id)]),
);
for (const [category, name, sortOrder] of [
  ["Makanan", "Makanan Berat", 10],
  ["Makanan", "Mie", 20],
  ["Minuman", "Coffee", 10],
  ["Minuman", "Non Coffee", 20],
  ["Bahan Baku", "Kopi", 10],
  ["Bahan Baku", "Susu & Dairy", 20],
  ["Bahan Baku", "Sirup & Powder", 30],
  ["Bahan Baku", "Lainnya", 40],
])
  await saveSubcategory(manager, {
    categoryId: categories[category],
    name,
    sortOrder,
  });
const subcategories = Object.fromEntries(
  database
    .prepare("SELECT id,name FROM product_subcategories")
    .all()
    .map((row) => [row.name, Number(row.id)]),
);

await saveProduct(manager, {
  name: "Nasi Goreng Warkost",
  description: "Nasi goreng hangat",
  price: 25000,
  categoryId: categories.Makanan,
  subcategoryId: subcategories["Makanan Berat"],
  active: true,
});
await saveProduct(manager, {
  name: "Kopi Susu Rumah",
  description: "Espresso susu gula aren",
  price: 18000,
  categoryId: categories.Minuman,
  subcategoryId: subcategories.Coffee,
  active: true,
});
await saveProduct(manager, {
  name: "Biji Kopi Arabica Sukabumi – Medium Roast",
  description: "Biji kopi Arabica medium roast dijual per 100 gram",
  price: 18000,
  categoryId: categories["Bahan Baku"],
  subcategoryId: subcategories.Kopi,
  imageUrl: "/demo/bahan-baku-kopi.svg",
  stockUnit: "GRAM",
  priceUnitQuantity: 100,
  minimumOrderQuantity: 100,
  orderStepQuantity: 100,
  lowStockThreshold: 2000,
  active: true,
});

const products = Object.fromEntries(
  database
    .prepare("SELECT * FROM products")
    .all()
    .map((row) => [row.name, row]),
);
database
  .prepare("UPDATE products SET stock_quantity=? WHERE id=?")
  .run(50, products["Nasi Goreng Warkost"].id);
database
  .prepare("UPDATE products SET stock_quantity=? WHERE id=?")
  .run(50, products["Kopi Susu Rumah"].id);
database
  .prepare("UPDATE products SET stock_quantity=? WHERE id=?")
  .run(10000, products["Biji Kopi Arabica Sukabumi – Medium Roast"].id);

test("tiga kategori utama dan subkategori data-backed memiliki relasi benar", async () => {
  const catalog = await listCatalog(true);
  assert.deepEqual(
    catalog.categories.map((item) => item.name),
    ["Makanan", "Minuman", "Bahan Baku"],
  );
  assert.equal(catalog.subcategories.length, 8);
  assert.equal(
    catalog.subcategories.find((item) => item.name === "Kopi").category_name,
    "Bahan Baku",
  );
  assert.equal(products["Nasi Goreng Warkost"].category_id, categories.Makanan);
  assert.equal(products["Kopi Susu Rumah"].category_id, categories.Minuman);
});

test("Manager dapat edit/deactivate subkategori dan role lain ditolak", async () => {
  const id = subcategories["Non Coffee"];
  await saveSubcategory(manager, {
    id,
    categoryId: categories.Minuman,
    name: "Non-Coffee",
    sortOrder: 25,
    active: false,
  });
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT name,active,sort_order FROM product_subcategories WHERE id=?",
        )
        .get(id),
    },
    { name: "Non-Coffee", active: 0, sort_order: 25 },
  );
  await assert.rejects(
    saveSubcategory(owner, {
      categoryId: categories.Minuman,
      name: "Owner tidak boleh",
    }),
    /Akses ditolak/,
  );
  await assert.rejects(
    saveSubcategory(admin, {
      categoryId: categories.Minuman,
      name: "Admin tidak boleh",
    }),
    /Akses ditolak/,
  );
});

test("produk menolak satuan, langkah, dan relasi subkategori yang tidak valid", async () => {
  await assert.rejects(
    saveProduct(manager, {
      name: "Unit Salah",
      price: 1000,
      categoryId: categories.Makanan,
      stockUnit: "LITER",
      active: true,
    }),
    /tidak valid/,
  );
  await assert.rejects(
    saveProduct(manager, {
      name: "Relasi Salah",
      price: 1000,
      categoryId: categories.Makanan,
      subcategoryId: subcategories.Kopi,
      active: true,
    }),
    /tidak sesuai kategori/,
  );
  await assert.rejects(
    saveProduct(manager, {
      name: "Langkah Salah",
      price: 1000,
      categoryId: categories["Bahan Baku"],
      stockUnit: "GRAM",
      priceUnitQuantity: 100,
      minimumOrderQuantity: 100,
      orderStepQuantity: 0,
      active: true,
    }),
    /tidak valid/,
  );
});

test("stock API dibatasi server-side sesuai role", async () => {
  assert.deepEqual(
    new Set(
      (await listStock(manager)).products.map((row) => row.category_name),
    ),
    new Set(["Makanan", "Minuman", "Bahan Baku"]),
  );
  assert.deepEqual(
    new Set((await listStock(admin)).products.map((row) => row.category_name)),
    new Set(["Minuman", "Bahan Baku"]),
  );
  assert.deepEqual(
    new Set(
      (await listStock(kitchen)).products.map((row) => row.category_name),
    ),
    new Set(["Makanan"]),
  );
  assert.deepEqual(
    new Set((await listStock(owner)).products.map((row) => row.category_name)),
    new Set(["Makanan", "Minuman", "Bahan Baku"]),
  );
  await assert.rejects(listStock(customer), /Akses ditolak/);
});

test("hanya Manager dapat adjustment dan setiap perubahan diaudit", async () => {
  const productId = products["Kopi Susu Rumah"].id;
  await adjustStock(manager, {
    productId,
    quantity: 10,
    reason: "Restock supplier",
  });
  await adjustStock(manager, {
    productId,
    quantity: -5,
    reason: "Stock opname",
  });
  assert.equal(
    database
      .prepare("SELECT stock_quantity FROM products WHERE id=?")
      .get(productId).stock_quantity,
    55,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM stock_movements WHERE product_id=?")
      .get(productId).count,
    2,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='STOCK_ADJUSTED'",
      )
      .get().count,
    2,
  );
  for (const actor of [admin, kitchen, owner])
    await assert.rejects(
      adjustStock(actor, { productId, quantity: 1, reason: "Tidak diizinkan" }),
      /Akses ditolak/,
    );
});

test("adjustment tidak boleh melanggar stok yang sedang direservasi", async () => {
  const productId = products["Nasi Goreng Warkost"].id;
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId, quantity: 2 }],
  });
  assert.equal(
    database
      .prepare("SELECT quantity FROM stock_reservations WHERE order_id=?")
      .get(order.id).quantity,
    2,
  );
  await assert.rejects(
    adjustStock(manager, {
      productId,
      quantity: -49,
      reason: "Koreksi berlebihan",
    }),
    /reservasi aktif/,
  );
  await changeStatus(admin, order.id, "CANCELLED");
});

test("harga GRAM integer-safe dan format kuantitas ramah Indonesia", () => {
  const coffee = products["Biji Kopi Arabica Sukabumi – Medium Roast"];
  assert.equal(
    database
      .prepare("SELECT stock_quantity FROM products WHERE id=?")
      .get(coffee.id).stock_quantity,
    10000,
  );
  assert.equal(coffee.price, 18000);
  assert.equal(coffee.price_unit_quantity, 100);
  assert.equal(productLineTotal(coffee, 500), 90000);
  assert.equal(productLineTotal(coffee, 1000), 180000);
  assert.equal(formatStockQuantity(100), "100 pcs");
  assert.equal(formatStockQuantity(500, "GRAM"), "500 g");
  assert.equal(formatStockQuantity(1000, "GRAM"), "1 kg");
  assert.equal(formatStockQuantity(1500, "GRAM"), "1,5 kg");
  assert.equal(validateOrderQuantity(coffee, 150), false);
  assert.equal(validateOrderQuantity(coffee, 99), false);
  assert.equal(validateOrderQuantity(coffee, 500), true);
});

test("raw material reserve 500 g, commit, lalu restore memakai engine yang sama", async () => {
  const coffee = products["Biji Kopi Arabica Sukabumi – Medium Roast"];
  const order = await createOrder(customer, {
    addressId: 1,
    method: "CASH",
    items: [{ productId: coffee.id, quantity: 500, note: "Giling medium" }],
  });
  assert.equal(order.subtotal, 90000);
  assert.equal(
    database
      .prepare("SELECT quantity FROM stock_reservations WHERE order_id=?")
      .get(order.id).quantity,
    500,
  );
  assert.equal(
    (await listStock(manager)).products.find((row) => row.id === coffee.id)
      .available_quantity,
    9500,
  );
  await changeStatus(admin, order.id, "CONFIRMED");
  assert.equal(
    database
      .prepare("SELECT stock_quantity FROM products WHERE id=?")
      .get(coffee.id).stock_quantity,
    9500,
  );
  await changeStatus(admin, order.id, "CANCELLED");
  assert.equal(
    database
      .prepare("SELECT stock_quantity FROM products WHERE id=?")
      .get(coffee.id).stock_quantity,
    10000,
  );
});

test("weighted order di bawah minimum, bukan kelipatan, dan di atas stok ditolak", async () => {
  const coffee = products["Biji Kopi Arabica Sukabumi – Medium Roast"];
  for (const quantity of [50, 150])
    await assert.rejects(
      createOrder(customer, {
        addressId: 1,
        method: "BANK_TRANSFER",
        items: [{ productId: coffee.id, quantity }],
      }),
      /satuan penjualan/,
    );
  await assert.rejects(
    createOrder(customer, {
      addressId: 1,
      method: "BANK_TRANSFER",
      items: [{ productId: coffee.id, quantity: 10100 }],
    }),
    /tidak mencukupi/,
  );
});

test("produk pada subkategori inactive tidak dapat dibeli", async () => {
  const coffee = products["Biji Kopi Arabica Sukabumi – Medium Roast"];
  await saveSubcategory(manager, {
    id: subcategories.Kopi,
    categoryId: categories["Bahan Baku"],
    name: "Kopi",
    sortOrder: 10,
    active: false,
  });
  assert.equal(
    (await listCatalog(false)).products.some((row) => row.id === coffee.id),
    false,
  );
  await assert.rejects(
    createOrder(customer, {
      addressId: 1,
      method: "BANK_TRANSFER",
      items: [{ productId: coffee.id, quantity: 100 }],
    }),
    /tidak tersedia/,
  );
  await saveSubcategory(manager, {
    id: subcategories.Kopi,
    categoryId: categories["Bahan Baku"],
    name: "Kopi",
    sortOrder: 10,
    active: true,
  });
});

test("mixed order dirutekan Food ke Kitchen dan Drink/Raw ke Admin", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "BANK_TRANSFER",
    items: [
      {
        productId: products["Nasi Goreng Warkost"].id,
        quantity: 1,
        note: "Pedas",
      },
      {
        productId: products["Kopi Susu Rumah"].id,
        quantity: 1,
        note: "Less sugar",
      },
      {
        productId: products["Biji Kopi Arabica Sukabumi – Medium Roast"].id,
        quantity: 500,
        note: "Giling medium",
      },
    ],
  });
  const kitchenPayload = JSON.parse(
    database
      .prepare(
        "SELECT payload_json FROM print_jobs WHERE order_id=? AND station='KITCHEN'",
      )
      .get(order.id).payload_json,
  );
  const adminPayload = JSON.parse(
    database
      .prepare(
        "SELECT payload_json FROM print_jobs WHERE order_id=? AND station='ADMIN'",
      )
      .get(order.id).payload_json,
  );
  assert.deepEqual(
    kitchenPayload.items.map((row) => row.name),
    ["Nasi Goreng Warkost"],
  );
  assert.deepEqual(
    adminPayload.items.map((row) => row.name),
    ["Kopi Susu Rumah", "Biji Kopi Arabica Sukabumi – Medium Roast"],
  );
  const raw = adminPayload.items.find((row) => row.stockUnit === "GRAM");
  assert.deepEqual(
    {
      quantityLabel: raw.quantityLabel,
      priceUnitQuantity: raw.priceUnitQuantity,
      lineTotal: raw.lineTotal,
      note: raw.note,
    },
    {
      quantityLabel: "500 g",
      priceUnitQuantity: 100,
      lineTotal: 90000,
      note: "Giling medium",
    },
  );
});

test("kontrak UI menyediakan kontrol Manager dan read-only Admin/Kitchen", () => {
  const page = source("app/page.js");
  const adminStock = source("app/AdminBeverageStockEnhancerV2.js");
  const seed = source("scripts/seed.mjs");
  assert.match(page, /Semua subkategori/);
  assert.match(page, /Bahan Baku/);
  assert.match(page, /role === "MANAGER" && view === "products"/);
  assert.match(page, /role === "MANAGER"[\s\S]*?name="quantity"/);
  assert.match(page, /Stok Makanan/);
  assert.match(page, /Tampilan stok read-only sesuai tanggung jawab role/);
  assert.match(adminStock, /Stok Minuman &amp; Bahan Baku/);
  assert.doesNotMatch(adminStock, /api\("stock"/);
  assert.match(seed, /Biji Kopi Arabica Sukabumi – Medium Roast/);
  assert.ok(
    fs.existsSync(path.join(projectRoot, "public/demo/bahan-baku-kopi.svg")),
  );
});
