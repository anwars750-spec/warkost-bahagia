import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const launcher = fs.readFileSync(
  new URL("../app/CustomerLocationLauncher.js", import.meta.url),
  "utf8",
);

test("account address settings reuse the location picker without layout-id coupling", () => {
  assert.match(launcher, /findAddressFormCandidates/);
  assert.match(launcher, /\["label", "detail", "latitude", "longitude"\]/);
  assert.match(launcher, /Pilih titik lokasi/);
  assert.match(launcher, /wloc-account-picker-trigger/);
  assert.match(launcher, /quick-address-toggle/);
  assert.doesNotMatch(launcher, /querySelector\("#account-address"\)/);
});

test("legacy account location action is detected by class or visible label", () => {
  assert.match(launcher, /findLegacyLocationButton/);
  assert.match(launcher, /\.location-button/);
  assert.match(launcher, /gunakan lokasi perangkat/);
});

test("account address is explicitly location-first", () => {
  assert.match(launcher, /wloc-account-location-first/);
  assert.match(launcher, /Pilih titik lokasi pengantaran/);
  assert.match(launcher, /wloc-account-step-number/);
  assert.match(launcher, /wloc-account-point-summary/);
  assert.match(launcher, /Alamat & detail pengantaran/);
  assert.match(launcher, /Label alamat/);
});

test("detail label default and save stay locked until a precise point exists", () => {
  assert.match(launcher, /function setFormLocked/);
  assert.match(launcher, /labelField\.disabled = locked/);
  assert.match(launcher, /detailField\.disabled = locked/);
  assert.match(launcher, /defaultField\) defaultField\.disabled = locked/);
  assert.match(launcher, /saveButton\) saveButton\.disabled = locked/);
  assert.match(launcher, /setFormLocked\(true\)/);
  assert.match(launcher, /setFormLocked\(false\)/);
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

test("picker result fills account address coordinates and readable summary", () => {
  assert.match(launcher, /quickAddressLatitude/);
  assert.match(launcher, /quickAddressLongitude/);
  assert.match(launcher, /setNativeValue\(latitudeField/);
  assert.match(launcher, /setNativeValue\(longitudeField/);
  assert.match(launcher, /toFixed\(6\)/);
  assert.match(launcher, /pointSummaryText\.textContent/);
  assert.match(launcher, /selectedDetail/);
});

test("raw coordinate fields remain hidden and manual no-point path is removed", () => {
  assert.match(launcher, /body\.wloc-account-mode \.wloc-manual/);
  assert.match(launcher, /display: none !important/);
  assert.doesNotMatch(launcher, /Latitude:/);
  assert.doesNotMatch(launcher, /Longitude:/);
});

test("account bridge is excluded from legacy checkout form hiding", () => {
  assert.match(
    launcher,
    /checkout-quick-address:not\(\.wloc-account-bridge-form\)/,
  );
});
