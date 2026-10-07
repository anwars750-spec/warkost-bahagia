import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

test("Admin enhancers are owned by the active React view, not the root layout", () => {
  const layout = read("app/layout.js");
  const page = read("app/page.js");

  assert.doesNotMatch(layout, /Admin(?:Ui|Order|Customers|Printer|Beverage|View)/);
  assert.match(page, /<AdminUiRuntime view=\{view\} \/>/);
  assert.match(page, /view === "orders" &&/);
  assert.match(page, /view === "customers" &&/);
  assert.match(page, /view === "admin-stock" &&/);
  assert.match(page, /view === "printing" && <AdminPrinterController \/>/);
  assert.match(page, /data-admin-view=\{role === "ADMIN" \? view : undefined\}/);
});

test("Admin navigation is React-owned and exposes every stabilized workspace", () => {
  const page = read("app/page.js");
  const adminNav = page.match(
    /role === "ADMIN" && \([\s\S]*?\{role === "MANAGER" &&/,
  )?.[0];

  assert.ok(adminNav);
  for (const label of ["Pelanggan", "Stok", "Printer"])
    assert.match(adminNav, new RegExp(`>\\s*${label}\\s*<`));
  assert.match(page, /role === "ADMIN" && view === "orders"/);
  assert.match(page, /view === "customers" \? "admin-nav-active"/);
  assert.match(page, /view === "admin-stock" \? "admin-nav-active"/);
  assert.match(page, /view === "printing" \? "admin-nav-active"/);
  assert.match(page, /else if \(role !== "ADMIN"\) setView\("notifications"\)/);
  assert.match(page, /data-admin-nav="Stok"/);
  assert.match(page, /<AdminNavIcon name="box" \/>/);
});

test("view controllers no longer infer routes or observe the global body", () => {
  const sources = [
    "app/AdminCustomersEnhancer.js",
    "app/AdminCustomerServiceMobileEnhancer.js",
    "app/AdminPrinterController.js",
    "app/AdminBeverageStockEnhancerV2.js",
  ].map(read);

  for (const source of sources) {
    assert.doesNotMatch(source, /main \.heading h1/);
    assert.doesNotMatch(source, /observer\.observe\(document\.body/);
    assert.doesNotMatch(source, /admin-beverage-stock-nav-v2/);
  }

  const pageEnhancer = read("app/AdminUiEnhancer.js");
  const orderEnhancer = read("app/AdminOrderCardEnhancer.js");
  assert.match(pageEnhancer, /observer\.observe\(main,/);
  assert.doesNotMatch(pageEnhancer, /button\.dataset\.adminNav/);
  assert.doesNotMatch(pageEnhancer, /button\.querySelector\("\.admin-nav-icon"\)/);
  assert.doesNotMatch(orderEnhancer, /new MutationObserver/);
  assert.match(orderEnhancer, /warkost:admin-orders-rendered/);
  assert.doesNotMatch(pageEnhancer, /headingText ===/);
  assert.doesNotMatch(orderEnhancer, /heading === "Pantau pesanan hari ini"/);
});

test("obsolete competing controllers and route-fence CSS are removed", () => {
  for (const file of [
    "app/AdminViewCoordinator.js",
    "app/AdminUiStabilityGuard.js",
    "app/AdminCustomersSingletonGuard.js",
    "app/AdminPrinterEnhancer.js",
    "app/AdminPrinterEnhancerV2.js",
    "app/AdminBeverageStockEnhancer.js",
  ])
    assert.equal(fs.existsSync(path.join(projectRoot, file)), false, file);

  const stability = read("app/admin-ui-stability.css");
  assert.doesNotMatch(stability, /data-admin-route/);
  assert.doesNotMatch(stability, /admin-stock-gap-anchor/);
  assert.doesNotMatch(stability, /admin-beverage-stock-floating-nav/);
  assert.match(stability, /body\.admin-printer-stable-view main/);
  assert.match(stability, /body\.admin-beverage-stock-view main/);
});
