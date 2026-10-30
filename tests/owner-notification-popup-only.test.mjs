import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Owner notification click is intercepted before legacy inline navigation", () => {
  const popover = source("app/OwnerNotificationPopover.js");

  assert.match(popover, /window\.addEventListener\("click", onCapture, true\)/);
  assert.match(popover, /window\.removeEventListener\("click", onCapture, true\)/);
  assert.doesNotMatch(popover, /document\.addEventListener\("click", onCapture, true\)/);
  assert.match(popover, /event\.preventDefault\(\)/);
  assert.match(popover, /event\.stopPropagation\(\)/);
  assert.match(popover, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(popover, /data-owner-nav-key="Notifikasi"/);
  assert.match(popover, /PUSAT NOTIFIKASI OWNER/);
});
