import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync("app/OwnerControlDirectBridge.js", "utf8");
const source = fs.readFileSync("app/OwnerOperationalHealth.js", "utf8");

test("Owner Operational Health is mounted and replaces the legacy health panel", () => {
  assert.match(bridge, /OwnerOperationalHealth/);
  assert.match(source, /owner-health-panel-v3/);
  assert.match(source, /data-owner-health-legacy/);
  assert.match(source, /owner-operational-health-v4-host/);
});

test("Operational Health always reads the current day independently from Sales filters", () => {
  assert.match(source, /owner-dashboard-v2\?preset=today/);
  assert.match(source, /tidak mengikuti filter periode Sales/i);
  assert.match(source, /setInterval\(load, 30000\)/);
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
  assert.match(source, /request\("stock"\)/);
  assert.match(source, /request\("print-jobs"\)/);
  assert.match(source, /paymentStatuses/);
  assert.match(source, /available_quantity/);
  assert.match(source, /status === "FAILED"/);
});
