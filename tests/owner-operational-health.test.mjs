import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync("app/OwnerControlDirectBridge.js", "utf8");
const source = fs.readFileSync("app/OwnerOperationalHealth.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");
const dashboard = fs.readFileSync("app/OwnerDashboardRuntime.js", "utf8");

test("Owner Operational Health is mounted and replaces the legacy health panel", () => {
  assert.match(layout, /<OwnerOperationalHealth \/>/);
  assert.doesNotMatch(bridge, /<OwnerOperationalHealth/);
  assert.match(source, /owner-health-panel-v3/);
  assert.match(source, /data-owner-health-legacy/);
  assert.match(source, /owner-operational-health-v4-host/);
});

test("Operational Health shares authoritative Owner dashboard data without duplicate fetch", () => {
  assert.match(dashboard, /warkost:owner-operational-data/);
  assert.match(source, /warkost:owner-operational-data/);
  assert.doesNotMatch(source, /owner-dashboard-v2\?preset=today/);
  assert.match(source, /tidak mengikuti filter periode Sales/i);
  assert.match(source, /setInterval\(load, 120000\)/);
  assert.match(source, /PRINTER_STATUS_CHANGED/);
});

test("Operational Health translates signals into Owner-friendly meaning and actions", () => {
  assert.match(source, /ARTINYA UNTUK OWNER/);
  assert.match(source, /TINDAKAN YANG DISARANKAN/);
  assert.match(source, /OPERASIONAL AMAN/);
  assert.match(source, /PERLU PERHATIAN/);
  assert.match(source, /PERLU TINDAKAN/);
  assert.match(source, /Buka Pengaturan Printer/);
});

test("Operational Health uses current order, stock, payment and printer signals", () => {
  assert.match(dashboard, /request\("stock"\)/);
  assert.match(dashboard, /request\("print-jobs"\)/);
  assert.match(source, /shared\.stock/);
  assert.match(source, /shared\.printJobs/);
  assert.match(source, /paymentStatuses/);
  assert.match(source, /available_quantity/);
  assert.match(source, /status === "FAILED"/);
});
