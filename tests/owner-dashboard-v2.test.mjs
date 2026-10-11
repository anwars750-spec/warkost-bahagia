import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveManagerPeriod } from "../lib/manager-analytics.mjs";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Owner memakai batas tanggal Jakarta yang sama dengan analytics Manager", () => {
  const period = resolveManagerPeriod({
    preset: "custom",
    from: "2026-10-11",
    to: "2026-10-11",
  });

  assert.equal(period.fromDate, "2026-10-11");
  assert.equal(period.toDate, "2026-10-11");
  assert.equal(period.from, "2026-10-10 17:00:00");
  assert.equal(period.until, "2026-10-11 17:00:00");
});

test("Ringkasan Sales Owner menyediakan Hari Ini, Bulan Ini, Bulan Lalu, dan Custom", () => {
  const component = source("app/OwnerDashboardRuntime.js");
  const route = source("app/api/owner-dashboard-v2/route.js");

  for (const preset of ["today", "month", "last_month", "custom"])
    assert.match(component, new RegExp(`\\[\\"${preset}\\"`));

  assert.match(component, /customFrom/);
  assert.match(component, /customTo/);
  assert.match(component, /owner-dashboard-v2\?\$\{dashboardQuery\}/);
  assert.match(route, /resolveOwnerPeriod/);
  assert.match(route, /previousMonthRange/);
  assert.match(route, /preset === "last_month"/);
});

test("KPI Owner dihitung server-side termasuk COD serta QRIS dan Transfer", () => {
  const route = source("app/api/owner-dashboard-v2/route.js");
  const component = source("app/OwnerDashboardRuntime.js");

  assert.match(route, /codOutstanding:[\s\S]*count:[\s\S]*amount:/);
  assert.match(route, /digitalPayments:[\s\S]*count:[\s\S]*amount:/);
  assert.match(route, /'QRIS','TRANSFER','BANK_TRANSFER'/);
  assert.match(component, /dashboard\?\.codOutstanding\?\.count/);
  assert.match(component, /dashboard\?\.digitalPayments\?\.amount/);
  assert.match(component, /QRIS & Transfer/);
});

test("Operational Health dan Kontrol Usaha menggunakan popup sebelum navigasi", () => {
  const component = source("app/OwnerDashboardRuntime.js");
  const styles = source("app/owner-dashboard-v3.css");

  for (const label of [
    "Orderan Aktif",
    "Produk Stock Habis",
    "Pembayaran Pending",
    "Printer",
  ])
    assert.match(component, new RegExp(label));

  for (const label of [
    "Setoran Kas",
    "Laporan",
    "Promo",
    "Audit Log",
    "Staf",
    "Loyalty",
    "Operator Admin",
    "Pengaturan",
  ])
    assert.match(component, new RegExp(label));

  assert.match(component, /openActionPopup/);
  assert.match(component, /owner-popup-backdrop/);
  assert.match(component, /owner-popup-action/);
  assert.match(styles, /\.owner-popup-card/);
  assert.match(styles, /\.owner-control-grid-v3/);
});

test("Header Owner hanya mempertahankan Dashboard, Pelanggan, Notifikasi, dan Keluar", () => {
  const navigation = source("app/OwnerNavigationRuntime.js");
  const styles = source("app/owner-navigation-v2.css");

  assert.match(
    navigation,
    /VISIBLE_TABS = new Set\(\["Dashboard", "Pelanggan", "Notifikasi", "Keluar"\]\)/,
  );
  assert.match(navigation, /data\.ownerNavVisible/);
  assert.match(styles, /data-owner-nav-visible="false"/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});
