export const ADMIN_ORDER_FILTERS = Object.freeze([
  Object.freeze({ key: "all", label: "Semua" }),
  Object.freeze({ key: "waiting", label: "Menunggu" }),
  Object.freeze({ key: "preparing", label: "Disiapkan" }),
  Object.freeze({ key: "ready", label: "Siap antar" }),
  Object.freeze({ key: "delivery", label: "Dalam pengantaran" }),
  Object.freeze({ key: "done", label: "Selesai" }),
]);

const FILTER_STATUSES = Object.freeze({
  waiting: Object.freeze(["PENDING", "CONFIRMED"]),
  preparing: Object.freeze(["PREPARING"]),
  ready: Object.freeze(["READY"]),
  delivery: Object.freeze(["ASSIGNED", "PICKED_UP", "ON_DELIVERY"]),
  done: Object.freeze(["DELIVERED"]),
});

export function adminOrderGroup(status) {
  const normalized = String(status || "").toUpperCase();
  for (const [group, statuses] of Object.entries(FILTER_STATUSES))
    if (statuses.includes(normalized)) return group;
  return "other";
}

export function adminOrderCounts(orders) {
  const counts = Object.fromEntries(
    ADMIN_ORDER_FILTERS.map(({ key }) => [key, 0]),
  );
  counts.all = orders.length;
  for (const order of orders) {
    const group = adminOrderGroup(order.status);
    if (Object.hasOwn(counts, group)) counts[group] += 1;
  }
  return counts;
}

export function filterAdminOrders(orders, filter = "all", search = "") {
  const selected = ADMIN_ORDER_FILTERS.some(({ key }) => key === filter)
    ? filter
    : "all";
  const query = String(search || "")
    .trim()
    .toLocaleLowerCase("id-ID");

  return orders.filter((order) => {
    if (selected !== "all" && adminOrderGroup(order.status) !== selected)
      return false;
    if (!query) return true;
    const id = String(order.id ?? "");
    const searchable = [
      id,
      `#${id}`,
      `WB${id.padStart(6, "0")}`,
      order.customer_name,
      order.address,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("id-ID");
    return searchable.includes(query);
  });
}
