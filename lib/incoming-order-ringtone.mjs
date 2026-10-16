const STOP_ADMIN_STATUSES = new Set([
  "CONFIRMED",
  "PREPARING",
  "READY",
  "ASSIGNED",
  "PICKED_UP",
  "ON_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);

const STOP_KITCHEN_STATUSES = new Set([
  "PREPARING",
  "READY",
  "ASSIGNED",
  "PICKED_UP",
  "ON_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);

export function incomingOrderRingtoneAction(role, event) {
  const normalizedRole = String(role || "").toUpperCase();
  if (!["ADMIN", "KITCHEN"].includes(normalizedRole)) return null;
  if (!event || event.replayed) return null;

  const orderId = Number(event?.payload?.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return null;

  if (
    normalizedRole === "ADMIN" &&
    event.type === "ORDER_CREATED" &&
    event.audible === true
  ) {
    return { type: "START", orderId };
  }

  if (
    normalizedRole === "KITCHEN" &&
    event.type === "KITCHEN_ORDER_CREATED" &&
    event.audible === true
  ) {
    return { type: "START", orderId };
  }

  const status = String(event?.payload?.status || "").toUpperCase();
  if (
    normalizedRole === "ADMIN" &&
    ["ORDER_STATUS_CHANGED", "ORDER_CANCELLED"].includes(event.type) &&
    STOP_ADMIN_STATUSES.has(status)
  ) {
    return { type: "STOP", orderId };
  }

  if (
    normalizedRole === "KITCHEN" &&
    [
      "ORDER_STATUS_CHANGED",
      "ORDER_CANCELLED",
      "KITCHEN_ORDER_READY",
    ].includes(event.type) &&
    STOP_KITCHEN_STATUSES.has(status)
  ) {
    return { type: "STOP", orderId };
  }

  return null;
}
