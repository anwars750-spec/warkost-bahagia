import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const requiredMysqlTables = [
  "addresses",
  "audit_logs",
  "auth_attempts",
  "categories",
  "cod_settlement_batch_items",
  "cod_settlement_batches",
  "cod_settlements",
  "conversation_messages",
  "conversations",
  "deliveries",
  "loyalty_accounts",
  "loyalty_reward_rules",
  "loyalty_transactions",
  "media_assets",
  "notifications",
  "otp_challenges",
  "order_events",
  "order_items",
  "order_stations",
  "orders",
  "payment_provider_events",
  "payments",
  "print_jobs",
  "promo_claims",
  "promotions",
  "products",
  "product_subcategories",
  "schema_migrations",
  "sessions",
  "settings",
  "stock_movements",
  "stock_reservations",
  "users",
];

const requiredColumns = {
  users: [
    "id",
    "email",
    "password_hash",
    "role",
    "active",
    "phone",
    "email_verified_at",
  ],
  sessions: ["token_hash", "user_id", "expires_at", "revoked_at"],
  auth_attempts: ["attempt_key", "count", "window_until"],
  otp_challenges: [
    "public_id",
    "user_id",
    "purpose",
    "otp_hash",
    "expires_at",
    "attempts",
    "consumed_at",
    "last_sent_at",
    "verified_at",
    "reset_token_hash",
    "reset_expires_at",
  ],
  categories: ["id", "name", "active"],
  product_subcategories: ["id", "category_id", "name", "active", "sort_order"],
  products: [
    "id",
    "category_id",
    "name",
    "price",
    "active",
    "prep_station",
    "stock_quantity",
    "subcategory_id",
    "stock_unit",
    "price_unit_quantity",
    "minimum_order_quantity",
    "order_step_quantity",
    "low_stock_threshold",
  ],
  addresses: ["id", "user_id", "detail", "active", "latitude", "longitude"],
  orders: [
    "id",
    "customer_id",
    "status",
    "total",
    "subtotal",
    "delivery_fee",
    "distance_meters",
    "driver_delay_notice",
    "promotion_id",
    "promo_claim_id",
    "voucher_discount",
    "loyalty_reward_rule_id",
    "loyalty_points_redeemed",
    "loyalty_discount",
    "checkout_key",
    "checkout_fingerprint",
  ],
  order_items: [
    "order_id",
    "product_id",
    "price",
    "quantity",
    "note",
    "prep_station",
    "stock_unit",
    "price_unit_quantity",
  ],
  order_stations: ["order_id", "station", "status", "ready_at"],
  stock_movements: [
    "product_id",
    "actor_id",
    "order_id",
    "kind",
    "quantity_delta",
    "balance_after",
  ],
  payments: [
    "order_id",
    "method",
    "status",
    "amount",
    "provider_reference",
    "transaction_reference",
    "paid_at",
    "failed_at",
    "expired_at",
    "expires_at",
  ],
  cod_settlements: [
    "order_id",
    "driver_id",
    "expected_amount",
    "cash_amount",
    "evidence_reference",
    "submitted_at",
    "admin_verifier_id",
    "verified_at",
    "status",
    "discrepancy_amount",
  ],
  cod_settlement_batches: [
    "driver_id",
    "expected_amount",
    "submitted_amount",
    "discrepancy_amount",
    "status",
    "evidence_reference",
    "submitted_at",
    "admin_verifier_id",
    "verified_at",
  ],
  cod_settlement_batch_items: [
    "batch_id",
    "order_id",
    "settlement_id",
    "expected_amount",
  ],
  conversations: [
    "id",
    "thread_key",
    "type",
    "customer_id",
    "order_id",
    "driver_id",
    "status",
    "closed_at",
    "created_at",
    "updated_at",
  ],
  conversation_messages: [
    "id",
    "conversation_id",
    "sender_user_id",
    "sender_role",
    "message",
    "read_at",
    "created_at",
  ],
  payment_provider_events: [
    "provider",
    "event_id",
    "payment_id",
    "event_type",
    "payload_hash",
  ],
  stock_reservations: [
    "order_id",
    "product_id",
    "quantity",
    "status",
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
  promotions: [
    "id",
    "title",
    "starts_at",
    "ends_at",
    "active",
    "voucher_type",
    "voucher_category",
    "discount_value",
    "minimum_order",
    "max_discount",
    "quota",
    "used_count",
    "one_per_customer",
    "created_by",
    "updated_by",
  ],
  promo_claims: [
    "id",
    "promotion_id",
    "customer_id",
    "state",
    "order_id",
    "claimed_at",
    "used_at",
  ],
  deliveries: ["order_id", "driver_id", "delivered_at"],
  loyalty_accounts: ["user_id", "balance"],
  loyalty_reward_rules: [
    "id",
    "name",
    "points_required",
    "reward_type",
    "reward_value",
    "minimum_order",
    "maximum_discount",
    "active",
    "created_at",
    "updated_at",
  ],
  loyalty_transactions: [
    "user_id",
    "order_id",
    "reward_rule_id",
    "kind",
    "amount",
    "balance_after",
  ],
  media_assets: ["id", "filename", "mime_type", "bytes_size"],
  settings: ["key", "value"],
  schema_migrations: ["version", "checksum", "applied_at"],
};

export function loadMysqlMigrations(folder = path.resolve("migrations")) {
  return fs
    .readdirSync(folder)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort()
    .map((version) => {
      const content = fs.readFileSync(path.join(folder, version), "utf8");
      return {
        version,
        content,
        checksum: crypto.createHash("sha256").update(content).digest("hex"),
      };
    });
}

const decode = (value, name) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw Error(`${name} pada DATABASE_URL tidak valid`);
  }
};

