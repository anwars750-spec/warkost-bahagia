import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Audit card opens module directly", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  assert.match(bridge, /const AUDIT_LABEL = "Audit Log"/);
  assert.match(bridge, /openOwnerAudit/);
  assert.match(bridge, /ownerNavButton\("Audit log"\)/);
});

test("Owner Audit Center replaces legacy raw audit screen", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerAuditCenter.js");
  const css = read("app/owner-audit-center.css");
  assert.match(layout, /OwnerAuditCenter/);
  assert.match(layout, /owner-audit-center\.css/);
  assert.match(ui, /Audit Aktivitas/);
  assert.match(ui, /findLegacyAuditPanel/);
  assert.match(ui, /data-owner-audit-legacy/);
  assert.match(css, /owner-audit-center-active/);
});

test("Owner Audit translates technical actions into owner language", () => {
  const ui = read("app/OwnerAuditCenter.js");
  assert.match(ui, /Akun staf baru dibuat/);
  assert.match(ui, /Password staf direset/);
  assert.match(ui, /Pengaturan operasional diperbarui/);
  assert.match(ui, /Promo baru dibuat/);
  assert.match(ui, /Aturan Loyalty Reward disimpan/);
  assert.match(ui, /Manager mengajukan setoran kas/);
  assert.match(ui, /Setoran Manager diverifikasi/);
  assert.match(ui, /Setoran Manager ditolak/);
});

test("Owner Audit explains impact and sensitivity without claiming fraud", () => {
  const ui = read("app/OwnerAuditCenter.js");
  assert.match(ui, /Dampak untuk bisnis/);
  assert.match(ui, /Aktivitas sensitif/);
  assert.match(ui, /bukan berarti fraud atau kesalahan/);
  assert.match(ui, /Sensitif saja/);
  assert.match(ui, /Muat aktivitas lebih lama/);
});

test("Existing audit backend remains read-only and capability protected", () => {
  const operations = read("lib/operations.mjs");
  assert.match(operations, /CAPABILITIES\.AUDIT_READ/);
  assert.match(operations, /ORDER BY a\.id DESC LIMIT 51/);
  assert.match(operations, /nextCursor/);
});
