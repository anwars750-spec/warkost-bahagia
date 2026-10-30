import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");
const css = await readFile(
  new URL("../app/customer-location-picker-warkost-polish.css", import.meta.url),
  "utf8",
);

test("Warkost polish stylesheet loads after base location picker styles", () => {
  const baseIndex = layout.indexOf('import "./customer-location-picker-ux.css"');
  const polishIndex = layout.indexOf(
    'import "./customer-location-picker-warkost-polish.css"',
  );
  assert.ok(baseIndex >= 0);
  assert.ok(polishIndex > baseIndex);
});

test("location picker uses parent Warkost brand tokens instead of green primary", () => {
  assert.match(css, /--wloc-brand:\s*#682c20/);
  assert.match(css, /--wloc-brand-hover:\s*#843e2b/);
  assert.match(css, /--wloc-accent:\s*#a25931/);
  assert.match(css, /--wloc-surface:\s*#f8f5ef/);
  assert.match(css, /\.wloc-primary\s*\{/);
  assert.match(css, /background:\s*var\(--wloc-brand\)/);
});

test("back and clear controls use geometry instead of font glyph alignment", () => {
  assert.match(css, /\.wloc-back::before/);
  assert.match(css, /\.wloc-back::after/);
  assert.match(css, /\.wloc-search-box button::before/);
  assert.match(css, /\.wloc-search-box button::after/);
  assert.match(css, /font-size:\s*0/);
});

test("search focus and selected chips use warm Warkost accents", () => {
  assert.match(css, /\.wloc-search-box:focus-within/);
  assert.match(css, /border-color:\s*#b98063/);
  assert.match(css, /\.wloc-chips button\.is-selected/);
  assert.match(css, /background:\s*#f3dfcf/);
});
