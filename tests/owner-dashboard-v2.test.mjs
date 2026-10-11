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

test("dashboard Owner mengirim tanggal terpilih dan menyediakan kontrol harian lengkap", () => {
  const component = source("app/OwnerDashboardRuntime.js");

  assert.match(
    component,
    /owner-dashboard-v2\?date=\$\{encodeURIComponent\(selectedDate\)\}/,
  );
  assert.match(component, /aria-label="Tanggal sebelumnya"/);
  assert.match(component, /aria-label="Tanggal berikutnya"/);
  assert.match(component, /type="date"/);
  assert.match(component, />\s*Hari Ini\s*</);
  assert.match(component, /disabled=\{isToday\}/);
});

test("KPI termasuk COD dihitung server-side pada tanggal Owner yang dipilih", () => {
  const route = source("app/api/owner-dashboard-v2/route.js");
  const component = source("app/OwnerDashboardRuntime.js");

  assert.match(route, /requestedDate[\s\S]*resolveManagerPeriod/);
  assert.match(route, /o\.created_at>=\? AND o\.created_at<\?/);
  assert.match(route, /codOutstanding:[\s\S]*count:[\s\S]*amount:/);
  assert.match(component, /dashboard\?\.codOutstanding\?\.count/);
  assert.match(component, /dashboard\?\.codOutstanding\?\.amount/);
  assert.doesNotMatch(component, /payload\.orders\.filter/);
});

test("dashboard Owner V2 membatasi akses cepat dan memberi ikon konsisten", () => {
  const component = source("app/OwnerDashboardRuntime.js");
  const styles = source("app/owner-dashboard-v2.css");

  for (const label of ["Setoran Kas", "Laporan", "Audit log", "Staf"])
    assert.match(component, new RegExp(`label: "${label}"`));
  for (const removed of [
    "Pantau persediaan",
    "Pantau antrean cetak",
    "Konfigurasi operasional",
  ])
    assert.doesNotMatch(component, new RegExp(removed));
  assert.match(component, /owner-shortcut-icon/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.owner-date-control/);
});
