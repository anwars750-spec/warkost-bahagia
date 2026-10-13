import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Owner Settings mounts inline experience and tab navigation", () => {
  const layout = read("app/layout.js");
  const ui = read("app/OwnerSettingsExperience.js");
  const css = read("app/owner-settings-experience.css");
  assert.match(layout, /OwnerSettingsExperience/);
  assert.match(layout, /owner-settings-experience\.css/);
  assert.match(ui, /Bisnis/);
  assert.match(ui, /Lokasi/);
  assert.match(ui, /Delivery/);
  assert.match(ui, /Pembayaran/);
  assert.match(ui, /Printer/);
  assert.match(ui, /data-owner-settings-section/);
  assert.match(css, /\.osx-tabs/);
  assert.match(css, /\[data-owner-settings-section\]\[hidden\]/);
});

test("Owner location experience uses map and high accuracy device GPS", () => {
  const ui = read("app/OwnerSettingsExperience.js");
  assert.match(ui, /TITIK MAPS OUTLET/);
  assert.match(ui, /Gunakan lokasi perangkat/);
  assert.match(ui, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(ui, /enableHighAccuracy: true/);
  assert.match(ui, /google\.com\/maps\?q=/);
  assert.match(ui, /setNativeValue/);
});

test("Owner printer settings expose operational sync configuration", () => {
  const ui = read("app/OwnerSettingsExperience.js");
  const backend = read("lib/owner-device-settings.mjs");
  assert.match(ui, /Sinkronisasi printer dengan sistem/);
  assert.match(ui, /LAN \/ Network Agent/);
  assert.match(ui, /USB melalui Local Agent/);
  assert.match(ui, /Alamat printer \/ host/);
  assert.match(ui, /Lebar kertas/);
  assert.match(ui, /Timeout koneksi/);
  assert.match(ui, /Auto print order baru/);
  assert.match(ui, /agentPollSeconds/);
  assert.match(backend, /printer_admin/);
  assert.match(backend, /printer_kitchen/);
  assert.match(backend, /NETWORK_AGENT/);
  assert.match(backend, /USB_AGENT/);
  assert.match(backend, /PRINTER_DEVICE_SETTINGS_UPDATED/);
});

test("Printer config API is role scoped and uses printer read capability", () => {
  const backend = read("lib/owner-device-settings.mjs");
  const route = read("app/api/printer-config/route.js");
  assert.match(backend, /CAPABILITIES\.PRINTER_READ/);
  assert.match(backend, /user\.role === "ADMIN"/);
  assert.match(backend, /user\.role === "KITCHEN"/);
  assert.match(route, /getPrinterRuntimeConfig/);
});

test("Owner device settings remain protected by owner settings permissions", () => {
  const backend = read("lib/owner-device-settings.mjs");
  const route = read("app/api/owner-device-settings/route.js");
  assert.match(backend, /CAPABILITIES\.SETTINGS_READ/);
  assert.match(backend, /CAPABILITIES\.SETTINGS_WRITE/);
  assert.match(route, /assertSameOrigin/);
  assert.match(route, /saveOwnerDeviceSettings/);
});
