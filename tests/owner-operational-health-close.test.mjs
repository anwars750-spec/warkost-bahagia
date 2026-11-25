import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("app/owner-operational-health-close-precision.css", "utf8");
const loader = fs.readFileSync("app/owner-settings-dedicated-view.css", "utf8");

test("Operational Health close uses optically centered CSS X", () => {
  assert.match(loader, /owner-operational-health-close-precision\.css/);
  assert.match(css, /\.ooh-modal \.ooh-close svg\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.ooh-modal \.ooh-close::before/);
  assert.match(css, /\.ooh-modal \.ooh-close::after/);
  assert.match(css, /translate\(-50%, -50%\) rotate\(45deg\)/);
  assert.match(css, /translate\(-50%, -50%\) rotate\(-45deg\)/);
});
