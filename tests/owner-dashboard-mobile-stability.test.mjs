import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const stability = fs.readFileSync("app/owner-dashboard-mobile-stability.css", "utf8");
const loader = fs.readFileSync("app/owner-settings-dedicated-view.css", "utf8");

test("Owner mobile dashboard stays inside viewport", () => {
  assert.match(stability, /body\.owner-dashboard-v3-active #owner-dashboard-v3-host/);
  assert.match(stability, /max-width:\s*100%\s*!important/);
  assert.match(stability, /overflow-x:\s*hidden\s*!important/);
  assert.match(stability, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test("Owner dashboard hides legacy order list", () => {
  assert.match(stability, /body\.owner-dashboard-v3-active \.order-list/);
  assert.match(stability, /body\.owner-dashboard-v3-active \.panel\.empty-state/);
  assert.match(stability, /display:\s*none\s*!important/);
});

test("Owner refresh icon is optically constrained", () => {
  assert.match(stability, /\.owner-refresh-button svg/);
  assert.match(stability, /width:\s*15px\s*!important/);
  assert.match(stability, /height:\s*15px\s*!important/);
  assert.match(stability, /display:\s*block\s*!important/);
});

test("Mobile stability layer is loaded", () => {
  assert.match(loader, /@import "\.\/owner-dashboard-mobile-stability\.css";/);
});
