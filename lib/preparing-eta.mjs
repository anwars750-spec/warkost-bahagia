import * as store from "./store.mjs";

export const PREPARATION_ETA_MINUTES = 15;
export const PREPARATION_ETA_MS = PREPARATION_ETA_MINUTES * 60_000;

const PREPARATION_ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
]);

function timestampMs(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw)
    ? raw
    : raw.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function deadlineSnapshot(deadlineMs, nowMs) {
  if (!Number.isFinite(deadlineMs))
    return {
      estimatedReadyAt: null,
      remainingSeconds: null,
      overdueSeconds: 0,
      overdue: false,
    };
  const deltaMs = deadlineMs - nowMs;
  return {
    estimatedReadyAt: new Date(deadlineMs).toISOString(),
    remainingSeconds: Math.max(0, Math.ceil(deltaMs / 1000)),
    overdueSeconds: Math.max(0, Math.floor(-deltaMs / 1000)),
    overdue: deltaMs < 0,
  };
}

function stationPreparationEta(station, firstStartedAtMs, nowMs) {
  if (station.status === "READY")
    return {
      station: station.station,
      status: station.status,
      startedAt: station.started_at || null,
      readyAt: station.ready_at || null,
      estimatedReadyAt: null,
      remainingSeconds: 0,
      overdueSeconds: 0,
      overdue: false,
    };

  const startedAtMs = timestampMs(station.started_at);
  const deadlineMs = Number.isFinite(startedAtMs)
    ? startedAtMs + PREPARATION_ETA_MS
    : Number.isFinite(firstStartedAtMs)
      ? firstStartedAtMs + PREPARATION_ETA_MS
      : null;

  return {
    station: station.station,
    status: station.status,
    startedAt: station.started_at || null,
    readyAt: station.ready_at || null,
    ...deadlineSnapshot(deadlineMs, nowMs),
  };
}

export function calculatePreparationEta(order, stations = [], nowMs = Date.now()) {
  if (!order || !Number.isSafeInteger(Number(order.id)))
    throw new TypeError("Order ETA tidak valid");
  if (!Number.isFinite(nowMs)) throw new TypeError("Waktu ETA tidak valid");

  const firstStartedAtMs = stations
    .map((station) => timestampMs(station.started_at))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;

  const stationEtas = stations.map((station) =>
    stationPreparationEta(station, firstStartedAtMs, nowMs),
  );

  const base = {
    orderId: Number(order.id),
    status: order.status,
    fulfillmentType: order.fulfillment_type || "DELIVERY",
    createdAt: order.created_at || null,
    defaultMinutes: PREPARATION_ETA_MINUTES,
    stations: stationEtas,
  };

  if (!PREPARATION_ACTIVE_STATUSES.has(order.status))
    return {
      ...base,
      state: "COMPLETE",
      estimatedReadyAt: null,
      remainingSeconds: 0,
      overdueSeconds: 0,
      overdue: false,
    };

  if (order.status !== "PREPARING" || !Number.isFinite(firstStartedAtMs))
    return {
      ...base,
      state: "WAITING_START",
      estimatedReadyAt: null,
      remainingSeconds: null,
      overdueSeconds: 0,
      overdue: false,
    };

  const activeStations = stationEtas.filter(
    (station) => station.status !== "READY",
  );
  if (!activeStations.length)
    return {
      ...base,
      state: "COMPLETE",
      estimatedReadyAt: null,
      remainingSeconds: 0,
      overdueSeconds: 0,
      overdue: false,
    };

  const deadlines = activeStations
    .map((station) => timestampMs(station.estimatedReadyAt))
    .filter(Number.isFinite);
  const overallDeadlineMs = deadlines.length ? Math.max(...deadlines) : null;
  const snapshot = deadlineSnapshot(overallDeadlineMs, nowMs);

  return {
    ...base,
    state: snapshot.overdue ? "OVERDUE" : "PREPARING",
    ...snapshot,
  };
}

function orderAccessQuery(user, orderId) {
  const params = [];
  let sql =
    "SELECT DISTINCT o.id,o.customer_id,o.fulfillment_type,o.status,o.created_at FROM orders o";

  if (user.role === "CUSTOMER") {
    sql += " WHERE o.customer_id=? AND o.status IN ('PENDING','CONFIRMED','PREPARING')";
    params.push(user.id);
  } else if (user.role === "KITCHEN") {
    sql +=
      " JOIN order_stations access_station ON access_station.order_id=o.id AND access_station.station='KITCHEN'" +
      " WHERE o.status IN ('CONFIRMED','PREPARING','READY')";
  } else if (user.role === "ADMIN") {
    sql +=
      " JOIN order_stations access_station ON access_station.order_id=o.id AND access_station.station='CASHIER'" +
      " WHERE o.status IN ('CONFIRMED','PREPARING','READY')";
  } else {
    throw new TypeError("Role ETA tidak didukung");
  }

  if (orderId !== null) {
    sql += " AND o.id=?";
    params.push(orderId);
  }
  sql += " ORDER BY o.id DESC LIMIT 50";
  return { sql, params };
}

export async function listPreparationEta(
  user,
  { orderId = null, nowMs = Date.now() } = {},
) {
  if (!user || !["CUSTOMER", "KITCHEN", "ADMIN"].includes(user.role))
    throw new TypeError("Role ETA tidak didukung");
  if (
    orderId !== null &&
    (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1)
  )
    throw new TypeError("Order ETA tidak valid");
  if (!Number.isFinite(nowMs)) throw new TypeError("Waktu ETA tidak valid");

  const normalizedOrderId = orderId === null ? null : Number(orderId);
  const { sql, params } = orderAccessQuery(user, normalizedOrderId);
  const orders = await store.all(sql, ...params);
  if (!orders.length)
    return {
      serverNowMs: nowMs,
      defaultMinutes: PREPARATION_ETA_MINUTES,
      orders: [],
    };

  const placeholders = orders.map(() => "?").join(",");
  const stations = await store.all(
    `SELECT order_id,station,status,started_at,ready_at FROM order_stations WHERE order_id IN (${placeholders}) ORDER BY order_id,station`,
    ...orders.map((order) => order.id),
  );
  const stationsByOrder = new Map();
  for (const station of stations) {
    const key = Number(station.order_id);
    if (!stationsByOrder.has(key)) stationsByOrder.set(key, []);
    stationsByOrder.get(key).push(station);
  }

  return {
    serverNowMs: nowMs,
    defaultMinutes: PREPARATION_ETA_MINUTES,
    orders: orders.map((order) =>
      calculatePreparationEta(
        order,
        stationsByOrder.get(Number(order.id)) || [],
        nowMs,
      ),
    ),
  };
}
