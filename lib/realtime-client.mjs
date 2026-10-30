export const REALTIME_REFRESH_GROUPS = Object.freeze({
  ORDER_CREATED: ["orders", "notifications", "dashboard"],
  ORDER_STATUS_CHANGED: ["orders", "notifications", "dashboard"],
  ORDER_CANCELLED: ["orders", "notifications", "dashboard"],
  PAYMENT_STATUS_CHANGED: ["orders", "notifications", "dashboard"],
  PAYMENT_PAID: ["orders", "notifications", "account", "dashboard"],
  KITCHEN_ORDER_CREATED: ["orders", "notifications"],
  KITCHEN_ORDER_READY: ["orders", "notifications", "dashboard"],
  DRIVER_ASSIGNMENT_CHANGED: ["orders", "notifications", "dashboard"],
  DELIVERY_STATUS_CHANGED: ["orders", "notifications", "account", "dashboard"],
  COD_STATUS_CHANGED: ["orders", "notifications", "dashboard"],
  SETTLEMENT_STATUS_CHANGED: ["orders", "notifications", "dashboard"],
  STOCK_CHANGED: ["catalog", "stock", "dashboard"],
  PRODUCT_OUT_OF_STOCK: ["catalog", "stock", "notifications", "dashboard"],
  PRODUCT_LOW_STOCK: ["stock", "notifications", "dashboard"],
  PROMO_CHANGED: ["catalog", "promotions", "notifications"],
  LOYALTY_CHANGED: ["account", "notifications", "dashboard"],
  STAFF_CHANGED: ["staff", "dashboard", "notifications"],
  PRINTER_STATUS_CHANGED: ["printer", "notifications", "dashboard"],
  NOTIFICATION_CREATED: ["notifications"],
  CONVERSATION_CHANGED: ["conversations", "notifications"],
  STORE_STATUS_CHANGED: ["store-status"],
});

export function refreshGroupsForEvent(type) {
  return REALTIME_REFRESH_GROUPS[type] || [];
}

const REALTIME_RECOVERY_GROUPS = Object.freeze({
  CUSTOMER: ["orders", "notifications", "account", "catalog", "store-status"],
  ADMIN: [
    "orders",
    "notifications",
    "dashboard",
    "stock",
    "printer",
    "store-status",
  ],
  KITCHEN: ["orders", "notifications", "stock", "printer", "store-status"],
  DRIVER: ["notifications", "store-status"],
  MANAGER: ["notifications", "catalog", "stock", "promotions", "store-status"],
  OWNER: ["notifications", "promotions", "store-status"],
});

export function recoveryRefreshGroupsForRole(role) {
  return REALTIME_RECOVERY_GROUPS[role] || [];
}

export function isRealtimeRecoveryConnection({
  connectedBefore,
  recoveryPending,
} = {}) {
  return Boolean(connectedBefore && recoveryPending);
}

export function nextRealtimeBackoff(attempt, random = Math.random()) {
  const exponent = Math.min(Math.max(Number(attempt) || 0, 0), 5);
  return Math.min(1000 * 2 ** exponent + Math.floor(random * 400), 30000);
}

export function rememberRealtimeId(seen, id, limit = 500) {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  while (seen.size > limit) seen.delete(seen.values().next().value);
  return true;
}

export function readSoundPreference(storage) {
  try {
    return storage?.getItem("warkost-realtime-sound") !== "off";
  } catch {
    return true;
  }
}

export function writeSoundPreference(storage, enabled) {
  try {
    storage?.setItem("warkost-realtime-sound", enabled ? "on" : "off");
  } catch {}
  return Boolean(enabled);
}

export function usesAutomaticRealtimeSound(role) {
  return ["CUSTOMER", "DRIVER"].includes(role);
}

export function resolveRealtimeSoundEnabled(role, storage) {
  return usesAutomaticRealtimeSound(role) || readSoundPreference(storage);
}

export function shouldRenderRealtimeControls(role) {
  return Boolean(role) && !usesAutomaticRealtimeSound(role);
}

export function shouldPlayRealtimeSound({ event, unlocked, enabled, seen }) {
  return Boolean(
    enabled &&
    unlocked &&
    event?.actionable &&
    event?.audible === true &&
    !event?.replayed &&
    event?.id &&
    !seen.has(event.id),
  );
}
