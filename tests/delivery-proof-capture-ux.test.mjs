import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("Driver proof menyediakan jalur kamera dan lampiran terpisah", () => {
  const runtime = read("app/DriverDeliveryProofRuntime.js");
  assert.match(runtime, /cameraInputRef/);
  assert.match(runtime, /attachmentInputRef/);
  assert.match(runtime, /capture="environment"/);
  assert.match(runtime, />Ambil Foto</);
  assert.match(runtime, />Lampirkan Foto</);
  assert.match(runtime, /cameraInputRef\.current\?\.click\(\)/);
  assert.match(runtime, /attachmentInputRef\.current\?\.click\(\)/);
});
