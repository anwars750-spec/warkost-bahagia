import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import { storeImageAsset } from "./media.mjs";

async function proofTarget(user, orderId) {
  required(user, ["DRIVER"]);
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1)
    throw new DomainError("Order tidak valid");
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
