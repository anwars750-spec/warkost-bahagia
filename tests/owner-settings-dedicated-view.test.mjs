import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync("app/layout.js", "utf8");
const css = fs.readFileSync("app/owner-settings-dedicated-view.css", "utf8");

test("Owner Settings uses a dedicated module view instead of stacking below dashboard", () => {
  assert.match(layout, /owner-settings-dedicated-view\.css/);
  assert.match(css, /owner-settings-center-active #owner-dashboard-v3-host/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /owner-settings-center-active #owner-settings-center-host/);
});
