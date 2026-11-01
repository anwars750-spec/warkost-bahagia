// UI-only persistence. Never used for API permissions or domain state.
export const KITCHEN_VIEWS = Object.freeze(["orders", "stock", "printing"]);
const key = (userId) => `warkost:kitchen-workspace:${userId}`;
export function readKitchenView(storage, userId) {
  try {
    const view = userId ? storage.getItem(key(userId)) : null;
    return KITCHEN_VIEWS.includes(view) ? view : "orders";
  } catch {
    return "orders";
  }
}
export function saveKitchenView(storage, userId, view) {
  if (!userId || !KITCHEN_VIEWS.includes(view)) return;
  try {
    storage.setItem(key(userId), view);
  } catch {
    /* Storage can be disabled. */
  }
}
export function forgetKitchenView(storage, userId) {
  try {
    if (userId) storage.removeItem(key(userId));
  } catch {
    /* No stored view. */
  }
}

export function restoreKitchenView(userId) {
  try {
    return readKitchenView(window.sessionStorage, userId);
  } catch {
    return "orders";
  }
}
