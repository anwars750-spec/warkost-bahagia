import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (name) =>
  fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
test("Admin role resolution never renders a guest workspace before session I/O completes", () => {
  const page = read("app/page.js");
  assert.match(page, /if \(!sessionResolved\)/);
  assert.ok(
    page.indexOf("if (!sessionResolved)") < page.indexOf("data-admin-view="),
  );
  assert.match(page, /setUser\(me.user\);\s*setSessionResolved\(true\)/);
});
test("Admin final operations markup is React-owned before the first workspace paint", () => {
  const page = read("app/page.js"),
    presentation = read("app/AdminPresentation.js");
  for (const token of [
    "admin-ui-header",
    "admin-ui-main",
    "heading admin-ui-heading",
    "stats admin-kpi-grid",
    "admin-order-card admin-order-card-v2",
    "admin-order-list-v2",
  ])
    assert.ok(page.includes(token), token);
  assert.match(page, /<AdminDailySummary dashboard=\{dashboard\} \/>/);
  assert.match(page, /<AdminCodLauncherButton inline \/>/);
  assert.match(presentation, /id="admin-daily-summary"/);
  assert.doesNotMatch(presentation, /MutationObserver|setTimeout|innerHTML/);
});
test("Admin replaces legacy workspaces rather than hiding or decorating them", () => {
  const page = read("app/page.js"),
    layout = read("app/layout.js");
  assert.doesNotMatch(
    page,
    /Daftar pelanggan|admin-stock-native-placeholder|AdminUiEnhancer|AdminBeverageStockPolish/,
  );
  assert.match(
    page,
    /role === "OWNER" && view === "printing"/,
  );
  assert.doesNotMatch(
    layout,
    /AdminOrderNumberEnhancer|AdminCodLauncherButton/,
  );
  for (const name of [
    "AdminCustomersEnhancer",
    "AdminBeverageStockEnhancerV2",
    "AdminPrinterView",
  ]) {
    const source = read(`app/${name}.js`);
    assert.match(source, /data-admin-ui-owner="react"/);
    assert.doesNotMatch(
      source,
      /innerHTML|MutationObserver|document\.querySelector|createElement/,
    );
    assert.match(source, /AbortController/);
  }
});

test("Admin order detail opens by explicit order id without a native inline fallback", () => {
  const page = read("app/page.js"),
    modal = read("app/AdminOrderModalEnhancer.js");
  assert.match(page, /warkost:open-admin-order/);
  assert.match(
    modal,
    /addEventListener\("warkost:open-admin-order", onOpenOrder\)/,
  );
  assert.match(modal, /useLayoutEffect/);
  assert.doesNotMatch(
    read("app/AdminCodLauncherButton.js"),
    /querySelector|createPortal|MutationObserver/,
  );
});
