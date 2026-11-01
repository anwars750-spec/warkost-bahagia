import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import webpush from "web-push";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "push-test-")),
  "data.db",
);
process.env.SESSION_SECRET = "push-fixture-session-secret-more-than-32-bytes";
process.env.PAYMENT_PROVIDER_MODE = "simulation";
process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED = "true";
process.env.WARKOST_TEST_STORE_NOW_MS = String(
  Date.parse("2026-10-23T05:00:00Z"),
);
const vapid = webpush.generateVAPIDKeys();
Object.assign(process.env, {
  WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
  WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
  WEB_PUSH_CONTACT: "mailto:push@example.test",
});
const store = await import("../lib/store.mjs");
const { db } = await import("../lib/db.mjs");
const { issueSession, revokeSession } = await import("../lib/auth.mjs");
const { getPush, postPush } = await import("../lib/push-api.mjs");
const {
  savePushSubscription,
  removePushSubscription,
  validatePushSubscription,
} = await import("../lib/push-subscriptions.mjs");
const { dispatchPushEvent, drainPushWork, pushPlans } =
  await import("../lib/push-dispatcher.mjs");
const { publishActionRealtime, subscribeRealtime } =
  await import("../lib/realtime.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const { processTrustedProviderEvent } = await import("../lib/payments.mjs");
const { LOCAL_QRIS_PROVIDER } = await import("../lib/payment-provider.mjs");
const users = {},
  tokens = {};
for (const [i, role] of [
  "CUSTOMER",
  "ADMIN",
  "KITCHEN",
  "DRIVER",
  "MANAGER",
  "OWNER",
  "CUSTOMER",
].entries()) {
  const id = i + 1;
  await store.run(
    "INSERT INTO users(id,name,email,password_hash,role,active) VALUES(?,?,?,?,?,1)",
    id,
    "Fixture",
    `push-${id}@example.test`,
    "x",
    role,
  );
  users[id] = { id, role };
  tokens[id] = await issueSession(users[id]);
}
await store.run("INSERT INTO categories(id,name) VALUES(1,'Push Fixture')");
await store.run(
  "INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station) VALUES(1,1,'Food',18000,100,'KITCHEN')",
);
await store.run(
  "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,1,'Fixture','Alamat fixture',0,0)",
);
for (const [key, value] of Object.entries({
  business_latitude: "0",
  business_longitude: "0",
  delivery_free_km: "3",
  delivery_fee_per_km: "2500",
  delivery_max_km: "10",
  payment_expiry_minutes: "12",
  printer_simulation: "true",
}))
  await store.run(
    "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value",
    key,
    value,
  );
let sequence = 0;
function subscription() {
  const key = crypto.createECDH("prime256v1");
  key.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/fixture-${++sequence}`,
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    },
  };
}
function request(userId, body, headers = {}, query = "") {
  const request = new Request("https://warkost.test/api/push" + query, {
    method: body ? "POST" : "GET",
    headers: {
      Host: "warkost.test",
      Origin: "https://warkost.test",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  request.cookies = {
    get: () => (tokens[userId] ? { value: tokens[userId] } : undefined),
  };
  return request;
}
const originalSend = webpush.sendNotification;
const sends = [];
webpush.sendNotification = async (sub, payload) => {
  sends.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
};
test.after(async () => {
  await drainPushWork();
  webpush.sendNotification = originalSend;
  await store.close();
});
async function created() {
  return createOrder(users[1], {
    addressId: 1,
    fulfillmentType: "DELIVERY",
    method: "QRIS",
    items: [{ productId: 1, quantity: 1 }],
  });
}
async function clear() {
  await drainPushWork();
  await store.run("DELETE FROM push_deliveries");
  await store.run("DELETE FROM push_subscriptions");
  sends.length = 0;
}
async function enrolled(ids = [1, 2, 3, 4]) {
  const result = {};
  for (const id of ids) {
    result[id] = subscription();
    await savePushSubscription(users[id], result[id], tokens[id]);
  }
  return result;
}

test("unauthenticated API denied; authenticated subscription ignores body user_id; duplicate endpoint stays unique", async () => {
  await clear();
  const sub = subscription();
  assert.equal(
    (await postPush(request(0, { action: "subscribe", subscription: sub })))
      .status,
    401,
  );
  assert.equal((await getPush(request(0))).status, 401);
  const config = await (await getPush(request(1))).json();
  assert.equal(config.enabled, true);
  assert.equal(Object.keys(config).includes("privateKey"), false);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await postPush(
          request(1, { action: "subscribe", user_id: 7, subscription: sub }),
        )
      ).status,
      200,
    );
  const canonicalVariant = {
    ...sub,
    endpoint: sub.endpoint.replace(
      "https://fcm.googleapis.com/",
      "https://FCM.GOOGLEAPIS.COM:443/",
    ),
  };
  assert.equal(
    (
      await postPush(
        request(1, { action: "subscribe", subscription: canonicalVariant }),
      )
    ).status,
    200,
  );
  const row = await store.get("SELECT user_id FROM push_subscriptions");
  assert.equal(row.user_id, 1);
  assert.equal(
    (await store.get("SELECT COUNT(*) n FROM push_subscriptions")).n,
    1,
  );
  assert.equal(
    (await postPush(request(7, { action: "subscribe", subscription: sub })))
      .status,
    409,
  );
  assert.equal(
    (
      await postPush(
        request(5, { action: "subscribe", subscription: subscription() }),
      )
    ).status,
    403,
  );
});
test("CSRF, unsafe endpoint, malformed keys and unsupported role are denied", async () => {
  const sub = subscription();
  assert.equal(
    (
      await postPush(
        request(
          1,
          { action: "subscribe", subscription: sub },
          { Origin: "https://evil.test" },
        ),
      )
    ).status,
    403,
  );
  for (const endpoint of [
    "https://127.0.0.1/",
    "http://fcm.googleapis.com/a",
    "https://fcm.googleapis.com.evil.test/a",
    "https://fcm.googleapis.com:8443/a",
    "https://user:pass@fcm.googleapis.com/a",
  ]) {
    assert.throws(() => validatePushSubscription({ ...sub, endpoint }));
  }
  assert.throws(() =>
    validatePushSubscription({ ...sub, keys: { p256dh: "x", auth: "x" } }),
  );
  assert.equal((await (await getPush(request(6))).json()).enabled, false);
});
test("unsubscribe is idempotent and cannot revoke another account's endpoint", async () => {
  await clear();
  const sub = subscription();
  await savePushSubscription(users[1], sub, tokens[1]);
  await removePushSubscription(users[7], sub.endpoint);
  assert.equal(
    (await store.get("SELECT disabled_at FROM push_subscriptions")).disabled_at,
    null,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await postPush(
          request(1, { action: "unsubscribe", endpoint: sub.endpoint }),
        )
      ).status,
      200,
    );
  assert.notEqual(
    (await store.get("SELECT disabled_at FROM push_subscriptions")).disabled_at,
    null,
  );
});
test("Customer order creation invokes push through existing dispatcher; replay and repeated publication deduplicate", async () => {
  await clear();
  const subs = await enrolled([1, 2, 3, 7]);
  const order = await created();
  const foreground = [];
  const stop = subscribeRealtime(users[1], (event) => foreground.push(event));
  await publishActionRealtime(
    "checkout",
    users[1],
    { items: [{ productId: 1 }] },
    order,
  );
  await drainPushWork();
  assert.equal(sends.length, 2);
  assert.equal(
    sends.some((s) => s.endpoint === subs[7].endpoint),
    false,
  );
  assert.equal(
    sends.some((s) => s.payload.eventType === "ORDER_RECEIVED"),
    true,
  );
  assert.equal(
    foreground.some((e) => e.type === "ORDER_CREATED"),
    true,
  );
  await publishActionRealtime("checkout", users[1], {}, order);
  await publishActionRealtime(
    "checkout",
    users[1],
    {},
    { ...order, replayed: true },
  );
  await drainPushWork();
  assert.equal(sends.length, 2);
  const other = await created();
  await store.run(
    "UPDATE orders SET customer_id=7,status='CONFIRMED' WHERE id=?",
    other.id,
  );
  await publishActionRealtime(
    "checkout",
    users[1],
    { orderId: other.id },
    order,
  );
  await drainPushWork();
  assert.equal(sends.length, 2);
  assert.equal(
    sends.some((item) => item.payload.orderId === other.id),
    false,
  );
  stop();
  const payload = sends[0].payload;
  assert.deepEqual(
    Object.keys(payload).sort(),
    ["title", "body", "eventType", "orderId", "url", "deliveryKey"].sort(),
  );
  const allowed = await (
    await getPush(request(1, null, {}, "?delivery=" + payload.deliveryKey))
  ).json();
  assert.equal(allowed.allowed, true);
  assert.equal(
    (
      await (
        await getPush(request(7, null, {}, "?delivery=" + payload.deliveryKey))
      ).json()
    ).allowed,
    false,
  );
});
test("QRIS PAID dispatches only after authoritative payment commit and remains successful when provider fails", async () => {
  await clear();
  await enrolled([1, 2, 3]);
  const order = await created();
  const result = await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: `push-paid-${order.id}`,
    transactionReference: order.payment.transaction_reference,
    providerReference: order.payment.provider_reference,
    status: "PAID",
    payloadHash: "fixture",
  });
  webpush.sendNotification = async () => {
    throw { statusCode: 503, endpoint: "must-not-log", body: "private" };
  };
  await publishActionRealtime(
    "payment",
    null,
    { orderId: order.id },
    { status: "PAID", replayed: result.replayed },
  );
  await drainPushWork();
  assert.equal(
    (await store.get("SELECT status FROM payments WHERE order_id=?", order.id))
      .status,
    "PAID",
  );
  assert.equal(
    (
      await store.get(
        "SELECT COUNT(*) n FROM push_deliveries WHERE status='FAILED'",
      )
    ).n,
    2,
  );
  webpush.sendNotification = async (sub, payload) =>
    sends.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
});
test("Kitchen only receives actionable confirmed food work, never unpaid checkout or minor changes", async () => {
  await clear();
  const subs = await enrolled();
  const order = await created();
  await publishActionRealtime("checkout", users[1], {}, order);
  await drainPushWork();
  assert.equal(
    sends.some((s) => s.endpoint === subs[3].endpoint),
    false,
  );
  await store.run("UPDATE orders SET status='CONFIRMED' WHERE id=?", order.id);
  await publishActionRealtime(
    "status",
    users[2],
    { orderId: order.id, status: "CONFIRMED" },
    {},
  );
  await drainPushWork();
  assert.equal(sends.filter((s) => s.endpoint === subs[3].endpoint).length, 1);
  await publishActionRealtime(
    "station-status",
    users[3],
    { orderId: order.id, status: "IN_PROGRESS" },
    {},
  );
  await drainPushWork();
  assert.equal(sends.filter((s) => s.endpoint === subs[3].endpoint).length, 1);
});
test("Driver actionable availability and assignment are scoped; Customer delivery states are deduplicated", async () => {
  await clear();
  const subs = await enrolled();
  const order = await created();
  await store.run("UPDATE orders SET status='READY' WHERE id=?", order.id);
  await publishActionRealtime("status", users[2], { orderId: order.id }, {});
  await drainPushWork();
  assert.equal(sends.filter((s) => s.endpoint === subs[4].endpoint).length, 1);
  await store.run("UPDATE orders SET status='ASSIGNED' WHERE id=?", order.id);
  await store.run(
    "INSERT INTO deliveries(order_id,driver_id) VALUES(?,?)",
    order.id,
    4,
  );
  await publishActionRealtime(
    "claim-delivery",
    users[4],
    { orderId: order.id },
    {},
  );
  await drainPushWork();
  assert.equal(
    sends.filter((s) => s.payload.eventType === "DELIVERY_ASSIGNED").length,
    1,
  );
  for (const status of ["PICKED_UP", "ON_DELIVERY"]) {
    await store.run("UPDATE orders SET status=? WHERE id=?", status, order.id);
    await publishActionRealtime("status", users[4], { orderId: order.id }, {});
  }
  await drainPushWork();
  assert.equal(
    sends.filter((s) => s.payload.eventType === "DELIVERY_STARTED").length,
    1,
  );
});
test("expired provider subscription disabled; transient failure cannot break already-created order", async () => {
  await clear();
  await enrolled([1]);
  const order = await created();
  await dispatchPushEvent(
    { type: "ORDER_CREATED", payload: { orderId: order.id } },
    {
      send: async () => {
        throw { statusCode: 410 };
      },
    },
  );
  assert.notEqual(
    (await store.get("SELECT disabled_at FROM push_subscriptions")).disabled_at,
    null,
  );
  assert.equal(
    (await store.get("SELECT COUNT(*) n FROM orders WHERE id=?", order.id)).n,
    1,
  );
});
test("revoked, expired and inactive sessions never receive push; Manager/Owner remain deferred", async () => {
  await clear();
  await enrolled([1, 2, 3, 4]);
  await store.run(
    "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=1",
  );
  await store.run("UPDATE sessions SET expires_at=0 WHERE user_id=2");
  await store.run("UPDATE users SET active=0 WHERE id=3");
  await store.run("UPDATE users SET role='MANAGER' WHERE id=4");
  const order = await created();
  await dispatchPushEvent({
    type: "ORDER_CREATED",
    payload: { orderId: order.id },
  });
  assert.equal(sends.length, 0);
});
test("Customer full lifecycle and pickup readiness plan only operational payloads", () => {
  const order = {
    id: 42,
    customer_id: 1,
    status: "READY",
    fulfillment_type: "PICKUP",
  };
  const plans = pushPlans(
    { type: "ORDER_STATUS_CHANGED", payload: { status: "READY" } },
    order,
    true,
  );
  assert.equal(
    plans.some((p) => p.eventType === "PICKUP_READY"),
    true,
  );
  assert.equal(
    plans.some((p) => p.role === "DRIVER"),
    false,
  );
  for (const status of ["CONFIRMED", "PREPARING", "DELIVERED"]) {
    assert.equal(
      pushPlans(
        { type: "ORDER_STATUS_CHANGED", payload: { status } },
        order,
        true,
      ).some((p) => p.eventType === `ORDER_${status}`),
      true,
    );
  }
});
