import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

test("Admin view enhancers are owned by the active React view, not the root layout", () => {
  const layout = read("app/layout.js");
  const page = read("app/page.js");

  // Cash/shift runtimes are intentionally global because they protect Admin
  // session continuity and settlement handoff across view changes. Only the
  // view-specific DOM enhancers/controllers must stay out of RootLayout.
  for (const legacyViewRuntime of [
    "AdminUiEnhancer",
    "AdminOrderCardEnhancer",
    "AdminCustomersEnhancer",
    "AdminPrinterController",
    "AdminBeverageStockEnhancerV2",
  ]) {
    assert.doesNotMatch(layout, new RegExp(legacyViewRuntime));
  }

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
  assert.match(orderEnhancer, /requestAnimationFrame/);
  assert.doesNotMatch(pageEnhancer, /headingText ===/);
  assert.doesNotMatch(orderEnhancer, /heading === "Pantau pesanan hari ini"/);
});

test("Admin order actions use distinct semantic visual cues", () => {
  const layout = read("app/layout.js");
  const page = read("app/page.js");
  const orderEnhancer = read("app/AdminOrderCardEnhancer.js");
  const cardCss = read("app/admin-order-cards-v2.css");
  const finalActionCss = read("app/admin-action-colors-final.css");

  assert.match(
    page,
    /className="primary admin-action-confirm"[\s\S]{0,400}Lanjutkan ke \{adminNext\[o\.status\]\}/,
  );
  assert.match(
    page,
    /className="primary admin-action-prepare"[\s\S]{0,400}Mulai siapkan minuman/,
  );
  assert.match(
    page,
    /className="primary admin-action-ready"[\s\S]{0,400}Minuman siap/,
  );

  assert.match(
    cardCss,
    /button\.admin-action-confirm[\s\S]{0,240}#7a3422[\s\S]{0,80}#5a2117[\s\S]{0,40}!important/,
  );
  assert.match(
    cardCss,
    /button\.admin-action-prepare[\s\S]{0,240}#f39a18[\s\S]{0,80}#d97706[\s\S]{0,40}!important/,
  );
  assert.match(
    cardCss,
    /button\.admin-action-ready[\s\S]{0,240}#28a95c[\s\S]{0,80}#18753b[\s\S]{0,40}!important/,
  );

  assert.doesNotMatch(orderEnhancer, /classifyActionButtons|actionToneStyle/);
  assert.doesNotMatch(orderEnhancer, /admin-action-(confirm|prepare|ready)/);

  assert.ok(
    layout.indexOf('import "./admin-action-colors-final.css";') >
      layout.indexOf('import "./realtime-operations.css";'),
  );
  assert.match(
    finalActionCss,
    /main\[data-admin-view="orders"\][\s\S]{0,160}button\.primary\.admin-action-confirm[\s\S]{0,180}#7a3422[\s\S]{0,80}#5a2117[\s\S]{0,40}!important/,
  );
  assert.match(
    finalActionCss,
    /main\[data-admin-view="orders"\][\s\S]{0,160}button\.primary\.admin-action-prepare[\s\S]{0,180}#f39a18[\s\S]{0,80}#d97706[\s\S]{0,40}!important/,
  );
  assert.match(
    finalActionCss,
    /main\[data-admin-view="orders"\][\s\S]{0,160}button\.primary\.admin-action-ready[\s\S]{0,180}#28a95c[\s\S]{0,80}#18753b[\s\S]{0,40}!important/,
  );
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
