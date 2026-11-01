import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  readKitchenView,
  saveKitchenView,
  forgetKitchenView,
  restoreKitchenView,
} from "../app/kitchen-workspace-state.mjs";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
test("Kitchen workspace persistence is allowlisted, per user and safe without storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  assert.equal(readKitchenView(storage, 1), "orders");
  saveKitchenView(storage, 1, "stock");
  assert.equal(readKitchenView(storage, 1), "stock");
  assert.equal(readKitchenView(storage, 2), "orders");
  saveKitchenView(storage, 1, "printing");
  assert.equal(readKitchenView(storage, 1), "printing");
  saveKitchenView(storage, 1, "settings");
  assert.equal(readKitchenView(storage, 1), "printing");
  values.set("warkost:kitchen-workspace:1", "notifications");
  assert.equal(readKitchenView(storage, 1), "orders");
  forgetKitchenView(storage, 1);
  assert.equal(readKitchenView(storage, 1), "orders");
  assert.equal(readKitchenView(null, 1), "orders");
  assert.doesNotThrow(() => saveKitchenView(null, 1, "stock"));
  assert.doesNotThrow(() => forgetKitchenView(null, 1));
  assert.equal(restoreKitchenView(1), "orders");
});

test("Kitchen role/view owns modern components directly and never mounts native panels", () => {
  const page = read("../app/page.js"),
    layout = read("../app/layout.js");
  assert.match(page, /restoreKitchenView\(me.user.id\)/);
  assert.match(
    page,
    /role === "KITCHEN" && view === "orders" && <KitchenDashboardFast/,
  );
  assert.match(
    page,
    /role === "KITCHEN" && view === "stock" && <KitchenStockCenter/,
  );
  assert.match(
    page,
    /role === "KITCHEN" && view === "printing" && <AdminPrinterView role="KITCHEN"/,
  );
  assert.match(page, /role === "OWNER" && view === "stock"/);
  assert.match(page, /role === "OWNER" && view === "printing"/);
  assert.match(page, /role && role !== "KITCHEN" && view === "orders"/);
  assert.doesNotMatch(
    layout,
    /KitchenDashboardMount|KitchenFlashGuard|KitchenStockCenter|KitchenHeaderActions|KitchenStockImageSync/,
  );
  assert.match(
    page,
    /data-kitchen-view=\{role === "KITCHEN" \? view : undefined\}/,
  );
});

test("Kitchen navigation class and workspace use the same React view", () => {
  const page = read("../app/page.js"),
    lifecycle = read("../app/KitchenWorkspace.js");
  for (const key of ["kitchen", "stock", "printer", "notification", "logout"])
    assert.ok(page.includes(`"${key}"`));
  assert.match(page, /view === "stock" \? "kitchen-nav-active"/);
  assert.match(page, /view === "printing" \? "kitchen-nav-active"/);
  assert.match(page, /view === "orders" \? "page"/);
  assert.match(lifecycle, /saveKitchenView/);
  assert.doesNotMatch(
    lifecycle,
    /querySelector|MutationObserver|setTimeout|createPortal|visibility/,
  );
  assert.doesNotMatch(
    read("../app/kitchen-nav-stability.css"),
    /data-kitchen-nav-target|KitchenFlashGuard/,
  );
});

test("Modern Kitchen data flows preserve read-only stock, station workflow and recovery", () => {
  const dashboard = read("../app/KitchenDashboardFast.js"),
    stock = read("../app/KitchenStockCenter.js"),
    printer = read("../app/AdminPrinterView.js");
  for (const source of [dashboard, stock]) {
    assert.doesNotMatch(
      source,
      /MutationObserver|querySelector|detectKitchen|createPortal/,
    );
    assert.match(source, /AbortController/);
    assert.match(source, /warkost:realtime-recovered/);
  }
  assert.match(dashboard, /request\("station-status", \{ orderId, status \}\)/);
  assert.match(dashboard, /KITCHEN_PHASES.has\(order.kitchen_status\)/);
  assert.match(stock, /aria-label="Stok Makanan Kitchen"/);
  assert.match(stock, /fetch\("\/api\/stock", \{/);
  assert.doesNotMatch(stock, /method: "POST"|food.length \? food : products/);
  assert.match(
    printer,
    /role === "KITCHEN" \? jobs.filter\(isKitchen\) : jobs/,
  );
  assert.match(printer, /role = "ADMIN"/);
  assert.match(
    read("../app/PrinterCenterRuntime.js"),
    /new Set\(\["OWNER"\]\)/,
  );
  assert.doesNotMatch(
    read("../app/KitchenHeaderActions.js"),
    /MutationObserver|isKitchenHeader|normalizedHeading/,
  );
});
