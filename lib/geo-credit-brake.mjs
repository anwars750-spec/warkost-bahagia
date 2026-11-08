import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import * as store from "./store.mjs";

export const GEO_DAILY_LIMIT = 1500;
const DAY = 86_400_000;
const AUTOCOMPLETE = "autocomplete";
const COSTS = new Map([[AUTOCOMPLETE, 1]]);

export class GeoBrakeError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function externalGeoEnabled(env = process.env) {
  return env.GEOLOCATION_EXTERNAL_ENABLED === "true";
}

export function unavailable() {
  return new GeoBrakeError(
    "UNAVAILABLE",
    503,
    "Pencarian lokasi otomatis belum tersedia. Gunakan alamat tersimpan atau tentukan titik lokasi secara manual.",
  );
}

export function trustedIpHash(request, env = process.env) {
  const ip = request.headers.get("x-warkost-client-ip") || "";
  const secret = env.SESSION_SECRET || "";
  if (env.GEOLOCATION_TRUST_PROXY !== "true" || !isIP(ip) || secret.length < 32)
    throw unavailable();
  const canonical =
    isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
  const address = mapped
    ? mapped
        .slice(1)
        .flatMap((hex) => {
          const n = parseInt(hex, 16);
          return [n >> 8, n & 255];
        })
        .join(".")
    : canonical;
  return createHmac("sha256", secret).update(`geo-ip:${address}`).digest("hex");
}

async function dbNow(tx, mysql) {
  const sql = mysql
    ? "SELECT FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) now_ms"
    : "SELECT CAST(unixepoch('subsec')*1000 AS INTEGER) now_ms";
  const now = Number((await tx.get(sql))?.now_ms);
  if (!Number.isSafeInteger(now) || now <= 0) throw unavailable();
  return now;
}

export async function reserveGeoCredit({
  endpoint,
  userId,
  ipHash,
  attemptId,
}) {
  const credits = COSTS.get(endpoint);
  if (!credits) throw unavailable();
  return store.transaction(async (tx, mysql) => {
    // Every process takes the same lock before reading the ledger. SQLite
    // already holds its database write lock via BEGIN IMMEDIATE.
    const lock = await tx.get(
      "SELECT id FROM geo_credit_lock WHERE id=1" +
        (mysql ? " FOR UPDATE" : ""),
    );
    if (!lock) throw unavailable();
    const now = await dbNow(tx, mysql);
    const usage = await tx.get(
      `SELECT COALESCE(SUM(credits),0) credits,
              COUNT(CASE WHEN finished_ms IS NULL OR finished_ms>? THEN 1 END) recent,
              COUNT(CASE WHEN user_id=? THEN 1 END) user_count,
              COUNT(CASE WHEN ip_hash=? THEN 1 END) ip_count,
              COUNT(CASE WHEN user_id=? AND attempt_id=? THEN 1 END) attempt_count
         FROM geo_credit_reservations WHERE finished_ms IS NULL OR finished_ms>?`,
      now - 1000,
      userId,
      ipHash,
      userId,
      attemptId,
      now - DAY,
    );
    const total = Number(usage.credits);
    if (total + credits > GEO_DAILY_LIMIT)
      throw new GeoBrakeError(
        "DAILY_LIMIT",
        429,
        "Batas harian pencarian lokasi tercapai. Gunakan alamat tersimpan atau tentukan titik secara manual.",
      );
    if (total >= GEO_DAILY_LIMIT * 0.8)
      throw new GeoBrakeError(
        "CONSERVATION",
        429,
        "Pencarian otomatis dijeda untuk menghemat kuota. Gunakan alamat tersimpan atau tentukan titik secara manual.",
      );
    if (Number(usage.attempt_count) >= 5)
      throw new GeoBrakeError(
        "ATTEMPT_LIMIT",
        429,
        "Lima pencarian sudah digunakan. Mulai pencarian baru atau tentukan titik secara manual.",
      );
    if (Number(usage.user_count) >= 10 || Number(usage.ip_count) >= 30)
      throw new GeoBrakeError(
        "SEARCH_LIMIT",
        429,
        "Batas pencarian lokasi tercapai. Gunakan alamat tersimpan atau tentukan titik secara manual.",
      );
    if (Number(usage.recent) >= 2)
      throw new GeoBrakeError(
        "RATE_LIMIT",
        429,
        "Pencarian sedang sibuk. Tunggu sebentar lalu coba lagi.",
      );
    // Retain pending rows after a process crash until an operator reconciles
    // them. No timeout, abort, provider error or process restart refunds them.
    await tx.run(
      "DELETE FROM geo_credit_reservations WHERE finished_ms<=?",
      now - 2 * DAY,
    );
    const row = await tx.run(
      "INSERT INTO geo_credit_reservations(endpoint,credits,user_id,ip_hash,attempt_id,reserved_ms) VALUES(?,?,?,?,?,?)",
      endpoint,
      credits,
      userId,
      ipHash,
      attemptId,
      now,
    );
    if (row.changes !== 1 || !row.lastInsertRowid) throw unavailable();
    return row.lastInsertRowid;
  });
}

export async function settleGeoCredit(id, success) {
  await store.transaction(async (tx, mysql) => {
    const now = await dbNow(tx, mysql);
    await tx.run(
      "UPDATE geo_credit_reservations SET finished_ms=?,outcome=? WHERE id=? AND finished_ms IS NULL",
      now,
      success ? "SUCCESS" : "FAILURE",
      id,
    );
  });
}

export async function geoUsage() {
  const now = await dbNow(store, store.isMySQL());
  const totals = await store.get(
    `SELECT COALESCE(SUM(CASE WHEN finished_ms IS NULL OR finished_ms>? THEN credits ELSE 0 END),0) reserved,
            COALESCE(SUM(CASE WHEN finished_ms>? THEN credits ELSE 0 END),0) completed,
            COUNT(CASE WHEN finished_ms IS NULL THEN 1 END) pending,
            MAX(CASE WHEN outcome='SUCCESS' THEN finished_ms END) last_success,
            MAX(CASE WHEN outcome='FAILURE' THEN finished_ms END) last_failure
       FROM geo_credit_reservations`,
    now - DAY,
    now - DAY,
  );
  const reserved = Number(totals.reserved);
  const completed = Number(totals.completed);
  return {
    allowance: GEO_DAILY_LIMIT,
    windowHours: 24,
    estimatedCredits: {
      reserved,
      completed,
      autocomplete: reserved,
      routing: 0,
      tiles: 0,
    },
    pending: Number(totals.pending),
    lastSuccessMs:
      totals.last_success == null ? null : Number(totals.last_success),
    lastFailureMs:
      totals.last_failure == null ? null : Number(totals.last_failure),
    alerts: [50, 80, 100].filter(
      (level) => reserved * 100 >= GEO_DAILY_LIMIT * level,
    ),
  };
}
