import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Operator Admin dibuka langsung dari Kontrol Usaha tanpa nav tersembunyi", () => {
  const component = source("app/OwnerAdminOperatorCenter.js");

  assert.match(component, /\.owner-control-grid-v3 > button/);
  assert.match(component, /controlLabel !== "Operator Admin"/);
  assert.match(component, /warkost:owner-open-admin-operators/);
  assert.match(component, /createPortal\(/);
  assert.doesNotMatch(component, /data-owner-nav=\"AdminOperator\"/);
  assert.doesNotMatch(component, /nav\.insertBefore/);
});

test("Operator Admin memakai modal penuh dan reset PIN berupa dialog sekunder", () => {
  const component = source("app/OwnerAdminOperatorCenter.js");
  const styles = source("app/owner-admin-operators.css");

  assert.match(component, /owner-operator-overlay/);
  assert.match(component, /owner-operator-summary/);
  assert.match(component, /owner-operator-reset-backdrop/);
  assert.match(component, /aria-label="Kelola Operator Admin"/);
  assert.match(styles, /\.owner-operator-panel/);
  assert.match(styles, /\.owner-operator-reset-backdrop/);
  assert.match(styles, /@media \(max-width: 820px\)/);
});
