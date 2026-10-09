import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

test("Admin Pelanggan uses one page title and preserves both existing workspaces", () => {
  const enhancer = read("app/AdminCustomersEnhancer.js");

  assert.doesNotMatch(enhancer, /<section class="admin-customers-hero">/);
  assert.doesNotMatch(enhancer, /Kelola pelanggan & layanan customer/);
  assert.match(enhancer, />Data Pelanggan</);
  assert.match(enhancer, />Customer Service</);
  assert.match(enhancer, /admin-customer-summary-grid/);
  assert.match(enhancer, /admin-customer-search/);
  assert.match(enhancer, /warkost:open-admin-customer-service/);
});

test("Admin Pelanggan polish is scoped and hides the operational COD card only there", () => {
  const polish = read("app/admin-customers-polish.css");
  const operations = read("app/admin-ui.css");

  assert.match(
    polish,
    /main\[data-admin-view="customers"\] \.admin-ui-heading::after/,
  );
  assert.match(polish, /content: none !important/);
  assert.match(polish, /font-size: clamp\(25px, 2\.2vw, 31px\)/);
  assert.match(
    polish,
    /grid-template-columns: repeat\(3, minmax\(260px, 1fr\)\)/,
  );
  assert.match(
    polish,
    /@media \(max-width: 1050px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    polish,
    /@media \(max-width: 760px\)[\s\S]*grid-template-columns: 1fr/,
  );

  // COD settlement remains available in the operational workspace.
  assert.match(operations, /SETORAN COD/);
  assert.match(operations, /\.admin-operations-view \.admin-ui-heading::after/);
});

test("Admin customer search and filter semantics remain unchanged", () => {
  const enhancer = read("app/AdminCustomersEnhancer.js");

  for (const filter of ["all", "active", "orders", "points"])
    assert.equal(enhancer.includes(`["${filter}",`), true);
  assert.match(enhancer, /activeFilter === "active"/);
  assert.match(enhancer, /activeFilter === "orders"/);
  assert.match(enhancer, /activeFilter === "points"/);
  assert.match(
    enhancer,
    /fetchJson\(`\/api\/customers\?q=\$\{encodeURIComponent\(query\)\}`\)/,
  );
  assert.match(enhancer, /loadCustomers\(searchValue\.trim\(\)\)/);
});
