import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Owner navigation collapses legacy menu immediately on DOM signature", () => {
  const runtime = source("app/OwnerNavigationRuntime.js");

  assert.match(runtime, /useLayoutEffect/);
  assert.match(runtime, /ownerNavigationSignaturePresent/);
  assert.match(runtime, /labels\.has\("Pengaturan"\)/);
  assert.match(runtime, /labels\.has\("Loyalty"\)/);
  assert.match(runtime, /labels\.has\("Audit log"\)/);
  assert.match(runtime, /if \(!ownerActive && ownerNavigationSignaturePresent\(\)\)/);
  assert.match(runtime, /ownerActive = true;\s*logoutTriggered = false;\s*sync\(\);/s);
  assert.match(runtime, /new MutationObserver\(syncFromDom\)/);
});

test("Owner final header remains limited to four approved tabs", () => {
  const runtime = source("app/OwnerNavigationRuntime.js");
  assert.match(
    runtime,
    /new Set\(\["Dashboard", "Pelanggan", "Notifikasi", "Keluar"\]\)/,
  );
});
