import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Loyalty card opens module directly", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  assert.match(bridge, /const LOYALTY_LABEL = "Loyalty"/);
  assert.match(bridge, /openOwnerLoyalty/);
  assert.match(bridge, /LOYALTY_LABEL/);
});

test("Owner Loyalty Center replaces legacy reward screen", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerLoyaltyCenter.js");
  const css = read("app/owner-loyalty-center.css");
  assert.match(layout, /OwnerLoyaltyCenter/);
  assert.match(layout, /owner-loyalty-center\.css/);
  assert.match(ui, /Loyalty Performance/);
  assert.match(ui, /findLegacyLoyaltyPanel/);
  assert.match(ui, /data-owner-loyalty-legacy/);
  assert.match(css, /owner-loyalty-center-active/);
});

test("Owner loyalty analytics use loyalty ledger and paid loyalty orders", () => {
  const report = read("lib/owner-loyalty-report.mjs");
  const route = read("app/api/owner-loyalty-report/route.js");
  assert.match(report, /loyalty_transactions/);
  assert.match(report, /kind='EARN'/);
  assert.match(report, /kind='REDEEM'/);
  assert.match(report, /kind='RESTORE'/);
  assert.match(report, /loyalty_reward_rule_id IS NOT NULL/);
  assert.match(report, /p\.status='PAID'/);
  assert.match(route, /ownerLoyaltyReport/);
});

test("Owner can manage reward rules through existing server contract", () => {
  const ui = read("app/OwnerLoyaltyCenter.js");
  const loyalty = read("lib/loyalty.mjs");
  assert.match(ui, /\/api\/loyalty-reward/);
  assert.match(ui, /Tambah Reward/);
  assert.match(ui, /Atur Reward/);
  assert.match(loyalty, /saveRewardRule/);
  assert.match(loyalty, /CAPABILITIES\.LOYALTY_WRITE/);
});
