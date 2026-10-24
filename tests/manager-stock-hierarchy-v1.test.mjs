import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const stockHierarchy = fs.readFileSync(
  path.resolve("app/ManagerStockHierarchy.js"),
  "utf8",
);
const managerEntry = fs.readFileSync(
  path.resolve("app/ManagerControlCenter.js"),
  "utf8",
);

test("Manager Stock memakai hierarchy kategori dan subkategori yang sama dengan Produk & Menu", () => {
  assert.match(stockHierarchy, /collapsedSubcategories/);
  assert.match(stockHierarchy, /groupedRows/);
  assert.match(stockHierarchy, /inventory\.categories/);
  assert.match(stockHierarchy, /inventory\.subcategories/);
  assert.match(stockHierarchy, /Daftar Stok/);
  assert.match(stockHierarchy, /Current[\s\S]*Reserved[\s\S]*Available/);
  assert.match(managerEntry, /ManagerStockHierarchy/);
  assert.match(managerEntry, /view === "stock"/);
});

test("Manager Stock mengubah visibility pada level subkategori tanpa mengubah stok produk", () => {
  assert.match(stockHierarchy, /mutate\("subcategory"/);
  assert.match(stockHierarchy, /active: !isActive\(row\)/);
  assert.match(stockHierarchy, /aria-label=/);
  assert.match(stockHierarchy, /Sembunyikan subkategori/);
  assert.match(stockHierarchy, /Tampilkan subkategori/);
  assert.doesNotMatch(
    stockHierarchy,
    />\s*(Sembunyikan|Tampilkan)\s*<\/button>/,
  );
});

test("Manager Stock tetap menjaga adjustment drawer dan unlimited-stock guard", () => {
  assert.match(stockHierarchy, /setSelectedProductId\(row\.id\)/);
  assert.match(stockHierarchy, /Number\(row\.unlimited_stock\) === 1/);
  assert.match(stockHierarchy, /role="dialog"/);
  assert.match(stockHierarchy, /manager-stock-drawer-title/);
  assert.match(stockHierarchy, /event\.key === "Escape"/);
  assert.match(stockHierarchy, /event\.target === event\.currentTarget/);
  assert.match(stockHierarchy, /name="quantity"/);
  assert.match(stockHierarchy, />\s*Batal\s*</);
});
