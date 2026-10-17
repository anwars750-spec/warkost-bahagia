import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const launcher = fs.readFileSync(
  new URL("../app/CustomerLocationLauncher.js", import.meta.url),
  "utf8",
);

test("account address settings reuse the location picker", () => {
  assert.match(launcher, /#account-address/);
  assert.match(launcher, /Pilih titik lokasi/);
  assert.match(launcher, /wloc-account-picker-trigger/);
  assert.match(launcher, /quick-address-toggle/);
});

test("account address save requires valid coordinates", () => {
  assert.match(launcher, /isCoordinatePairValid/);
  assert.match(launcher, /guardAccurateSubmit/);
  assert.match(
    launcher,
    /Pilih titik lokasi terlebih dahulu agar alamat tersimpan akurat/,
  );
  assert.match(launcher, /latitudeField\.value/);
  assert.match(launcher, /longitudeField\.value/);
});

test("picker result fills account address coordinates automatically", () => {
  assert.match(launcher, /quickAddressLatitude/);
  assert.match(launcher, /quickAddressLongitude/);
  assert.match(launcher, /setNativeValue\(latitudeField/);
  assert.match(launcher, /setNativeValue\(longitudeField/);
  assert.match(launcher, /toFixed\(6\)/);
});

test("manual location path is hidden in precise account mode", () => {
  assert.match(launcher, /body\.wloc-account-mode \.wloc-manual/);
  assert.match(launcher, /display: none !important/);
});

test("account bridge is excluded from legacy checkout form hiding", () => {
  assert.match(
    launcher,
    /checkout-quick-address:not\(\.wloc-account-bridge-form\)/,
  );
});
