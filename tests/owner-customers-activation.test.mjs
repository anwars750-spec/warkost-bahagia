import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("app/OwnerCustomersCenter.js", "utf8");
const layout = fs.readFileSync("app/layout.js", "utf8");
const page = fs.readFileSync("app/page.js", "utf8");

test("Owner Customer Center dirender native oleh page.js untuk view customers", () => {
  assert.match(page, /import OwnerCustomersCenter from "\.\/OwnerCustomersCenter"/);
  assert.match(
    page,
    /role === "OWNER" && view === "customers" && \(\s*<OwnerCustomersCenter \/>/,
  );
  assert.match(layout, /import "\.\/owner-customers-center\.css"/);
});

test("panel pelanggan lama hanya untuk Admin", () => {
  assert.match(page, /role === "ADMIN" && view === "customers" && \(/);
  assert.doesNotMatch(
    page,
    /\["ADMIN", "OWNER"\]\.includes\(role\) && view === "customers"/,
  );
});

test("halaman utama Owner Customer tidak memakai runtime takeover", () => {
  assert.doesNotMatch(layout, /import OwnerCustomersCenter/);
  assert.doesNotMatch(layout, /<OwnerCustomersCenter\s*\/>/);
  assert.doesNotMatch(source, /MutationObserver|setInterval|portalRoot/);
  assert.doesNotMatch(
    source,
    /owner-customers-center-active|setLegacyVisibility|ownerCustomerViewPresent/,
  );
  assert.doesNotMatch(source, /document\.querySelector\("body main"\)/);
  assert.match(source, /<section className="occ" aria-label="Owner Customer Center">/);
});

test("Owner Customer Center keeps customer controls and richer metrics", () => {
  assert.match(source, /\/api\/owner-customers/);
  assert.match(source, /\/api\/customer-active/);
  assert.match(source, /lifetime_value/);
  assert.match(source, /last_order_at/);
  assert.match(source, /Poin loyalty/);
});
