import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { currentUser } from "./auth.mjs";

export const REALTIME_EVENT_TYPES = Object.freeze([
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "ORDER_CANCELLED",
  "PAYMENT_STATUS_CHANGED",
  "PAYMENT_PAID",
  "KITCHEN_ORDER_CREATED",
  "KITCHEN_ORDER_READY",
  "DRIVER_ASSIGNMENT_CHANGED",
  "DELIVERY_STATUS_CHANGED",
  "COD_STATUS_CHANGED",
  "SETTLEMENT_STATUS_CHANGED",
  "STOCK_CHANGED",
  "PRODUCT_OUT_OF_STOCK",
  "PRODUCT_LOW_STOCK",
  "PROMO_CHANGED",
  "LOYALTY_CHANGED",
  "STAFF_CHANGED",
  "PRINTER_STATUS_CHANGED",
  "NOTIFICATION_CREATED",
  "CONVERSATION_CHANGED",
]);

const VALID_TYPES = new Set(REALTIME_EVENT_TYPES);
const VALID_ROLES = new Set([
  "CUSTOMER",
  "ADMIN",
  "KITCHEN",
  "DRIVER",
  "MANAGER",
  "OWNER",
]);
const HUB_KEY = Symbol.for("warkost.realtime.operations.v1");

function hub() {
  if (!globalThis[HUB_KEY])
    globalThis[HUB_KEY] = { sequence: 0, subscriptions: new Map() };
  return globalThis[HUB_KEY];
}

function audienceMatches(audience, user) {
  return (
    audience.roles.includes(user.role) ||
    audience.userIds.includes(Number(user.id))
  );
}

