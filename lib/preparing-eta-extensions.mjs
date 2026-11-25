import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

export const PREPARATION_EXTENSION_STEP_MINUTES = 5;

let sqliteExtensionReady = false;

async function ensureExtensionStore() {
  if (store.isMySQL() || sqliteExtensionReady) return;
  await store.run(`
    CREATE TABLE IF NOT EXISTS preparation_eta_extensions(
      order_id INTEGER NOT NULL REFERENCES orders(id),
      station TEXT NOT NULL,
      extra_minutes INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(order_id,station)
    )
  `);
  await store.run(
    "CREATE INDEX IF NOT EXISTS idx_preparation_eta_extensions_updated ON preparation_eta_extensions(updated_at,order_id)",
  );
  sqliteExtensionReady = true;
}

export async function listPreparationEtaExtensions(orderIds = []) {
  const ids = [...new Set(orderIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  await ensureExtensionStore();
  const placeholders = ids.map(() => "?").join(",");
  return store.all(
    `SELECT order_id,station,extra_minutes,updated_by,updated_at
       FROM preparation_eta_extensions
      WHERE order_id IN (${placeholders})`,
    ...ids,
  );
}

export async function extendAdminPreparationEta(user, orderId) {
  required(user, ["ADMIN"]);
  const normalizedOrderId = Number(orderId);
  if (!Number.isSafeInteger(normalizedOrderId) || normalizedOrderId < 1)
    throw new DomainError("Order ETA tidak valid");

  await ensureExtensionStore();
  return store.transaction(async (tx, mysql) => {
    const target = await tx.get(
      `SELECT o.id order_id,o.status order_status,s.status station_status
         FROM orders o
         JOIN order_stations s ON s.order_id=o.id AND s.station='CASHIER'
        WHERE o.id=?${mysql ? " FOR UPDATE" : ""}`,
      normalizedOrderId,
    );
    if (!target) throw new DomainError("Station Admin minuman tidak ditemukan", 404);
    if (target.order_status !== "PREPARING" || target.station_status !== "PREPARING")
      throw new DomainError("Waktu hanya dapat ditambah saat Admin sedang menyiapkan minuman", 409);

    const existing = await tx.get(
      `SELECT extra_minutes FROM preparation_eta_extensions
        WHERE order_id=? AND station='CASHIER'${mysql ? " FOR UPDATE" : ""}`,
      normalizedOrderId,
    );
    const nextExtra = Number(existing?.extra_minutes || 0) + PREPARATION_EXTENSION_STEP_MINUTES;

    if (existing) {
      await tx.run(
        "UPDATE preparation_eta_extensions SET extra_minutes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND station='CASHIER'",
        nextExtra,
        user.id,
        normalizedOrderId,
      );
    } else {
      await tx.run(
        "INSERT INTO preparation_eta_extensions(order_id,station,extra_minutes,updated_by) VALUES(?,'CASHIER',?,?)",
        normalizedOrderId,
        nextExtra,
        user.id,
      );
    }

    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PREPARATION_ETA_EXTENDED",
      JSON.stringify({
        orderId: normalizedOrderId,
        station: "CASHIER",
        addedMinutes: PREPARATION_EXTENSION_STEP_MINUTES,
        extraMinutes: nextExtra,
      }),
    );

    return {
      orderId: normalizedOrderId,
      station: "CASHIER",
      addedMinutes: PREPARATION_EXTENSION_STEP_MINUTES,
      extraMinutes: nextExtra,
    };
  });
}
