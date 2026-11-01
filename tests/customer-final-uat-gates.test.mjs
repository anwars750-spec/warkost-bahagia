import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const demoRoute = fs.readFileSync(
  "app/api/payment/demo-complete/route.js",
  "utf8",
);
const layout = fs.readFileSync("app/layout.js", "utf8");
const benefitCss = fs.readFileSync(
  "app/customer-checkout-benefits-modern.css",
  "utf8",
);

test("QRIS simulation completion is available for staging UAT but not production", () => {
  assert.match(demoRoute, /new Set\(\["demo", "staging", "test"\]\)/);
  assert.match(demoRoute, /DEMO_DEPLOYMENTS\.has\(deployment\)/);
  assert.doesNotMatch(demoRoute, /DEPLOYMENT_ENV !== "demo"/);
});

test("customer QRIS renderer is mounted globally and remains a no-op without QR panel", () => {
  assert.match(layout, /import CustomerQrisRuntime from "\.\/CustomerQrisRuntime"/);
  assert.match(layout, /<CustomerQrisRuntime \/>/);
});

test("modern loyalty and voucher facades hide redundant legacy checkout headings", () => {
  assert.match(benefitCss, /\.loyalty-checkout-card:has\(\.warkost-loyalty-picker-trigger\)/);
  assert.match(benefitCss, /\.voucher-checkout-card:has\(\.warkost-voucher-picker-summary\)/);
  assert.match(benefitCss, /> \.checkout-card-heading/);
  assert.match(benefitCss, /display: none !important/);
});
