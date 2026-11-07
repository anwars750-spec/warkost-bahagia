import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeProductBadgeType,
  productBadgePresentation,
  PRODUCT_BADGE_OPTIONS,
} from "../lib/product-badges.mjs";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-product-badge-")),
  "catalog.db",
);
const { db } = await import("../lib/db.mjs");
const { listCatalog, saveProduct } = await import("../lib/catalog.mjs");
const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active)
  VALUES(15,'Manager Badge','manager.badge@warkost.local','x','MANAGER',1);
  INSERT INTO categories(id,name,active) VALUES(15,'Makanan',1);
`);
const manager = { id: 15, role: "MANAGER" };
const sample = {
  name: "Nasi Uji Badge",
  description: "Test produk",
  price: 25000,
  categoryId: 15,
  active: true,
};

test("opsi badge hanya satu label per produk dan menolak nilai tidak dikenal", () => {
  assert.deepEqual(PRODUCT_BADGE_OPTIONS.map((x) => x.value), [
    "", "FAVORITE", "BEST_SELLER", "POPULAR", "RECOMMENDED",
  ]);
  assert.equal(normalizeProductBadgeType(""), null);
  assert.equal(normalizeProductBadgeType(null), null);
  assert.throws(() => normalizeProductBadgeType("ADMIN"), /tidak valid/);
  assert.throws(() => normalizeProductBadgeType("toString"), /tidak valid/);
  assert.equal(productBadgePresentation("FAVORITE").label, "Favorit");
  assert.equal(productBadgePresentation("BEST_SELLER").label, "Best Seller");
  assert.equal(productBadgePresentation(null), null);
});

test("Manager dapat membuat, mengubah, mempertahankan, dan menghapus badge produk", async () => {
  await saveProduct(manager, { ...sample, badgeType: "BEST_SELLER" });
  const created = (await listCatalog(true)).products.find((x) => x.name === sample.name);
  assert.ok(created?.id);
  assert.equal(created.badge_type, "BEST_SELLER");
  assert.equal((await listCatalog(false)).products.find((x) => x.id === created.id).badge_type, "BEST_SELLER");

  await saveProduct(manager, { ...sample, id: created.id, badgeType: "FAVORITE" });
  assert.equal((await listCatalog(true)).products.find((x) => x.id === created.id).badge_type, "FAVORITE");
  await saveProduct(manager, { ...sample, id: created.id }); // caller lama tidak menghapus badge
  assert.equal((await listCatalog(true)).products.find((x) => x.id === created.id).badge_type, "FAVORITE");
  await saveProduct(manager, { ...sample, id: created.id, badgeType: "" });
  assert.equal((await listCatalog(true)).products.find((x) => x.id === created.id).badge_type, null);
  assert.equal((await listCatalog(false)).products.find((x) => x.id === created.id).badge_type, null);
});

test("badge invalid ditolak sebelum perubahan katalog", async () => {
  const before = database.prepare("SELECT COUNT(*) n FROM products").get().n;
  await assert.rejects(
    saveProduct(manager, { ...sample, name: "Bohong", badgeType: "VIRAL" }),
    /Label produk tidak valid/,
  );
  assert.equal(database.prepare("SELECT COUNT(*) n FROM products").get().n, before);
});

test("customer tidak lagi menerima badge demo yang ditentukan berdasarkan index", () => {
  const page = fs.readFileSync(path.resolve("app/page.js"), "utf8");
  const form = fs.readFileSync(path.resolve("app/ManagerProductsHierarchy.js"), "utf8");
  assert.doesNotMatch(page, /demoProductBadges/);
  assert.match(page, /productBadgePresentation\(p\.badge_type\)/);
  assert.match(page, /badge\.label/);
  assert.match(form, /name="badgeType"/);
  assert.match(form, /badgeType: form\.get\("badgeType"\) \|\| null/);
  assert.match(page, /let saved = false;/);
  assert.match(form, /if \(succeeded\) setEditing\(null\)/);
});
