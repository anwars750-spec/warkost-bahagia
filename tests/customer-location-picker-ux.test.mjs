import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../app/CustomerLocationPickerUx.js", import.meta.url),
  "utf8",
);
const layout = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");
const css = await readFile(
  new URL("../app/customer-location-picker-ux.css", import.meta.url),
  "utf8",
);

const customerPage = await readFile(new URL("../app/page.js", import.meta.url), "utf8");

test("location picker is scoped inside the authenticated Customer boundary", () => {
  assert.match(customerPage, /CustomerLocationPickerUx/);
  assert.match(layout, /customer-location-picker-ux\.css/);
  assert.match(customerPage, /<CustomerLocationPickerUx \/>/);
});

test("location search uses minimum query and debounce contract", () => {
  assert.match(component, /SEARCH_MIN_LENGTH = 3/);
  assert.match(component, /SEARCH_DEBOUNCE_MS = 500/);
  assert.match(component, /\/api\/location\/autocomplete/);
  assert.match(component, /sessionToken/);
  assert.match(component, /AbortController/);
});

test("location picker keeps current, saved and manual fallbacks", () => {
  assert.match(component, /Gunakan lokasi saat ini/);
  assert.match(component, /ALAMAT TERSIMPAN/);
  assert.match(component, /Masukkan alamat secara manual/);
  assert.match(component, /quickAddressLabel/);
  assert.match(component, /quickAddressDetail/);
});

test("GPS fails gracefully outside a secure context", () => {
  assert.match(component, /window\.isSecureContext/);
  assert.match(component, /GPS memerlukan koneksi aman \(HTTPS\)/);
  assert.match(component, /window\.navigator\?\.geolocation/);
  assert.match(component, /Izin lokasi ditolak/);
});

test("location confirmation exposes delivery UX contract", () => {
  assert.match(component, /Konfirmasi lokasi/);
  assert.match(component, /Jarak dari Warkost/);
  assert.match(component, /Ongkir/);
  assert.match(component, /Estimasi/);
  assert.match(component, /GUNAKAN LOKASI INI/);
  assert.match(component, /Di luar jangkauan pengantaran Warkost/);
});

test("maps embed stays optional until browser key is configured", () => {
  assert.match(component, /NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY/);
  assert.match(component, /google\.com\/maps\/embed\/v1\/place/);
  assert.match(component, /Pratinjau peta aktif setelah Google Maps Embed dikonfigurasi/);
});

test("location picker styles remain mobile first", () => {
  assert.match(css, /width: min\(100%, 430px\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
});
