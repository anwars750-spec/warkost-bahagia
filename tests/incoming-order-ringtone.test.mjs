import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { incomingOrderRingtoneAction } from "../lib/incoming-order-ringtone.mjs";

test("incoming order ringtone mulai dan berhenti sesuai role tanpa replay", () => {
  const adminStart = {
    type: "ORDER_CREATED",
    audible: true,
    replayed: false,
    payload: { orderId: 101, status: "PENDING" },
  };
  const kitchenStart = {
    type: "KITCHEN_ORDER_CREATED",
    audible: true,
    replayed: false,
    payload: { orderId: 101, status: "PENDING" },
  };

  assert.deepEqual(incomingOrderRingtoneAction("ADMIN", adminStart), {
    type: "START",
    orderId: 101,
  });
  assert.deepEqual(incomingOrderRingtoneAction("KITCHEN", kitchenStart), {
    type: "START",
    orderId: 101,
  });

  assert.deepEqual(
    incomingOrderRingtoneAction("ADMIN", {
      type: "ORDER_STATUS_CHANGED",
      replayed: false,
      payload: { orderId: 101, status: "CONFIRMED" },
    }),
    { type: "STOP", orderId: 101 },
  );

  assert.deepEqual(
    incomingOrderRingtoneAction("KITCHEN", {
      type: "ORDER_STATUS_CHANGED",
      audible: true,
      replayed: false,
      payload: { orderId: 101, status: "CONFIRMED" },
    }),
    { type: "START", orderId: 101 },
  );

  assert.equal(
    incomingOrderRingtoneAction("KITCHEN", {
      type: "ORDER_STATUS_CHANGED",
      audible: false,
      replayed: false,
      payload: { orderId: 101, status: "CONFIRMED" },
    }),
    null,
  );

  assert.deepEqual(
    incomingOrderRingtoneAction("KITCHEN", {
      type: "ORDER_STATUS_CHANGED",
      replayed: false,
      payload: { orderId: 101, status: "PREPARING" },
    }),
    { type: "STOP", orderId: 101 },
  );

  assert.equal(
    incomingOrderRingtoneAction("ADMIN", { ...adminStart, replayed: true }),
    null,
  );
  assert.equal(
    incomingOrderRingtoneAction("KITCHEN", { ...kitchenStart, audible: false }),
    null,
  );

  const runtime = fs.readFileSync(
    path.resolve(process.cwd(), "app/RealtimeOperationsRuntime.js"),
    "utf8",
  );
  assert.match(runtime, /incoming-order-admin-kitchen-v1\.mp3/);
  assert.match(runtime, /incomingOrderAudioRef/);
  assert.match(runtime, /pendingIncomingOrdersRef/);
  assert.match(runtime, /incomingOrderMediaReady/);
  assert.match(runtime, /Aktifkan Suara Pesanan/);
  assert.match(runtime, /Suara Pesanan Aktif/);
});
