import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Staff card opens module directly", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  assert.match(bridge, /const STAFF_LABEL = "Staf"/);
  assert.match(bridge, /openOwnerStaff/);
  assert.match(bridge, /STAFF_LABEL/);
});

test("Owner Staff Center replaces legacy staff screen", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerStaffCenter.js");
  const css = read("app/owner-staff-center.css");
  assert.match(layout, /OwnerStaffCenter/);
  assert.match(layout, /owner-staff-center\.css/);
  assert.match(ui, /Staf & Akses/);
  assert.match(ui, /findLegacyStaffPanel/);
  assert.match(ui, /data-owner-staff-legacy/);
  assert.match(css, /owner-staff-center-active/);
});

test("Owner Staff Center reuses existing staff contracts", () => {
  const ui = read("app/OwnerStaffCenter.js");
  const staff = read("lib/staff.mjs");
  assert.match(ui, /request\("staff"/);
  assert.match(ui, /request\("staff-password"/);
  assert.match(ui, /request\("driver-active"/);
  assert.match(staff, /CAPABILITIES\.STAFF_MANAGE/);
  assert.match(staff, /STAFF_PASSWORD_RESET/);
  assert.match(staff, /DRIVER_ACTIVE_CHANGED/);
});

test("Owner Staff Center preserves staff security rules", () => {
  const ui = read("app/OwnerStaffCenter.js");
  const staff = read("lib/staff.mjs");
  assert.match(ui, /Password staf minimal 14 karakter/);
  assert.match(ui, /Reset Password/);
  assert.match(ui, /Nonaktifkan/);
  assert.match(staff, /password\.length < 14/);
  assert.match(staff, /Driver masih memiliki pengantaran aktif/);
  assert.match(staff, /UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP/);
});

test("Add Staff modal loads precision polish and CSS-drawn close icon", () => {
  const layout = read("app/layout.js");
  const css = read("app/owner-staff-modal-polish.css");
  assert.match(layout, /owner-staff-modal-polish\.css/);
  assert.match(css, /INFORMASI AKUN/);
  assert.match(css, /KEAMANAN AKUN/);
  assert.match(css, /button\[aria-label="Tutup"\]::before/);
  assert.match(css, /button\[aria-label="Tutup"\]::after/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Reset Password modal keeps close control anchored and polished", () => {
  const layout = read("app/layout.js");
  const css = read("app/owner-staff-reset-modal-polish.css");
  assert.match(layout, /owner-staff-reset-modal-polish\.css/);
  assert.match(css, /\.osc-modal\.compact>header\{/);
  assert.match(css, /position:relative!important/);
  assert.match(css, /button\[aria-label="Tutup"\]/);
  assert.match(css, /PASSWORD BARU/);
  assert.match(css, /button\.primary:hover:not\(:disabled\)/);
});
