import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import { storeImageAsset } from "./media.mjs";

let sqliteProofReady = false;

async function ensureProofStore() {
  if (store.isMySQL() || sqliteProofReady) return;
  await store.run(`
    CREATE TABLE IF NOT EXISTS delivery_proofs(
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
      delivery_id INTEGER NOT NULL UNIQUE REFERENCES deliveries(id),
      driver_id INTEGER NOT NULL REFERENCES users(id),
      media_id TEXT NOT NULL UNIQUE REFERENCES media_assets(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await store.run(
    "CREATE INDEX IF NOT EXISTS idx_delivery_proofs_driver_date ON delivery_proofs(driver_id,created_at,id)",
  );
  sqliteProofReady = true;
}

async function proofTarget(user, orderId) {
  required(user, ["DRIVER"]);
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1)
    throw new DomainError("Order tidak valid");
  await ensureProofStore();
  const target = await store.get(
    `SELECT o.id order_id,o.status,o.fulfillment_type,d.id delivery_id,d.driver_id
       FROM orders o
       JOIN deliveries d ON d.order_id=o.id
      WHERE o.id=?`,
    Number(orderId),
  );
  if (!target) throw new DomainError("Pengantaran tidak ditemukan", 404);
  if (target.fulfillment_type !== "DELIVERY")
    throw new DomainError("Pesanan pickup tidak menggunakan bukti pengantaran", 409);
  if (Number(target.driver_id) !== Number(user.id))
    throw new DomainError("Bukti hanya dapat dikirim Driver yang ditugaskan", 403);
  if (target.status !== "ON_DELIVERY")
    throw new DomainError("Bukti hanya dapat dikirim saat pesanan dalam perjalanan", 409);
  return target;
}

export async function hasDeliveryProof(orderId) {
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) return false;
  await ensureProofStore();
  return Boolean(
    await store.get(
      "SELECT id FROM delivery_proofs WHERE order_id=? LIMIT 1",
      Number(orderId),
    ),
  );
}

export async function getDriverDeliveryProof(user, orderId) {
  const target = await proofTarget(user, orderId);
  const proof = await store.get(
    `SELECT dp.id,dp.order_id,dp.delivery_id,dp.driver_id,dp.media_id,dp.created_at
       FROM delivery_proofs dp
      WHERE dp.order_id=? AND dp.driver_id=?`,
    target.order_id,
    user.id,
  );
  return proof
    ? { ...proof, image_url: `/api/media/${proof.media_id}` }
    : null;
}

export async function createDriverDeliveryProof(user, orderId, file) {
  const target = await proofTarget(user, orderId);
  const existing = await store.get(
    `SELECT id,order_id,delivery_id,driver_id,media_id,created_at
       FROM delivery_proofs
      WHERE order_id=?`,
    target.order_id,
  );
  if (existing) {
    if (Number(existing.driver_id) !== Number(user.id))
      throw new DomainError("Bukti pengantaran sudah dimiliki Driver lain", 409);
    return { ...existing, image_url: `/api/media/${existing.media_id}` };
  }

  const media = await storeImageAsset(user, file);
  const result = await store.run(
    `INSERT INTO delivery_proofs(order_id,delivery_id,driver_id,media_id)
     VALUES(?,?,?,?)`,
    target.order_id,
    target.delivery_id,
    user.id,
    media.id,
  );
  await store.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "DELIVERY_PROOF_CREATED",
    JSON.stringify({
      orderId: target.order_id,
      deliveryId: target.delivery_id,
      driverId: user.id,
      mediaId: media.id,
    }),
  );
  return {
    id: Number(result.lastInsertRowid),
    order_id: target.order_id,
    delivery_id: target.delivery_id,
    driver_id: user.id,
    media_id: media.id,
    image_url: media.url,
  };
}
