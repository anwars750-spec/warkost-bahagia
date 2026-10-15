import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const customers = fs.readFileSync("app/OwnerCustomersCenter.js", "utf8");
const nav = fs.readFileSync("app/OwnerNavigationRuntime.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");
const css = fs.readFileSync("app/owner-customers-polish-v2.css", "utf8");
const finalCss = fs.readFileSync("app/owner-customers-final-polish.css", "utf8");

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

test("Owner customer list actions stay aligned in two equal columns", () => {
  assert.match(css, /\.occ-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.occ-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Owner customer detail footer keeps Tutup and primary action equal", () => {
  assert.match(css, /\.occ-modal-footer\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-modal-footer\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Owner customer confirmation keeps cancel and confirm buttons equal", () => {
  assert.match(css, /\.occ-confirm-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-confirm-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Owner customer detail stays centered as a card on narrow mobile", () => {
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-backdrop\{place-items:center;padding:12px\}/);
  assert.match(css, /\.occ-modal\{[\s\S]*width:min\(380px,calc\(100vw - 24px\)\);height:auto;max-height:calc\(100dvh - 24px\);margin:auto;/);
  assert.doesNotMatch(css, /@media\(max-width:480px\)[\s\S]*\.occ-modal\{[^}]*height:100dvh/);
});

test("Owner customer confirmation uses compact centered desktop and mobile cards", () => {
  assert.match(css, /\.occ-backdrop\.confirm\{place-items:center;padding:20px\}/);
  assert.match(css, /\.occ-confirm\{[\s\S]*width:min\(420px,calc\(100vw - 40px\)\);margin:auto;padding:22px 22px 20px;/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-confirm\{[\s\S]*width:min\(360px,calc\(100vw - 24px\)\);margin:auto;padding:18px 16px 16px;/);
});

test("Owner customer mobile row keeps metrics and actions balanced", () => {
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-row\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:8px;padding:12px\}/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*\.occ-metric,body \.occ-activity\{[\s\S]*grid-column:auto!important/);
});

test("Final Owner customer polish is loaded after other Owner styles", () => {
  assert.match(layout, /owner-settings-dedicated-view\.css";\nimport "\.\/owner-customers-final-polish\.css";\nimport "\.\/print-branding\.css/);
});

test("Final customer detail keeps header fixed and scroll isolated to body", () => {
  assert.match(finalCss, /\.occ-modal\{[\s\S]*overflow:hidden!important[\s\S]*display:flex!important/);
  assert.match(finalCss, /\.occ-modal-head\{[\s\S]*position:relative!important/);
  assert.match(finalCss, /\.occ-modal-body\{[\s\S]*overflow-y:auto!important/);
});

test("Final mobile customer experience keeps two-column metrics and actions", () => {
  assert.match(finalCss, /@media\(max-width:480px\)[\s\S]*\.occ-row\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(finalCss, /@media\(max-width:480px\)[\s\S]*\.occ-actions\{[\s\S]*grid-column:1\/-1!important/);
  assert.match(finalCss, /@media\(max-width:480px\)[\s\S]*\.occ-confirm-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
