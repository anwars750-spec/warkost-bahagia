import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "catalog-test-")),
  "data.db",
);
const { db } = await import("../lib/db.mjs");
const { listCatalog, saveProduct, saveCategory } =
  await import("../lib/catalog.mjs");
const database = db();
database
  .prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@t','x','ADMIN')",
  )
  .run();
const admin = { id: 1, role: "ADMIN" },
  customer = { id: 1, role: "CUSTOMER" };
test("kategori dan produk inactive terlihat admin, tidak terlihat customer", async () => {
  await saveCategory(admin, { name: "Kopi" });
  await saveProduct(admin, {
    name: "Kopi Susu",
    description: "Segar",
    price: 18000,
    categoryId: 1,
    active: true,
  });
  assert.equal((await listCatalog()).products.length, 1);
  await saveProduct(admin, {
    id: 1,
    name: "Kopi Susu",
    description: "Segar",
    price: 19000,
    categoryId: 1,
    active: false,
  });
  assert.equal((await listCatalog()).products.length, 0);
  assert.equal((await listCatalog(true)).products[0].price, 19000);
  await saveCategory(admin, { id: 1, name: "Kopi", active: false });
  assert.equal((await listCatalog(true)).categories[0].active, 0);
});
test("peran dan input katalog diverifikasi", async () => {
  await assert.rejects(saveCategory(customer, { name: "Rahasia" }), /Akses/);
  await assert.rejects(
    saveProduct(admin, { name: "X", price: -1, categoryId: 1 }),
    /tidak valid/,
  );
  await assert.rejects(
    saveProduct(admin, {
      name: "Kopi",
      price: 1000,
      categoryId: 1,
      imageUrl: "javascript:alert(1)",
      active: true,
    }),
    /tidak valid/,
  );
});