export function parseMysqlUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("DATABASE_URL MySQL tidak valid");
  }
  if (url.protocol !== "mysql:")
    throw Error("DATABASE_URL harus berupa URI mysql://");
  const database = decode(url.pathname.replace(/^\//, ""), "Nama database");
  if (!url.hostname || !url.username || !database || database.includes("/"))
    throw Error("DATABASE_URL harus memuat host, user, dan satu nama database");
  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error("Port MySQL tidak valid");
  const sslMode = (
    url.searchParams.get("ssl-mode") || "PREFERRED"
  ).toUpperCase();
  if (
    !new Set([
      "DISABLED",
      "PREFERRED",
      "REQUIRED",
      "VERIFY_CA",
      "VERIFY_IDENTITY",
    ]).has(sslMode)
  )
    throw Error("ssl-mode MySQL tidak valid");
  return {
    host: url.hostname,
    port,
    user: decode(url.username, "User"),
    password: decode(url.password, "Password"),
    database,
    sslMode,
  };
}

const optionValue = (value) => {
  if (/[\r\n\0]/.test(value))
    throw Error("DATABASE_URL memuat karakter terlarang");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};

export function createMysqlDefaultsFile(config) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-mysql-"));
  const file = path.join(directory, "client.cnf");
  const content = [
    "[client]",
    `host=${optionValue(config.host)}`,
    `port=${config.port}`,
    `user=${optionValue(config.user)}`,
    `password=${optionValue(config.password)}`,
    `ssl-mode=${config.sslMode}`,
    "protocol=TCP",
    "",
  ].join("\n");
  fs.writeFileSync(file, content, { flag: "wx", mode: 0o600 });
  return {
    file,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

export async function verifyMysqlSchema(
  connection,
  database,
  expectedMigrations,
) {
  const [schemaRows] = await connection.execute(
    "SELECT default_character_set_name charset FROM information_schema.schemata WHERE schema_name=?",
    [database],
  );
  if (schemaRows[0]?.charset !== "utf8mb4")
    throw Error("Database MySQL harus menggunakan charset utf8mb4");
  const [rows] = await connection.execute(
    "SELECT table_name,engine FROM information_schema.tables WHERE table_schema=?",
    [database],
  );
  const tables = new Map(
    rows.map((row) => [
      row.TABLE_NAME || row.table_name,
      row.ENGINE || row.engine,
    ]),
  );
  for (const table of requiredMysqlTables) {
    if (!tables.has(table))
      throw Error("Tabel MySQL wajib tidak ada: " + table);
    if (tables.get(table) !== "InnoDB")
      throw Error("Engine tabel MySQL bukan InnoDB: " + table);
  }
  const [columnRows] = await connection.execute(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=?",
    [database],
  );
  const columns = new Map();
  for (const row of columnRows) {
    const table = row.TABLE_NAME || row.table_name;
    const column = row.COLUMN_NAME || row.column_name;
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table).add(column);
  }
  for (const [table, expectedColumns] of Object.entries(requiredColumns))
    for (const column of expectedColumns)
      if (!columns.get(table)?.has(column))
        throw Error(`Kolom MySQL wajib tidak ada: ${table}.${column}`);
  const [migrationRows] = await connection.query(
    "SELECT version,checksum FROM schema_migrations ORDER BY version",
  );
  const actual = migrationRows.map((row) => ({
    version: row.version,
    checksum: row.checksum,
  }));
  const expected = expectedMigrations
    .map(({ version, checksum }) => ({ version, checksum }))
    .sort((a, b) => a.version.localeCompare(b.version));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error("Daftar atau checksum migrasi MySQL tidak cocok");
  return { tables: tables.size, migrations: actual.length, charset: "utf8mb4" };
}
