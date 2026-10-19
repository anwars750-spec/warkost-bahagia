import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = fs.readFileSync(
  path.resolve(process.cwd(), "app/CustomerPromoSlideshowRuntime.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.resolve(process.cwd(), "app/customer-promo-slideshow.css"),
  "utf8",
);
const layout = fs.readFileSync(
  path.resolve(process.cwd(), "app/layout.js"),
  "utf8",
);

test("promo berganti otomatis tanpa tombol panah", () => {
  assert.match(runtime, /const AUTOPLAY_MS = 5500/);
  assert.match(runtime, /window\.setInterval/);
  assert.match(runtime, /movePromo\(1, false\)/);
  assert.match(styles, /aria-label="Promo sebelumnya"/);
  assert.match(styles, /aria-label="Promo berikutnya"/);
  assert.match(styles, /display: none !important/);
});

test("mobile mendukung swipe horizontal kiri dan kanan", () => {
  assert.match(runtime, /const SWIPE_THRESHOLD_PX = 45/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /pointermove/);
  assert.match(runtime, /pointerup/);
  assert.match(runtime, /dx < 0 \? 1 : -1/);
  assert.match(styles, /touch-action: pan-y/);
});

test("desktop dapat klik banner untuk lanjut promo tanpa mengganggu CTA", () => {
  assert.match(runtime, /INTERACTIVE_SELECTOR/);
  assert.match(runtime, /\(pointer: fine\)/);
  assert.match(runtime, /movePromo\(1, true\)/);
});

test("indikator dot tetap tersedia dan active state lebih jelas", () => {
  assert.match(runtime, /\.home-promo \.promo-dots button/);
  assert.match(styles, /\.home-promo \.promo-dots button\.active/);
  assert.match(styles, /width: 22px/);
});

test("runtime dan stylesheet promo terpasang dari root layout", () => {
  assert.match(layout, /import "\.\/customer-promo-slideshow\.css";/);
  assert.match(
    layout,
    /import CustomerPromoSlideshowRuntime from "\.\/CustomerPromoSlideshowRuntime";/,
  );
  assert.match(layout, /<CustomerPromoSlideshowRuntime \/>/);
});
