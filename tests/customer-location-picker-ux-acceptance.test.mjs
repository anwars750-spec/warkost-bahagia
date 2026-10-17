import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../app/CustomerLocationPickerUx.js", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../app/customer-location-picker-ux.css", import.meta.url),
  "utf8",
);

test("customer location UX keeps the locked search to confirmation flow", () => {
  assert.match(component, /Pilih lokasi/);
  assert.match(component, /Cari alamat, gedung, atau tempat/);
  assert.match(component, /Gunakan lokasi saat ini/);
  assert.match(component, /Konfirmasi lokasi/);
  assert.match(component, /Detail pengantaran/);
  assert.match(component, /GUNAKAN LOKASI INI/);
});

test("customer location UX keeps saved and manual fallbacks", () => {
  assert.match(component, /ALAMAT TERSIMPAN/);
  assert.match(component, /Masukkan alamat secara manual/);
  assert.match(component, /Alamat manual/);
  assert.match(component, /quickAddressLabel/);
  assert.match(component, /quickAddressDetail/);
});

test("customer location UX never displays raw coordinate input fields", () => {
  assert.doesNotMatch(component, />Latitude</);
  assert.doesNotMatch(component, />Longitude</);
  assert.doesNotMatch(component, /placeholder="Latitude/);
  assert.doesNotMatch(component, /placeholder="Longitude/);
});

test("out of range presentation replaces the final location CTA", () => {
  assert.match(component, /Di luar jangkauan pengantaran Warkost/);
  assert.match(component, /Lokasi ini belum dapat kami layani/);
  assert.match(component, /outOfRange \?/);
  assert.match(component, /Cari lokasi lain/);
});

test("provider failure copy stays customer friendly", () => {
  assert.match(component, /Pencarian lokasi otomatis sedang tidak tersedia/);
  assert.match(component, /alamat manual/);
  assert.doesNotMatch(component, /quota exceeded/i);
  assert.doesNotMatch(component, /API key/i);
});

test("maps UI uses embed preview rather than JavaScript Maps SDK", () => {
  assert.match(component, /google\.com\/maps\/embed\/v1\/place/);
  assert.doesNotMatch(component, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.doesNotMatch(component, /AdvancedMarkerElement/);
});

test("mobile sheet includes safe-area and bounded mobile width styling", () => {
  assert.match(css, /width: min\(100%, 430px\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /overscroll-behavior: contain/);
});
