import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

export const STORE_TIME_ZONE = "Asia/Jakarta";
export const DEFAULT_STORE_OPERATING_HOURS = Object.freeze({
  openTime: "08:00",
  closeTime: "22:00",
  manualStatus: "OPEN",
  closedReason: "",
});

const SETTING_KEYS = Object.freeze({
  openTime: "store_open_time",
  closeTime: "store_close_time",
  manualStatus: "store_manual_status",
  closedReason: "store_closed_reason",
});
const STORE_SETTING_KEYS = Object.freeze(Object.values(SETTING_KEYS));
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function normalizedReason(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateStoreOperatingHours(input = {}) {
  const openTime = String(input.openTime ?? "").trim();
  const closeTime = String(input.closeTime ?? "").trim();
  const manualStatus = String(input.manualStatus ?? "")
    .trim()
    .toUpperCase();
  const closedReason = normalizedReason(input.closedReason);
  if (
    !TIME_PATTERN.test(openTime) ||
    !TIME_PATTERN.test(closeTime) ||
    openTime === closeTime ||
    !["OPEN", "CLOSED"].includes(manualStatus) ||
    closedReason.length > 120
  )
    throw new DomainError("Konfigurasi jam operasional tidak valid", 422);
  return { openTime, closeTime, manualStatus, closedReason };
}

function minutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function jakartaClock(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function isWithinSchedule(openTime, closeTime, currentMinutes) {
  const opens = minutes(openTime);
  const closes = minutes(closeTime);
  return opens < closes
    ? currentMinutes >= opens && currentMinutes < closes
    : currentMinutes >= opens || currentMinutes < closes;
}

function mappedRows(rows) {
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  try {
    return validateStoreOperatingHours({
      openTime:
        values[SETTING_KEYS.openTime] ?? DEFAULT_STORE_OPERATING_HOURS.openTime,
      closeTime:
        values[SETTING_KEYS.closeTime] ??
        DEFAULT_STORE_OPERATING_HOURS.closeTime,
      manualStatus:
        values[SETTING_KEYS.manualStatus] ??
        DEFAULT_STORE_OPERATING_HOURS.manualStatus,
      closedReason:
        values[SETTING_KEYS.closedReason] ??
        DEFAULT_STORE_OPERATING_HOURS.closedReason,
    });
  } catch (error) {
    throw new DomainError(
      "Konfigurasi jam operasional server tidak valid",
      500,
    );
  }
}

export function evaluateStoreOperatingHours(
  config,
  { nowMs = Date.now() } = {},
) {
  const normalized = validateStoreOperatingHours(config);
  const now = new Date(nowMs);
  if (!Number.isFinite(now.getTime()))
    throw new TypeError("Waktu server tidak valid");
  const clock = jakartaClock(now);
  const currentMinutes = clock.hour * 60 + clock.minute;
  const withinSchedule = isWithinSchedule(
    normalized.openTime,
    normalized.closeTime,
    currentMinutes,
  );
  const manualClosed = normalized.manualStatus === "CLOSED";
  const isOpen = !manualClosed && withinSchedule;
  return {
    ...normalized,
    timeZone: STORE_TIME_ZONE,
    serverTime: now.toISOString(),
    effectiveStatus: isOpen ? "OPEN" : "CLOSED",
    isOpen,
    withinSchedule,
    manualClosed,
    nextOpenTime: !isOpen && !manualClosed ? normalized.openTime : null,
  };
}

export async function readStoreOperatingStatus(
  source = store,
  { nowMs = Date.now(), lock = false, mysql = false } = {},
) {
  const placeholders = STORE_SETTING_KEYS.map(() => "?").join(",");
  const rows = await source.all(
    `SELECT \`key\`,value FROM settings WHERE \`key\` IN (${placeholders}) ORDER BY \`key\`${lock && mysql ? " FOR UPDATE" : ""}`,
    ...STORE_SETTING_KEYS,
  );
  return evaluateStoreOperatingHours(mappedRows(rows), { nowMs });
}

export async function getStoreOperatingStatus(options = {}) {
  return readStoreOperatingStatus(store, options);
}

export async function saveStoreOperatingHours(user, input, options = {}) {
  requiredCapability(user, CAPABILITIES.STORE_HOURS_WRITE);
  const next = validateStoreOperatingHours(input);
  return store.transaction(async (tx, mysql) => {
    const previous = await readStoreOperatingStatus(tx, {
      nowMs: options.nowMs,
      lock: true,
      mysql,
    });
    const save = mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value";
    for (const [key, value] of [
      [SETTING_KEYS.openTime, next.openTime],
      [SETTING_KEYS.closeTime, next.closeTime],
      [SETTING_KEYS.manualStatus, next.manualStatus],
      [SETTING_KEYS.closedReason, next.closedReason],
    ])
      await tx.run(save, key, value);
    const effective = evaluateStoreOperatingHours(next, options);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "STORE_OPERATING_HOURS_UPDATED",
      JSON.stringify({
        previous: {
          openTime: previous.openTime,
          closeTime: previous.closeTime,
          manualStatus: previous.manualStatus,
          closedReason: previous.closedReason,
        },
        next,
        effectiveStatus: effective.effectiveStatus,
        timeZone: STORE_TIME_ZONE,
        actorRole: user.role,
      }),
    );
    return effective;
  });
}

export async function assertStoreAcceptingOrders(
  source = store,
  { nowMs = Date.now(), mysql = false } = {},
) {
  const status = await readStoreOperatingStatus(source, {
    nowMs,
    lock: true,
    mysql,
  });
  if (!status.isOpen) {
    const detail = status.closedReason
      ? `: ${status.closedReason}`
      : status.nextOpenTime
        ? `. Buka kembali pukul ${status.nextOpenTime} WIB`
        : "";
    throw new DomainError(`Warkost sedang tutup${detail}`, 409);
  }
  return status;
}
