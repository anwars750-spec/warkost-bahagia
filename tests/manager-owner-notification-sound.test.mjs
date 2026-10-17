import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { shouldPlayRealtimeSound } from "../lib/realtime-client.mjs";

const runtime = fs.readFileSync(
  path.resolve(process.cwd(), "app/RealtimeOperationsRuntime.js"),
  "utf8",
);

test("Manager dan Owner memakai WAV khusus tanpa mengubah audio role lain", () => {
  const asset = path.resolve(
    process.cwd(),
    "public/sounds/manager-owner-notification-v1.wav",
  );

  assert.equal(fs.existsSync(asset), true);
  assert.ok(fs.statSync(asset).size > 0);
  assert.match(
    runtime,
    /const MANAGER_OWNER_NOTIFICATION_SOUND =\s*"\/sounds\/manager-owner-notification-v1\.wav";/,
  );
  assert.match(
    runtime,
    /const audio = new Audio\(MANAGER_OWNER_NOTIFICATION_SOUND\);/,
  );
  assert.match(
    runtime,
    /if \(\["MANAGER", "OWNER"\]\.includes\(user\?\.role\)\)\s*primeManagerOwnerAudio\(\);/,
  );
  assert.match(
    runtime,
    /if \(\["MANAGER", "OWNER"\]\.includes\(user\?\.role\)\) \{[\s\S]*?audio\.currentTime = 0;[\s\S]*?audio\.loop = false;[\s\S]*?audio\.play\(\)/,
  );

  assert.match(runtime, /customer-order-update-v2\.mp3/);
  assert.match(runtime, /driver-order-ready-v1\.wav/);
  assert.match(runtime, /incoming-order-admin-kitchen-v2\.mp3/);
  assert.match(runtime, /new Audio\(INCOMING_ORDER_RINGTONE\)/);
});

test("Manager dan Owner tetap mengikuti enabled, replay, dan dedup policy", () => {
  const seen = new Set();
  const event = {
    id: "manager-owner-action-1",
    actionable: true,
    audible: true,
    replayed: false,
  };

  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: true, enabled: false, seen }),
    false,
  );
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
      event: { ...event, id: "manager-owner-replayed", replayed: true },
      unlocked: true,
      enabled: true,
      seen,
    }),
    false,
  );
});
