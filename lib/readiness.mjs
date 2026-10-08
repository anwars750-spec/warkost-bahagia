import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as store from "./store.mjs";

const schemaProbes = [
  "SELECT id,email,role,active,phone FROM users LIMIT 1",
  "SELECT token_hash,user_id,expires_at,revoked_at FROM sessions LIMIT 1",
  "SELECT id,category_id,price,active FROM products LIMIT 1",
  "SELECT id,user_id,detail,active,latitude,longitude FROM addresses LIMIT 1",
  "SELECT id,customer_id,status,subtotal,delivery_fee,distance_meters,driver_delay_notice,total,checkout_key,checkout_fingerprint FROM orders LIMIT 1",
  "SELECT order_id,product_id,price,quantity FROM order_items LIMIT 1",
  "SELECT order_id,method,status,amount,transaction_reference,paid_at,expires_at FROM payments LIMIT 1",
  "SELECT order_id,driver_id,expected_amount,cash_amount,status,discrepancy_amount FROM cod_settlements LIMIT 1",
  "SELECT driver_id,expected_amount,submitted_amount,status,discrepancy_amount FROM cod_settlement_batches LIMIT 1",
  "SELECT batch_id,order_id,settlement_id,expected_amount FROM cod_settlement_batch_items LIMIT 1",
  "SELECT order_id,station,status,attempts,reprint_count FROM print_jobs LIMIT 1",
  "SELECT id,title,starts_at,ends_at,active,created_by,updated_by FROM promotions LIMIT 1",
  "SELECT order_id,driver_id,delivered_at FROM deliveries LIMIT 1",
  "SELECT user_id,balance FROM loyalty_accounts LIMIT 1",
  "SELECT id,filename,mime_type,bytes_size FROM media_assets LIMIT 1",
  "SELECT `key`,value FROM settings LIMIT 1",
];

function absolutePath(value, name, errors) {
  if (!value) errors.push(`${name} wajib disetel`);
  else if (!path.isAbsolute(value))
    errors.push(`${name} harus berupa path absolut`);
}

export function validateProductionConfig(env = process.env) {
  const errors = [];
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV harus production");
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32)
    errors.push("SESSION_SECRET harus minimal 32 byte");
  if (String(env.PAYMENT_PROVIDER_MODE || "").toLowerCase() === "simulation")
    errors.push("Simulasi QRIS tidak boleh aktif di production");

  if (env.DATABASE_URL) {
    try {
      if (new URL(env.DATABASE_URL).protocol !== "mysql:")
        errors.push("DATABASE_URL harus berupa URI mysql://");
    } catch {
      errors.push("DATABASE_URL tidak valid");
    }
  } else {
    absolutePath(env.DATABASE_PATH, "DATABASE_PATH", errors);
  }
  absolutePath(env.UPLOAD_DIRECTORY, "UPLOAD_DIRECTORY", errors);
  absolutePath(env.BACKUP_DIRECTORY, "BACKUP_DIRECTORY", errors);

  if (
    env.UPLOAD_DIRECTORY &&
    env.BACKUP_DIRECTORY &&
    path.resolve(env.UPLOAD_DIRECTORY) === path.resolve(env.BACKUP_DIRECTORY)
  )
    errors.push("BACKUP_DIRECTORY harus berbeda dari UPLOAD_DIRECTORY");
  return errors;
}

async function writableDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const probe = path.join(directory, `.warkost-write-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(probe, "ok", { flag: "wx", mode: 0o600 });
  } finally {
    await fs.rm(probe, { force: true });
  }
}

export async function checkReadiness({
  production = process.env.NODE_ENV === "production",
} = {}) {
  const errors = production ? validateProductionConfig(process.env) : [];
  const checks = {
    config: errors.length === 0,
    database: false,
    storage: false,
    backup: !production,
  };
  if (errors.length) return { ready: false, checks };

  try {
    for (const query of schemaProbes) await store.get(query);
    checks.database = true;
  } catch {
    return { ready: false, checks };
  }

  try {
    await writableDirectory(
      path.resolve(
        /*turbopackIgnore: true*/ process.env.UPLOAD_DIRECTORY ||
          "./data/uploads",
      ),
    );
    checks.storage = true;
  } catch {
    return { ready: false, checks };
  }

  if (production) {
    try {
      await writableDirectory(
        path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIRECTORY),
      );
      checks.backup = true;
    } catch {
      return { ready: false, checks };
    }
  }
  return { ready: Object.values(checks).every(Boolean), checks };
}
