import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("app/owner-customers-final-polish.css", "utf8");

test("desktop customer action column reserves stable space", () => {
  assert.match(css, /grid-template-columns:minmax\(220px,1fr\) 92px 78px 82px 120px 150px 214px!important/);
  assert.match(css, /grid-template-columns:86px 112px!important/);
  assert.match(css, /height:38px!important/);
});

test("active and inactive customer actions share the same geometry", () => {
  assert.match(css, /\.occ-toggle\.danger\.occ-action-button/);
  assert.match(css, /\.occ-toggle\.success\.occ-action-button/);
  assert.match(css, /width:206px!important/);
});

test("detail footer is compact and balanced", () => {
  assert.match(css, /\.occ-modal-footer\{[\s\S]*width:min\(420px,100%\)!important/);
  assert.match(css, /\.occ-modal-secondary,[\s\S]*\.occ-modal-action\{[\s\S]*height:42px!important/);
});

test("owner control icon is explicitly centered", () => {
  assert.match(css, /\.occ-rule-icon\{[\s\S]*place-items:center!important/);
  assert.match(css, /\.occ-rule-icon::before\{[\s\S]*content:"i"!important/);
});

test("confirmation actions are compact and equal", () => {
  assert.match(css, /\.occ-confirm-actions\{[\s\S]*width:min\(320px,100%\)!important/);
  assert.match(css, /\.occ-confirm-actions button\{[\s\S]*height:42px!important/);
});

test("mobile customer actions remain equal width", () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.occ-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
