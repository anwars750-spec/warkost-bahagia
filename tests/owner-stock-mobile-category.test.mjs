import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync("app/OwnerStockOverview.js", "utf8");

test("Owner Stock Overview mobile uses true fullscreen viewport", () => {
  assert.match(source, /\.oso-modal\{position:fixed!important;inset:0!important;width:100vw!important/);
  assert.match(source, /height:100dvh!important/);
  assert.match(source, /border-radius:0!important/);
});

test("Owner Stock Overview supports category filtering", () => {
  assert.match(source, /categoryFilter/);
  assert.match(source, /Semua kategori/);
  assert.match(source, /matchesCategory/);
  assert.match(source, /Filter kategori stok/);
});
