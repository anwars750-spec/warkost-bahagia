import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Owner Business Report V2 mounted globally and replaces legacy report view", () => {
  const layout = source("app/layout.js");
  const ui = source("app/OwnerBusinessReport.js");

  assert.match(layout, /import OwnerBusinessReport from "\.\/OwnerBusinessReport"/);
  assert.match(layout, /import "\.\/owner-business-report\.css"/);
  assert.match(layout, /<OwnerBusinessReport \/>/);
  assert.match(ui, /Laporan harian/);
  assert.match(ui, /owner-report-legacy-v2/);
  assert.match(ui, /owner-business-report-host/);
  assert.match(ui, /\/api\/owner-business-report/);
});

test("Owner report mencakup sales, finance, merchandise, team dan insight", () => {
  const ui = source("app/OwnerBusinessReport.js");

  for (const expected of [
    "BUSINESS HEALTH",
    "SALES PERFORMANCE",
    "FINANCIAL CONTROL",
    "MENU PERFORMANCE",
    "TEAM PERFORMANCE",
    "OWNER INSIGHTS",
    "Manager",
    "Admin",
    "Driver",
    "Best category by revenue",
    "Produk terbaik by revenue",
    "Produk aktif tanpa penjualan pada periode",
    "Jejak Admin → Manager → Owner",
  ]) assert.match(ui, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Owner report backend memakai data transaksi nyata dan comparison period", () => {
  const analytics = source("lib/owner-business-report.mjs");
  const route = source("app/api/owner-business-report/route.js");

  assert.match(analytics, /required\(user, \["OWNER"\]\)/);
  assert.match(analytics, /resolveManagerPeriod/);
  assert.match(analytics, /payments p JOIN orders o/);
  assert.match(analytics, /admin_shift_settlements/);
  assert.match(analytics, /manager_owner_settlements/);
  assert.match(analytics, /admin_cash_receipts/);
  assert.match(analytics, /deliveries d/);
  assert.match(analytics, /product_subcategories/);
  assert.match(analytics, /classifyOwnerBusinessHealth/);
  assert.match(route, /ownerBusinessReport/);
});

test("keuangan tidak mengklaim laba bersih tanpa HPP dan biaya lengkap", () => {
  const analytics = source("lib/owner-business-report.mjs");
  const ui = source("app/OwnerBusinessReport.js");

  assert.match(analytics, /Laba bersih belum dihitung/);
  assert.match(analytics, /HPP/);
  assert.match(ui, /Revenue ≠ laba bersih/);
  assert.match(ui, /accounting_note/);
});
