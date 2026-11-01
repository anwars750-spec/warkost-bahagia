import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = fs.readFileSync(
  path.resolve(process.cwd(), "app/CustomerBanner.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.resolve(process.cwd(), "app/customer-banner-carousel.css"),
  "utf8",
);
const layout = fs.readFileSync(
  path.resolve(process.cwd(), "app/layout.js"),
  "utf8",
);
const page = fs.readFileSync(
  path.resolve(process.cwd(), "app/page.js"),
  "utf8",
);

test("banner berganti otomatis tanpa tombol panah", () => {
  assert.match(runtime, /const AUTOPLAY_MS = 5500/);
  assert.match(runtime, /setInterval/);
  assert.match(
    runtime,
    /setIndex\(\(value\) => \(value \+ 1\) % items.length\)/,
  );
  assert.doesNotMatch(page, /Banner sebelumnya|Banner berikutnya/);
});

test("mobile mendukung swipe horizontal kiri dan kanan", () => {
  assert.match(runtime, /Math.abs\(dx\) >= 45/);
  assert.match(runtime, /onPointerDown/);
  assert.match(runtime, /onPointerMove/);
  assert.match(runtime, /onPointerUp/);
  assert.match(runtime, /dx < 0 \? 1 : -1/);
  assert.match(styles, /touch-action: pan-y/);
});

test("desktop dapat klik banner untuk lanjut slide", () => {
  assert.match(runtime, /\(pointer: fine\)/);
  assert.match(runtime, /select\(\(current \+ 1\) % items.length\)/);
});

test("indikator dot hanya dirender untuk lebih dari satu banner", () => {
  assert.match(runtime, /banners\.length > 1/);
  assert.match(runtime, /banner-dots/);
  assert.match(styles, /\.home-banner \.banner-dots button\.active/);
  assert.match(styles, /width: 22px/);
});

test("React banner owns its lifecycle in the Customer homepage", () => {
  assert.match(layout, /import "\.\/customer-banner-carousel\.css";/);
  assert.doesNotMatch(layout, /CustomerBannerCarouselRuntime/);
  assert.match(page, /<CustomerBanner banners=\{menu.banners\}/);
  assert.doesNotMatch(
    runtime,
    /querySelector|MutationObserver|document.addEventListener/,
  );
});
