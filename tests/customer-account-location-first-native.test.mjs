import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../app/CustomerAccountAddressLocationFirst.js", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../app/layout.js", import.meta.url),
  "utf8",
);

test("native account address runtime is mounted", () => {
  assert.match(layout, /CustomerAccountAddressLocationFirst/);
  assert.match(runtime, /wloc-native-location-first/);
});

test("location-first flow physically moves the picker before address fields", () => {
  assert.match(runtime, /heading\.insertAdjacentElement\("afterend", pickerCard\)/);
  assert.match(runtime, /pickerCard\.insertAdjacentElement\("afterend", detailSection\)/);
  assert.match(runtime, /detailSection\.insertAdjacentElement\("afterend", labelSection\)/);
});

test("steps two through five stay hidden until coordinates are valid", () => {
  assert.match(runtime, /wloc-native-step-hidden/);
  assert.match(runtime, /form\.dataset\.wlocPointReady === "1"/);
  assert.match(runtime, /Number\.isFinite\(Number\(latitudeField\?\.value\)\)/);
  assert.match(runtime, /Number\.isFinite\(Number\(longitudeField\?\.value\)\)/);
});

test("customer sees a clear five-step address flow", () => {
  assert.match(runtime, /Pilih titik lokasi pengantaran/);
  assert.match(runtime, /Lengkapi detail alamat/);
  assert.match(runtime, /Beri label alamat/);
  assert.match(runtime, /Pilih sebagai alamat default/);
  assert.match(runtime, /Simpan alamat/);
});
