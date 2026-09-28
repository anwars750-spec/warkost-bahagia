import { DatabaseSync } from "node:sqlite";

const requiredSchema = {
  users: ["id", "email", "password_hash", "role", "active", "phone"],
  sessions: ["token_hash", "user_id", "expires_at", "revoked_at"],
  auth_attempts: ["attempt_key", "count", "window_until"],
  categories: ["id", "name", "active"],
  products: ["id", "category_id", "name", "price", "active"],
  addresses: ["id", "user_id", "detail", "active", "latitude", "longitude"],
  orders: [
    "id",
    "customer_id",
    "address_id",
    "status",
    "subtotal",
    "delivery_fee",
    "distance_meters",
    "driver_delay_notice",
    "total",
    "checkout_key",
    "checkout_fingerprint",
  ],
  order_items: ["order_id", "product_id", "price", "quantity"],
  deliveries: ["order_id", "driver_id", "accepted_at", "delivered_at"],
  payments: [
    "order_id",
    "method",
    "status",
    "verified_by",
    "paid_at",
    "expires_at",
  ],
  print_jobs: [
    "order_id",
    "station",
    "status",
    "attempts",
    "reprint_count",
    "payload_json",
  ],
  loyalty_accounts: ["user_id", "balance"],
  loyalty_transactions: [
    "user_id",
    "order_id",
    "kind",
    "amount",
    "balance_after",
  ],
  order_events: ["order_id", "actor_id", "previous_status", "next_status"],
  audit_logs: ["actor_id", "action", "details"],
  notifications: ["user_id", "message", "read_at"],
  settings: ["key", "value"],
  media_assets: ["id", "filename", "mime_type", "bytes_size", "uploaded_by"],
};

export function verifySqliteBackup(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    if (
      database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
    )
      throw Error("Integritas database gagal");
    const brokenReferences = database.prepare("PRAGMA foreign_key_check").all();
    if (brokenReferences.length)
      throw Error("Relasi database rusak: " + brokenReferences[0].table);
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    for (const [table, requiredColumns] of Object.entries(requiredSchema)) {
      if (!tables.has(table)) throw Error("Tabel wajib tidak ada: " + table);
      const columns = new Set(
        database
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((row) => row.name),
      );
      for (const column of requiredColumns)
        if (!columns.has(column))
          throw Error(`Kolom wajib tidak ada: ${table}.${column}`);
    }
  } finally {
    database.close();
  }
}
