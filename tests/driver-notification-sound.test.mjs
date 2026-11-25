import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  resolveRealtimeSoundEnabled,
  shouldPlayRealtimeSound,
  shouldRenderRealtimeControls,
  usesAutomaticRealtimeSound,
} from "../lib/realtime-client.mjs";

const runtimePath = path.resolve(process.cwd(), "app/RealtimeOperationsRuntime.js");
const runtime = fs.readFileSync(runtimePath, "utf8");

test("Driver memakai sonic asset khusus satu kali tanpa mengubah audio role lain", () => {
  const driverAsset = path.resolve(
    process.cwd(),
    "public/sounds/driver-order-ready-v1.wav",
  );

  assert.equal(fs.existsSync(driverAsset), true);
  assert.ok(fs.statSync(driverAsset).size > 0);
  assert.match(
    runtime,
    /const DRIVER_NOTIFICATION_SOUND = "\/sounds\/driver-order-ready-v1\.wav";/,
  );
  assert.match(runtime, /const audio = new Audio\(DRIVER_NOTIFICATION_SOUND\);/);
  assert.match(runtime, /if \(user\?\.role === "DRIVER"\) primeDriverAudio\(\);/);
  assert.match(
    runtime,
    /if \(user\?\.role === "DRIVER"\) \{[\s\S]*?audio\.loop = false;[\s\S]*?audio\.play\(\)/,
  );

  assert.match(runtime, /customer-order-update-v2\.mp3/);
  assert.match(runtime, /new Audio\(CUSTOMER_NOTIFICATION_SOUND\)/);
  assert.match(runtime, /incoming-order-admin-kitchen-v2\.mp3/);
  assert.match(runtime, /new Audio\(INCOMING_ORDER_RINGTONE\)/);
  assert.match(runtime, /audio\.loop = true;/);
});

test("policy replay dan deduplikasi suara realtime tidak berubah", () => {
  const seen = new Set();
  const event = {
    id: "driver-ready-1",
    actionable: true,
    audible: true,
    replayed: false,
  };

  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: true, enabled: true, seen }),
    true,
  );
  seen.add(event.id);
  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: true, enabled: true, seen }),
    false,
  );
  assert.equal(
    shouldPlayRealtimeSound({
      event: { ...event, id: "driver-ready-replayed", replayed: true },
      unlocked: true,
      enabled: true,
      seen,
    }),
    false,
  );
});

test("kontrol realtime disembunyikan hanya untuk Customer dan Driver", () => {
  assert.equal(shouldRenderRealtimeControls("CUSTOMER"), false);
  assert.equal(shouldRenderRealtimeControls("DRIVER"), false);

  for (const role of ["ADMIN", "KITCHEN", "MANAGER", "OWNER"])
    assert.equal(shouldRenderRealtimeControls(role), true, role);

  assert.match(
    runtime,
    /if \(!user \|\| !shouldRenderRealtimeControls\(user\.role\)\) return null;/,
  );
});

test("suara Customer dan Driver otomatis aktif tanpa mengubah preferensi role lain", () => {
  const disabledStorage = { getItem: () => "off" };

  assert.equal(usesAutomaticRealtimeSound("CUSTOMER"), true);
  assert.equal(usesAutomaticRealtimeSound("DRIVER"), true);
  assert.equal(resolveRealtimeSoundEnabled("CUSTOMER", disabledStorage), true);
  assert.equal(resolveRealtimeSoundEnabled("DRIVER", disabledStorage), true);

  for (const role of ["ADMIN", "KITCHEN", "MANAGER", "OWNER"])
    assert.equal(resolveRealtimeSoundEnabled(role, disabledStorage), false, role);

  assert.match(runtime, /resolveRealtimeSoundEnabled\(user\.role, window\.localStorage\)/);
  assert.match(runtime, /if \(user\?\.role === "CUSTOMER"\) primeCustomerAudio\(\);/);
  assert.match(runtime, /if \(user\?\.role === "DRIVER"\) primeDriverAudio\(\);/);
});
