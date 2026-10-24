import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = fs.readFileSync(
  path.resolve(process.cwd(), "app/CustomerBannerCarouselRuntime.js"),
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
  assert.match(runtime, /window\.setInterval/);
  assert.match(runtime, /moveBanner\(1, false\)/);
  assert.doesNotMatch(page, /Banner sebelumnya|Banner berikutnya/);
});

test("mobile mendukung swipe horizontal kiri dan kanan", () => {
  assert.match(runtime, /const SWIPE_THRESHOLD_PX = 45/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /pointermove/);
  assert.match(runtime, /pointerup/);
  assert.match(runtime, /dx < 0 \? 1 : -1/);
  assert.match(styles, /touch-action: pan-y/);
});

test("desktop dapat klik banner untuk lanjut slide", () => {
  assert.match(runtime, /\(pointer: fine\)/);
  assert.match(runtime, /moveBanner\(1, true\)/);
});

test("indikator dot hanya dirender untuk lebih dari satu banner", () => {
  assert.match(page, /activeBanners\.length > 1/);
  assert.match(page, /banner-dots/);
  assert.match(styles, /\.home-banner \.banner-dots button\.active/);
  assert.match(styles, /width: 22px/);
});

test("runtime dan stylesheet banner terpasang dari root layout", () => {
  assert.match(layout, /import "\.\/customer-banner-carousel\.css";/);
  assert.match(
    layout,
    /import CustomerBannerCarouselRuntime from "\.\/CustomerBannerCarouselRuntime";/,
  );
  assert.match(layout, /<CustomerBannerCarouselRuntime \/>/);
});
