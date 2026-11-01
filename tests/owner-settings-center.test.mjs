import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Settings card opens module directly", () => {
  const bridge = read("app/OwnerControlDirectBridge.js");
  assert.match(bridge, /const SETTINGS_LABEL = "Pengaturan"/);
  assert.match(bridge, /openOwnerSettings/);
  assert.match(bridge, /ownerNavButton\(SETTINGS_LABEL\)/);
});

test("Owner Settings Center replaces legacy cafe settings", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerSettingsCenter.js");
  const css = read("app/owner-settings-center.css");
  assert.match(layout, /OwnerSettingsCenter/);
  assert.match(layout, /owner-settings-center\.css/);
  assert.match(ui, /Pengaturan Operasional/);
  assert.match(ui, /findLegacySettingsPanel/);
  assert.match(ui, /data-owner-settings-legacy/);
  assert.match(css, /owner-settings-center-active/);
});

test("Owner Settings exposes business, location, payment and printer controls", () => {
  const ui = read("app/OwnerSettingsCenter.js");
  assert.match(ui, /Identitas & kontak/);
  assert.match(ui, /Titik asal pengantaran/);
  assert.match(ui, /Batas waktu pembayaran/);
  assert.match(ui, /Printer operasional/);
  assert.match(ui, /Simpan Pengaturan/);
  assert.match(ui, /warkost:owner-settings-updated/);
});

test("Checkout radius remains locked at 3 km free and 10 km max", () => {
  const delivery = read("lib/delivery.mjs");
  const settings = read("lib/settings.mjs");
  const ui = read("app/OwnerSettingsCenter.js");
  assert.match(delivery, /freeKm: 3/);
  assert.match(delivery, /maxKm: 10/);
  assert.match(settings, /deliveryFreeKm: DEFAULT_DELIVERY_RULES\.freeKm/);
  assert.match(settings, /deliveryMaxKm: DEFAULT_DELIVERY_RULES\.maxKm/);
  assert.match(ui, /ATURAN CHECKOUT TERKUNCI/);
  assert.match(ui, /Radius tidak diedit dari Owner Settings/);
  assert.match(ui, /readOnly/);
});

test("Settings save remains capability protected and audited", () => {
  const settings = read("lib/settings.mjs");
  assert.match(settings, /CAPABILITIES\.SETTINGS_READ/);
  assert.match(settings, /CAPABILITIES\.SETTINGS_WRITE/);
  assert.match(settings, /SETTINGS_UPDATED/);
});
