import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Promo card opens the real promo module directly", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  assert.match(bridge, /const PROMO_LABEL = "Promo"/);
  assert.match(bridge, /openOwnerPromo/);
  assert.match(bridge, /CASH_SETTLEMENT_LABEL, REPORT_LABEL, PROMO_LABEL/);
});

test("Owner promo legacy read-only panel is targeted for takeover", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  const css = read("app/owner-promotion-heading-fix.css");
  assert.match(bridge, /markOwnerLegacyPromoPanel/);
  assert.match(bridge, /startsWith\("promo customer"\)/);
  assert.match(bridge, /ownerPromoLegacyPanel/);
  assert.match(css, /data-owner-promo-legacy-panel/);
  assert.match(css, /display:\s*none\s*!important/);
});

test("Owner promotion performance is mounted and read only", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerPromotionReport.js");
  const rbac = read("lib/rbac.mjs");
  assert.match(layout, /OwnerPromotionReport/);
  assert.match(layout, /owner-promotion-report\.css/);
  assert.match(ui, /Promo Performance/);
  assert.match(ui, /READ ONLY · OWNER/);
  assert.match(ui, /owner-promotion-report/);
  assert.match(rbac, /CAPABILITIES\.PROMOTION_READ/);
  assert.doesNotMatch(
    rbac.match(/ROLES\.OWNER[\s\S]*?\]\),/s)?.[0] || "",
    /CAPABILITIES\.PROMOTION_WRITE/,
  );
});

test("Owner promo analytics use paid promo orders and discount attribution", () => {
  const report = read("lib/owner-promotion-report.mjs");
  const route = read("app/api/owner-promotion-report/route.js");
  assert.match(report, /promotion_redemptions/);
  assert.match(report, /pay\.status='PAID'/);
  assert.match(report, /promotion_discount/);
  assert.match(report, /promo_revenue_contribution/);
  assert.match(report, /Revenue promo adalah revenue order PAID/);
  assert.match(route, /ownerPromotionReport/);
});

test("Legacy Owner promo heading is hidden only while Owner promo report is active", () => {
  const css = read("app/owner-promotion-heading-fix.css");
  assert.match(css, /body\.owner-promotion-report-active main > \.heading/);
});
