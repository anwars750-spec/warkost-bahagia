import crypto from "node:crypto";
import webpush from "web-push";
import * as store from "./store.mjs";
import { pushConfiguration } from "./web-push-config.mjs";
const supported = new Set([
  "ORDER_CREATED",
  "KITCHEN_ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "KITCHEN_ORDER_READY",
  "DRIVER_ASSIGNMENT_CHANGED",
  "DELIVERY_STATUS_CHANGED",
  "PAYMENT_PAID",
]);
const stateKey = Symbol.for("warkost.push.work.v1");
const work = () =>
  (globalThis[stateKey] ||= { queue: [], active: 0, pending: new Set() });
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
function safeFailure() {
  console.warn("Web Push delivery unavailable");
}
// Existing post-commit dispatcher invokes this synchronously. Provider work is
// bounded/background and can never throw into a business transaction or SSE.
export function queuePushEvent(event) {
  try {
    if (
      !event ||
      event.replayed ||
      !supported.has(event.type) ||
      !pushConfiguration()
    )
      return;
    const state = work();
    if (state.queue.length >= 500) {
      safeFailure();
      return;
    }
    let resolve;
    const finished = new Promise((done) => (resolve = done));
    state.pending.add(finished);
    state.queue.push(async () => {
      try {
        await dispatchPushEvent(event);
      } catch {
        safeFailure();
      } finally {
        resolve();
        state.pending.delete(finished);
      }
    });
    pump();
  } catch {
    safeFailure();
  }
}
function pump() {
  const state = work();
  while (state.active < 4 && state.queue.length) {
    state.active++;
    const next = state.queue.shift();
    void next().finally(() => {
      state.active--;
      pump();
    });
  }
}
export async function drainPushWork() {
  while (work().pending.size) await Promise.all([...work().pending]);
}
export function pushPlans(event, order, hasKitchenWork = false) {
  const id = Number(order.id),
    status = String(event.payload?.status || order.status).toUpperCase();
  const plans = [];
  const add = (eventType, body, role, userId) =>
    plans.push({
      eventType,
      body,
      role,
      userId: userId ? Number(userId) : null,
      orderId: id,
    });
  if (event.type === "ORDER_CREATED") {
    add(
      "ORDER_RECEIVED",
      `Pesanan #${id} telah diterima sistem.`,
      "CUSTOMER",
      order.customer_id,
    );
    add("NEW_ORDER", `Ada pesanan baru #${id}.`, "ADMIN");
  }
  if (
    event.type === "PAYMENT_PAID" &&
    order.payment_method === "QRIS" &&
    order.payment_status === "PAID"
  ) {
    add(
      "QRIS_PAID",
      `Pembayaran QRIS pesanan #${id} berhasil.`,
      "CUSTOMER",
      order.customer_id,
    );
    add("QRIS_PAID", `QRIS pesanan #${id} sudah lunas.`, "ADMIN");
  }
  if (
    [
      "ORDER_STATUS_CHANGED",
      "KITCHEN_ORDER_READY",
      "DELIVERY_STATUS_CHANGED",
    ].includes(event.type)
  ) {
    const messages = {
      CONFIRMED: "dikonfirmasi",
      PREPARING: "mulai diproses",
      DELIVERED: "selesai",
    };
    if (messages[status])
      add(
        `ORDER_${status}`,
        `Pesanan #${id} ${messages[status]}.`,
        "CUSTOMER",
        order.customer_id,
      );
    if (status === "READY" && order.fulfillment_type === "PICKUP")
      add(
        "PICKUP_READY",
        `Pesanan #${id} siap diambil.`,
        "CUSTOMER",
        order.customer_id,
      );
    if (
      ["PICKED_UP", "ON_DELIVERY"].includes(status) &&
      order.fulfillment_type !== "PICKUP"
    )
      add(
        "DELIVERY_STARTED",
        `Driver mulai mengantar pesanan #${id}.`,
        "CUSTOMER",
        order.customer_id,
      );
    if (status === "READY" && order.fulfillment_type !== "PICKUP")
      add(
        "DELIVERY_AVAILABLE",
        `Pesanan #${id} siap diambil untuk diantar.`,
        "DRIVER",
        order.driver_id,
      );
  }
  if (
    event.type === "DRIVER_ASSIGNMENT_CHANGED" &&
    order.driver_id &&
    ["ASSIGNED", "READY"].includes(status)
  )
    add(
      "DELIVERY_ASSIGNED",
      `Pengantaran pesanan #${id} ditugaskan kepada Anda.`,
      "DRIVER",
      order.driver_id,
    );
  if (
    hasKitchenWork &&
    status === "CONFIRMED" &&
    ["KITCHEN_ORDER_CREATED", "ORDER_STATUS_CHANGED"].includes(event.type)
  )
    add(
      "KITCHEN_ACTIONABLE",
      `Pesanan #${id} perlu diproses Kitchen.`,
      "KITCHEN",
    );
  return plans;
}
export async function dispatchPushEvent(
  event,
  { send = webpush.sendNotification.bind(webpush) } = {},
) {
  const config = pushConfiguration();
  if (!config || event.replayed || !supported.has(event.type)) return;
  const ids = [
    ...new Set(
      [event.payload?.orderId, ...(event.payload?.orderIds || [])]
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
  for (const orderId of ids) {
    const order = await store.get(
      `SELECT o.id,o.customer_id,o.status,o.fulfillment_type,d.driver_id,p.method payment_method,p.status payment_status FROM orders o LEFT JOIN payments p ON p.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id WHERE o.id=?`,
      orderId,
    );
    if (!order) continue;
    const kitchen = Boolean(
      await store.get(
        "SELECT 1 FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND (oi.prep_station='KITCHEN' OR p.prep_station='KITCHEN') LIMIT 1",
        orderId,
      ),
    );
    for (const plan of pushPlans(event, order, kitchen)) {
      // A targeted Customer/assignment must never fall back to a role broadcast.
      if (plan.role === "CUSTOMER" && !plan.userId) continue;
      const subscriptions = await store.all(
        `SELECT s.* FROM push_subscriptions s JOIN users u ON u.id=s.user_id JOIN sessions sess ON sess.token_hash=s.session_token_hash AND sess.user_id=s.user_id WHERE s.disabled_at IS NULL AND u.active=1 AND u.role=s.role AND u.role=? AND sess.revoked_at IS NULL AND sess.expires_at>?${plan.userId ? " AND s.user_id=?" : ""}`,
        plan.role,
        Date.now(),
        ...(plan.userId ? [plan.userId] : []),
      );
      for (const subscription of subscriptions) {
        const key = digest(`${subscription.id}:${plan.eventType}:${orderId}`);
        const claimed = await store.run(
          "INSERT OR IGNORE INTO push_deliveries(delivery_key,subscription_id) VALUES(?,?)",
          key,
          subscription.id,
        );
        if (!claimed.changes) continue;
        const payload = JSON.stringify({
          title: "Warkost Bahagia",
          body: plan.body,
          eventType: plan.eventType,
          orderId,
          url: `/?pushOrder=${orderId}`,
          deliveryKey: key,
        });
        try {
          await send(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            {
              vapidDetails: {
                subject: config.subject,
                publicKey: config.publicKey,
                privateKey: config.privateKey,
              },
              TTL: 300,
              timeout: 5000,
              urgency: "normal",
            },
          );
          await store.run(
            "UPDATE push_subscriptions SET last_success_at=CURRENT_TIMESTAMP,failure_count=0 WHERE id=? AND generation=?",
            subscription.id,
            subscription.generation,
          );
          await store.run(
            "UPDATE push_deliveries SET status='SENT' WHERE delivery_key=?",
            key,
          );
        } catch (error) {
          if ([404, 410].includes(Number(error?.statusCode)))
            await store.run(
              "UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,failure_count=failure_count+1 WHERE id=? AND generation=?",
              subscription.id,
              subscription.generation,
            );
          else
            await store.run(
              "UPDATE push_subscriptions SET failure_count=failure_count+1 WHERE id=? AND generation=?",
              subscription.id,
              subscription.generation,
            );
          await store.run(
            "UPDATE push_deliveries SET status='FAILED' WHERE delivery_key=?",
            key,
          );
          // Status code only; provider errors can contain endpoint/key material.
          console.warn("Web Push provider rejected delivery", {
            status: [
              400, 401, 403, 404, 410, 413, 429, 500, 502, 503, 504,
            ].includes(Number(error?.statusCode))
              ? Number(error.statusCode)
              : 0,
          });
        }
      }
    }
  }
}
