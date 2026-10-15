import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const customers = fs.readFileSync("app/OwnerCustomersCenter.js", "utf8");
const nav = fs.readFileSync("app/OwnerNavigationRuntime.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");
const css = fs.readFileSync("app/owner-customers-polish-v2.css", "utf8");

test("Owner navigation derives Pelanggan active state from the rendered customer page", () => {
  assert.match(nav, /Owner Customer Center/);
  assert.match(nav, /customerViewVisible \? "Pelanggan" : "Dashboard"/);
});

test("Owner customer actions use redesigned action buttons", () => {
  assert.match(customers, /occ-action-button/);
  assert.match(customers, /occ-detail-button occ-action-button/);
});

test("Owner customer detail uses redesigned modal structure", () => {
  assert.match(customers, /PROFIL PELANGGAN/);
  assert.match(customers, /occ-contact-grid/);
  assert.match(customers, /occ-modal-footer/);
});

test("Owner customer confirmation identifies the customer and uses polished styles", () => {
  assert.match(customers, /KONFIRMASI AKUN/);
  assert.match(customers, /occ-confirm-customer/);
  assert.match(layout, /owner-customers-polish-v2\.css/);
  assert.match(css, /\.occ-confirm-customer/);
});