function normalizedAudience(roles = [], userIds = []) {
  return {
    roles: [...new Set(roles.filter((role) => VALID_ROLES.has(role)))],
    userIds: [
      ...new Set(
        userIds
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ],
  };
}

export async function requireRealtimeUser(request) {
  const user = await currentUser(request);
  if (!user) throw new DomainError("Sesi realtime tidak valid", 401);
  return user;
}

export function subscribeRealtime(user, onEvent, onClose = () => {}) {
  if (!user?.id || !VALID_ROLES.has(user.role))
    throw new DomainError("Sesi realtime tidak valid", 401);
  if (typeof onEvent !== "function")
    throw new TypeError("Subscriber realtime wajib berupa fungsi");
  const state = hub();
  const key = ++state.sequence;
  state.subscriptions.set(key, {
    user: { id: Number(user.id), role: user.role },
    onEvent,
    onClose,
  });
  return () => state.subscriptions.delete(key);
}

export function publishRealtimeEvent(
  type,
  {
    roles = [],
    userIds = [],
    soundRoles = [],
    soundUserIds = [],
    payload = {},
    priority = "NORMAL",
    actionable = false,
    replayed = false,
  } = {},
) {
  if (!VALID_TYPES.has(type)) throw new TypeError(`Event realtime tidak dikenal: ${type}`);
  const audience = normalizedAudience(roles, userIds);
  const soundAudience = normalizedAudience(soundRoles, soundUserIds);
  if (!audience.roles.length && !audience.userIds.length) return null;
  const state = hub();
  const event = Object.freeze({
    id: `${Date.now().toString(36)}-${(++state.sequence).toString(36)}`,
    type,
    timestamp: new Date().toISOString(),
    priority: priority === "URGENT" ? "URGENT" : "NORMAL",
    actionable: Boolean(actionable),
    replayed: Boolean(replayed),
    audience,
    soundAudience,
    payload: payload && typeof payload === "object" ? payload : {},
  });
  for (const subscriber of state.subscriptions.values()) {
    if (!audienceMatches(audience, subscriber.user)) continue;
    try {
      subscriber.onEvent(
        Object.freeze({
          ...event,
          audible:
            Boolean(actionable) &&
            !replayed &&
            audienceMatches(soundAudience, subscriber.user),
        }),
      );
    } catch (error) {
      console.error("Realtime subscriber error", error);
    }
  }
  return event;
}

export function disconnectRealtimeUser(userId, reason = "session-ended") {
  const id = Number(userId);
  const state = hub();
  for (const [key, subscriber] of state.subscriptions) {
    if (subscriber.user.id !== id) continue;
    state.subscriptions.delete(key);
    try {
      subscriber.onClose(reason);
    } catch {}
  }
}

async function orderAudience(orderId) {
  if (!Number.isSafeInteger(Number(orderId)))
    return { userIds: [], customerId: null, driverId: null, order: null };
  const order = await store.get(
    `SELECT o.id,o.customer_id,o.status,p.status payment_status,p.method payment_method,d.driver_id
       FROM orders o
       LEFT JOIN payments p ON p.order_id=o.id
       LEFT JOIN deliveries d ON d.order_id=o.id
      WHERE o.id=?`,
    Number(orderId),
  );
  return {
    order,
    customerId: order?.customer_id ? Number(order.customer_id) : null,
    driverId: order?.driver_id ? Number(order.driver_id) : null,
    userIds: order
      ? [order.customer_id, order.driver_id].filter(Boolean).map(Number)
      : [],
  };
}

async function orderHasKitchenWork(orderId) {
  if (!Number.isSafeInteger(Number(orderId))) return false;
  return Boolean(
    await store.get(
      "SELECT 1 FROM order_items WHERE order_id=? AND prep_station='KITCHEN' LIMIT 1",
      Number(orderId),
    ),
  );
}

async function orderIdsAudience(orderIds) {
  const ids = [...new Set((orderIds || []).map(Number).filter(Number.isSafeInteger))];
  const userIds = [];
  for (const id of ids) {
    const audience = await orderAudience(id);
    userIds.push(...audience.userIds);
  }
  return { ids, userIds: [...new Set(userIds)] };
}

async function orderProductIds(orderId) {
  if (!Number.isSafeInteger(Number(orderId))) return [];
  return (
    await store.all("SELECT DISTINCT product_id FROM order_items WHERE order_id=?", Number(orderId))
  ).map((item) => Number(item.product_id));
}

async function publishStockEvents(productIds, { replayed = false } = {}) {
  const ids = [...new Set((productIds || []).map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) return;
  publishRealtimeEvent("STOCK_CHANGED", {
    roles: ["CUSTOMER", "ADMIN", "KITCHEN", "MANAGER", "OWNER"],
    payload: { productIds: ids },
    replayed,
  });
  for (const productId of ids) {
    const product = await store.get(
      `SELECT p.low_stock_threshold,
              p.stock_quantity-COALESCE((SELECT SUM(r.quantity)
                FROM stock_reservations r
               WHERE r.product_id=p.id AND r.status='RESERVED'
                 AND r.expires_at>CURRENT_TIMESTAMP),0) available_quantity
         FROM products p WHERE p.id=?`,
      productId,
    );
    if (!product) continue;
    const available = Number(product.available_quantity);
    const threshold = Number(product.low_stock_threshold);
    if (available <= 0)
      publishRealtimeEvent("PRODUCT_OUT_OF_STOCK", {
        roles: ["MANAGER", "OWNER"],
        soundRoles: ["MANAGER", "OWNER"],
        payload: { productId },
        priority: "URGENT",
        actionable: true,
        replayed,
      });
    else if (available <= threshold)
      publishRealtimeEvent("PRODUCT_LOW_STOCK", {
        roles: ["MANAGER", "OWNER"],
        soundRoles: ["MANAGER"],
        payload: { productId },
        actionable: true,
        replayed,
      });
  }
}

async function conversationAudience(conversationId) {
  if (!Number.isSafeInteger(Number(conversationId))) return [];
  const conversation = await store.get(
    "SELECT customer_id,driver_id,type FROM conversations WHERE id=?",
    Number(conversationId),
  );
  if (!conversation) return [];
  const adminIds =
    conversation.type === "CUSTOMER_ADMIN"
      ? (await store.all("SELECT id FROM users WHERE role='ADMIN' AND active=1")).map(
          (item) => Number(item.id),
        )
      : [];
  return [conversation.customer_id, conversation.driver_id, ...adminIds]
    .filter(Boolean)
    .map(Number);
}

export async function publishActionRealtime(action, user, body = {}, result = {}) {
  const replayed = Boolean(result?.replayed);
  const publishActionEvent = (type, options = {}) =>
    publishRealtimeEvent(type, { ...options, replayed });
  // `result.id` is deliberately not a generic order identifier. Several
  // mutations return another aggregate ID (for example a COD batch ID), and
  // treating it as an order ID can leak that unrelated order's audience.
  // Checkout is the only action whose documented result.id is the new order.
  const orderId = Number(
    body.orderId ||
      result?.order?.id ||
      result?.order_id ||
      (action === "checkout" ? result?.id : 0) ||
      0,
  );
  const { order, userIds, customerId, driverId } = await orderAudience(orderId);
  const orderPayload = order
    ? {
        orderId: Number(order.id),
        status: order.status,
        paymentStatus: order.payment_status,
      }
    : orderId
      ? { orderId }
      : {};

  if (action === "checkout") {
    publishActionEvent("ORDER_CREATED", {
      roles: ["ADMIN", "MANAGER", "OWNER"],
      userIds,
      soundRoles: ["ADMIN"],
      payload: orderPayload,
      actionable: true,
    });
    if (await orderHasKitchenWork(orderId))
      publishActionEvent("KITCHEN_ORDER_CREATED", {
        roles: ["KITCHEN"],
        soundRoles: ["KITCHEN"],
        payload: orderPayload,
        actionable: true,
      });
    await publishStockEvents(
      (body.items || []).map((item) => item.productId),
      { replayed },
    );
    return;
  }
  if (["status", "station-status", "accept", "claim-delivery"].includes(action)) {
    const status = String(order?.status || body.status || result?.status || "").toUpperCase();
    let type = status === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED";
    const hasKitchenWork = await orderHasKitchenWork(orderId);
    let roles = ["ADMIN", "MANAGER", "OWNER"];
    if (hasKitchenWork) roles.push("KITCHEN");
    const kitchenNeedsAttention = hasKitchenWork && status === "CONFIRMED";
    let actionable = status === "CANCELLED" || kitchenNeedsAttention;
    let soundRoles =
      hasKitchenWork && ["CONFIRMED", "CANCELLED"].includes(status)
        ? ["KITCHEN"]
        : [];
    let soundUserIds = customerId ? [customerId] : [];
    if (status === "READY") {
      type = "KITCHEN_ORDER_READY";
      roles = ["ADMIN", "DRIVER", "MANAGER", "OWNER"];
      actionable = true;
      soundRoles = ["DRIVER"];
    } else if (status === "ASSIGNED") {
      type = "DRIVER_ASSIGNMENT_CHANGED";
      roles = ["ADMIN", "MANAGER", "OWNER"];
      actionable = true;
      soundUserIds = [customerId, driverId].filter(Boolean);
    } else if (["PICKED_UP", "ON_DELIVERY", "DELIVERED"].includes(status)) {
      type = "DELIVERY_STATUS_CHANGED";
      roles = ["ADMIN", "MANAGER", "OWNER"];
      actionable = status === "DELIVERED";
    }
    publishActionEvent(type, {
      roles,
      userIds,
      soundRoles,
      soundUserIds,
      payload: { ...orderPayload, status },
      actionable,
    });
    if (status === "CANCELLED")
      await publishStockEvents(await orderProductIds(orderId), { replayed });
    return;
  }
  if (["claim-all-deliveries", "pickup-all-deliveries"].includes(action)) {
    const orderIds = result?.claimedOrderIds || result?.pickedUpOrderIds || [];
    const batchAudience = await orderIdsAudience(orderIds);
    publishActionEvent(
      action === "claim-all-deliveries" ? "DRIVER_ASSIGNMENT_CHANGED" : "DELIVERY_STATUS_CHANGED",
      {
        roles: ["ADMIN", "MANAGER", "OWNER"],
        userIds: [user?.id, ...batchAudience.userIds],
        soundUserIds: [user?.id],
        payload: { orderIds: batchAudience.ids },
        actionable: true,
      },
    );
    return;
  }
  if (action === "payment") {
    const paid = String(result?.status || order?.payment_status).toUpperCase() === "PAID";
    publishActionEvent(paid ? "PAYMENT_PAID" : "PAYMENT_STATUS_CHANGED", {
      roles: ["ADMIN", "MANAGER", "OWNER"],
      userIds,
      soundRoles: paid ? [] : ["ADMIN"],
      soundUserIds: customerId ? [customerId] : [],
      payload: orderPayload,
      actionable: true,
    });
    if (!paid)
      await publishStockEvents(await orderProductIds(orderId), { replayed });
    return;
  }
  if (action.startsWith("cod-") || action.includes("settlement")) {
    const batchAudience = await orderIdsAudience(
      result?.orders?.map((item) => item.order_id || item.id) || [],
    );
    const soundRoles = action === "manager-settlement-submit"
      ? ["OWNER"]
      : action === "admin-shift-settlement" || action === "shift-settlement"
        ? ["MANAGER"]
        : action === "cod-batch-submit"
          ? ["ADMIN"]
          : [];
    const settlementManagerId = Number(result?.settlement?.manager_id || 0);
    const soundUserIds = action === "manager-settlement-reject" && settlementManagerId
      ? [settlementManagerId]
      : action === "cod-batch-verify"
        ? batchAudience.userIds.filter((id) => Number(id) !== Number(customerId))
        : [];
    publishActionEvent(
      action.includes("batch") || action.includes("settlement")
        ? "SETTLEMENT_STATUS_CHANGED"
        : "COD_STATUS_CHANGED",
      {
        roles: ["ADMIN", "MANAGER", "OWNER"],
        userIds: [user?.id, ...userIds, ...batchAudience.userIds],
        soundRoles,
        soundUserIds,
        payload: {
          ...orderPayload,
          batchId: Number(body.batchId || result?.batch?.id || result?.id || 0) || null,
          orderIds: batchAudience.ids,
        },
        actionable: true,
      },
    );
    return;
  }
  if (action === "stock") {
    await publishStockEvents([body.productId], { replayed });
    return;
  }
  if (["product", "category", "subcategory"].includes(action)) {
    publishActionEvent("STOCK_CHANGED", {
      roles: ["CUSTOMER", "ADMIN", "KITCHEN", "MANAGER", "OWNER"],
      payload: { productId: Number(body.id) || null, catalogChanged: true },
    });
    return;
  }
  if (action === "promotion") {
    publishActionEvent("PROMO_CHANGED", {
      roles: ["CUSTOMER", "ADMIN", "MANAGER", "OWNER"],
      payload: { promotionId: Number(body.id) || null },
    });
    return;
  }
  if (["loyalty-reward", "voucher-claim"].includes(action)) {
    publishActionEvent("LOYALTY_CHANGED", {
      roles: ["OWNER"],
      userIds: user?.role === "CUSTOMER" ? [user.id] : [],
      payload: {},
    });
    return;
  }
  if (["driver", "staff", "staff-password", "driver-active", "customer-active"].includes(action)) {
    publishActionEvent("STAFF_CHANGED", {
      roles: ["MANAGER", "OWNER"],
      payload: { subjectId: Number(body.id) || null },
      actionable: action === "driver-active",
    });
    return;
  }
  if (["print-retry", "settings"].includes(action)) {
    publishActionEvent("PRINTER_STATUS_CHANGED", {
      roles: ["ADMIN", "KITCHEN", "OWNER"],
      payload: {},
      actionable: action === "print-retry",
    });
    return;
  }
  if (["chat-open", "chat-message", "chat-status"].includes(action)) {
    const conversationId = Number(
      body.conversationId || result?.conversation?.id || result?.id || 0,
    );
    publishActionEvent("CONVERSATION_CHANGED", {
      userIds: await conversationAudience(conversationId),
      payload: { conversationId },
      actionable: action === "chat-message",
    });
  }
}

export function resetRealtimeForTests() {
  globalThis[HUB_KEY] = { sequence: 0, subscriptions: new Map() };
}
