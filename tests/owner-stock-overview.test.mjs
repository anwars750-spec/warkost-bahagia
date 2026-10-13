import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync("app/layout.js", "utf8");
const source = fs.readFileSync("app/OwnerStockOverview.js", "utf8");

test("Owner stock overview is mounted and opens from stock health popup", () => {
  assert.match(layout, /OwnerStockOverview/);
  assert.match(layout, /<OwnerOperationalHealth\s*\/>/);
  assert.match(source, /Produk Stok Habis/);
  assert.match(source, /Lihat Semua Stok/);
  assert.match(source, /\/api\/stock/);
  assert.match(source, /READ ONLY/);
  assert.match(source, /Aman/);
  assert.match(source, /Menipis/);
  assert.match(source, /Habis/);
});
