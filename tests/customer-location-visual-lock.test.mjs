import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const launcher = await readFile(
  new URL("../app/CustomerLocationLauncher.js", import.meta.url),
  "utf8",
);
const visualLock = await readFile(
  new URL("../app/CustomerLocationVisualLock.js", import.meta.url),
  "utf8",
);

test("location launcher mounts runtime visual lock", () => {
  assert.match(launcher, /CustomerLocationVisualLock/);
  assert.match(launcher, /return <CustomerLocationVisualLock \/>/);
});

test("visual lock uses Warkost parent palette", () => {
  assert.match(visualLock, /#682c20/);
  assert.match(visualLock, /#843e2b/);
  assert.match(visualLock, /#a25931/);
  assert.match(visualLock, /#f8f5ef/);
  assert.match(visualLock, /#e2d9cf/);
});

test("visual lock removes font dependent back search and clear glyphs", () => {
  assert.match(visualLock, /\.wloc-back::before/);
  assert.match(visualLock, /\.wloc-back::after/);
  assert.match(visualLock, /span:first-child::before/);
  assert.match(visualLock, /Hapus pencarian.*::before/s);
  assert.match(visualLock, /font-size: 0 !important/);
});

test("visual lock is injected after hydration", () => {
  assert.match(visualLock, /document\.head\.appendChild/);
  assert.match(visualLock, /dataset\.wlocVisual = "v2"/);
});
