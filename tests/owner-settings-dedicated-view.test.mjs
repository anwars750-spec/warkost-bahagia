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

test("Owner location hides raw latitude and longitude controls while keeping them mounted", () => {
  assert.match(css, /data-owner-settings-section="location"/);
  assert.match(css, /> \.osc-fields\.two/);
  assert.match(css, /clip-path:\s*inset\(50%\)/);
  assert.match(css, /pointer-events:\s*none\s*!important/);
});
