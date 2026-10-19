import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { incomingOrderRingtoneAction } from "../lib/incoming-order-ringtone.mjs";

const event = (type, paymentStatus, overrides = {}) => ({
  type,
  actionable: true,
  audible: true,
  replayed: false,
  payload: { orderId: 77, status: "PENDING", paymentStatus },
  ...overrides,
});

test("Admin tidak berdering untuk ORDER_CREATED QRIS PENDING", () => {
  assert.equal(
    incomingOrderRingtoneAction("ADMIN", event("ORDER_CREATED", "PENDING")),
    null,
  );
});

test("Admin tetap berdering untuk ORDER_CREATED COD/UNPAID", () => {
  assert.deepEqual(
    incomingOrderRingtoneAction("ADMIN", event("ORDER_CREATED", "UNPAID")),
    { type: "START", orderId: 77 },
  );
});

test("Admin mulai berdering ketika QRIS berubah menjadi PAID", () => {
  assert.deepEqual(
    incomingOrderRingtoneAction(
      "ADMIN",
      event("PAYMENT_PAID", "PAID", { audible: false }),
    ),
    { type: "START", orderId: 77 },
  );
});

test("Replay tidak pernah memulai ringtone", () => {
  assert.equal(
    incomingOrderRingtoneAction(
      "ADMIN",
      event("PAYMENT_PAID", "PAID", { audible: false, replayed: true }),
    ),
    null,
  );
});

test("Checkout route menandai QRIS belum PAID sebagai realtime replayed/non-audible", () => {
  const route = fs.readFileSync(
    fileURLToPath(new URL("../app/api/checkout/route.js", import.meta.url)),
    "utf8",
  );
  assert.match(route, /result\?\.payment\?\.method === "QRIS"/);
  assert.match(route, /result\?\.payment\?\.status !== "PAID"/);
  assert.match(route, /unpaidQris \? \{ \.\.\.result, replayed: true \} : result/);
});
