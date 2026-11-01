import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Setoran Kas dari Kontrol Usaha membuka modal settlement langsung", () => {
  const bridge = source("app/OwnerControlDirectBridge.js");
  const layout = source("app/layout.js");

  assert.match(bridge, /CASH_SETTLEMENT_LABEL = "Setoran Kas"/);
  assert.match(bridge, /\.owner-control-grid-v3 > button/);
  assert.match(bridge, /data-owner-cash-settlement-nav="true"/);
  assert.match(bridge, /event\.stopImmediatePropagation/);
  assert.match(bridge, /owner-popup-close/);
  assert.match(layout, /<OwnerControlDirectBridge \/>/);
});

test("Laporan dari Kontrol Usaha membuka report langsung tanpa preview generik", () => {
  const bridge = source("app/OwnerControlDirectBridge.js");

  assert.match(bridge, /REPORT_LABEL = "Laporan"/);
  assert.match(bridge, /ownerNavButton\(REPORT_LABEL\)/);
  assert.match(bridge, /openOwnerReport/);
  assert.match(bridge, /event\.stopImmediatePropagation/);
  assert.match(bridge, /owner-popup-close/);
});

test("modal Setoran Kas Owner tetap memakai settlement center existing", () => {
  const center = source("app/ManagerOwnerSettlementCenter.js");

  assert.match(center, /manager-owner-settlement/);
  assert.match(center, /data\.user\?\.role/);
  assert.match(center, /createPortal\(/);
  assert.match(center, /Setoran Manager/);
  assert.match(center, /action: "VERIFY"/);
  assert.match(center, /action: "REJECT"/);
});
