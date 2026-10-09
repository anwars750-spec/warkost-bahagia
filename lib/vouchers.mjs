import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import { isGuestCustomer } from "./customer-kind.mjs";

const promotionColumns =
  "p.id,p.title,p.description,p.badge,p.terms,p.starts_at,p.ends_at,p.active," +
  "p.voucher_type,p.voucher_category,p.discount_value,p.minimum_order,p.max_discount,p.quota,p.used_count,p.one_per_customer";

function requiredMemberCustomer(user) {
  required(user, ["CUSTOMER"]);
  if (isGuestCustomer(user))
    throw new DomainError("Voucher hanya tersedia untuk member Warkost", 403);
}

function promotionId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Voucher tidak valid");
  return id;
}

function timestamp(value) {
  return Date.parse(String(value).replace(" ", "T") + "Z");
}

function publicState(row, now = Date.now()) {
  if (row.claim_state === "USED") return "USED";
  if (!row.active) return "UNAVAILABLE";
  if (now >= timestamp(row.ends_at)) return "EXPIRED";
  if (now < timestamp(row.starts_at)) return "UNAVAILABLE";
  if (row.quota !== null && Number(row.used_count) >= Number(row.quota))
    return "UNAVAILABLE";
  if (row.claim_state === "CLAIMED") return "CLAIMED";
  return "AVAILABLE";
}

function serialize(row) {
  return {
    ...row,
    id: Number(row.id),
    discount_value: Number(row.discount_value),
    minimum_order: Number(row.minimum_order),
    max_discount: row.max_discount === null ? null : Number(row.max_discount),
    quota: row.quota === null ? null : Number(row.quota),
    used_count: Number(row.used_count),
    claim_id: row.claim_id === null ? null : Number(row.claim_id),
    state: publicState(row),
  };
}

export function calculateVoucherDiscount(voucher, subtotal) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0)
    throw new DomainError("Subtotal tidak valid");
  const value = Number(voucher.discount_value);
  let discount;
  if (voucher.voucher_type === "PERCENT") {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100)
      throw new DomainError("Konfigurasi voucher persen tidak valid", 422);
    discount = Math.floor((subtotal * value) / 100);
    if (voucher.max_discount !== null)
      discount = Math.min(discount, Number(voucher.max_discount));
  } else if (voucher.voucher_type === "FIXED") {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new DomainError("Konfigurasi voucher nominal tidak valid", 422);
    discount = value;
  } else {
    throw new DomainError("Voucher tidak tersedia", 422);
  }
  return Math.min(subtotal, discount);
}

export async function listCustomerVouchers(user) {
  requiredMemberCustomer(user);
  const rows = await store.all(
    `SELECT ${promotionColumns},c.id claim_id,c.state claim_state,c.claimed_at,c.used_at
       FROM promotions p
       LEFT JOIN promo_claims c ON c.promotion_id=p.id AND c.customer_id=?
      WHERE p.voucher_type IS NOT NULL
      ORDER BY p.ends_at,p.id`,
    user.id,
  );
  return rows.map(serialize);
}

export async function claimVoucher(user, rawPromotionId) {
  requiredMemberCustomer(user);
  const id = promotionId(rawPromotionId);
  return store.transaction(async (tx, mysql) => {
    const customer = await tx.get(
      "SELECT id FROM users WHERE id=? AND role='CUSTOMER' AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!customer) throw new DomainError("Akun customer tidak aktif", 403);
    const voucher = await tx.get(
      `SELECT ${promotionColumns} FROM promotions p WHERE p.id=?` +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!voucher || !voucher.voucher_type)
      throw new DomainError("Voucher tidak ditemukan", 404);
    const existing = await tx.get(
      "SELECT id,state FROM promo_claims WHERE promotion_id=? AND customer_id=?" +
        (mysql ? " FOR UPDATE" : ""),
      id,
      user.id,
    );
    if (existing)
      return {
        claimId: Number(existing.id),
        state: existing.state,
        replayed: true,
      };
    const state = publicState(voucher);
    if (state !== "AVAILABLE")
      throw new DomainError(
        state === "EXPIRED"
          ? "Voucher sudah kedaluwarsa"
          : "Voucher tidak tersedia",
        409,
      );
    const result = await tx.run(
      "INSERT INTO promo_claims(promotion_id,customer_id) VALUES(?,?)",
      id,
      user.id,
    );
    return {
      claimId: Number(result.lastInsertRowid),
      state: "CLAIMED",
      replayed: false,
    };
  });
}

export async function validateClaimedVoucher(
  tx,
  mysql,
  customerId,
  rawPromotionId,
  subtotal,
  { paymentMethod = null, guest = false } = {},
) {
  if (rawPromotionId === null || rawPromotionId === undefined)
    return { promotionId: null, claimId: null, discount: 0 };
  const id = promotionId(rawPromotionId);
  const voucher = await tx.get(
    `SELECT ${promotionColumns},c.id claim_id,c.state claim_state,c.customer_id
       FROM promotions p
       LEFT JOIN promo_claims c ON c.promotion_id=p.id AND c.customer_id=?
      WHERE p.id=?` + (mysql ? " FOR UPDATE" : ""),
    customerId,
    id,
  );
  if (!voucher || !voucher.voucher_type)
    throw new DomainError("Voucher tidak ditemukan", 404);
  if (guest)
    throw new DomainError("Guest tidak dapat menggunakan voucher", 403);
  const method = String(paymentMethod || "").toUpperCase();
  if (
    ["CASH", "COD", "CASH_ON_DELIVERY"].includes(method) &&
    voucher.voucher_category !== "BIRTHDAY"
  )
    throw new DomainError(
      "Voucher reguler tidak berlaku untuk pembayaran COD",
      422,
    );
  if (!voucher.claim_id || Number(voucher.customer_id) !== Number(customerId))
    throw new DomainError("Voucher belum diklaim oleh akun ini", 403);
  if (voucher.claim_state === "USED")
    throw new DomainError("Voucher sudah digunakan", 409);
  const state = publicState(voucher);
  if (state === "EXPIRED")
    throw new DomainError("Voucher sudah kedaluwarsa", 409);
  if (state !== "CLAIMED") throw new DomainError("Voucher tidak tersedia", 409);
  if (subtotal < Number(voucher.minimum_order))
    throw new DomainError(
      `Minimum belanja voucher adalah Rp${Number(voucher.minimum_order).toLocaleString("id-ID")}`,
      422,
    );
  return {
    promotionId: Number(voucher.id),
    claimId: Number(voucher.claim_id),
    discount: calculateVoucherDiscount(voucher, subtotal),
    category: voucher.voucher_category,
  };
}

export async function quoteVoucher(user, input) {
  requiredMemberCustomer(user);
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 40
  )
    throw new DomainError("Keranjang tidak valid");
  return store.transaction(async (tx, mysql) => {
    let subtotal = 0;
    const seen = new Set();
    for (const item of input.items) {
      if (
        !Number.isSafeInteger(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99 ||
        seen.has(item.productId)
      )
        throw new DomainError("Item tidak valid");
      seen.add(item.productId);
      const product = await tx.get(
        "SELECT price FROM products WHERE id=? AND active=1 AND category_id IN (SELECT id FROM categories WHERE active=1)",
        item.productId,
      );
      if (!product) throw new DomainError("Produk tidak tersedia");
      subtotal += Number(product.price) * item.quantity;
    }
    if (!Number.isSafeInteger(subtotal))
      throw new DomainError("Total tidak valid");
    const voucher = await validateClaimedVoucher(
      tx,
      mysql,
      user.id,
      input.promotionId,
      subtotal,
      { paymentMethod: input.paymentMethod },
    );
    return {
      promotion_id: voucher.promotionId,
      subtotal,
      voucher_discount: voucher.discount,
      total_after_discount: subtotal - voucher.discount,
    };
  });
}

export async function redeemVoucher(tx, claimId, promotionId, orderId) {
  if (!claimId) return;
  const claim = await tx.run(
    "UPDATE promo_claims SET state='USED',order_id=?,used_at=CURRENT_TIMESTAMP WHERE id=? AND promotion_id=? AND state='CLAIMED' AND order_id IS NULL",
    orderId,
    claimId,
    promotionId,
  );
  if (claim.changes !== 1)
    throw new DomainError("Voucher sudah digunakan", 409);
  const promotion = await tx.run(
    "UPDATE promotions SET used_count=used_count+1 WHERE id=? AND (quota IS NULL OR used_count<quota)",
    promotionId,
  );
  if (promotion.changes !== 1)
    throw new DomainError("Kuota voucher sudah habis", 409);
}

export async function restoreVoucherForOrder(tx, mysql, order) {
  if (!order.promo_claim_id || !order.promotion_id) return false;
  const claim = await tx.get(
    "SELECT id,state,order_id FROM promo_claims WHERE id=? AND promotion_id=?" +
      (mysql ? " FOR UPDATE" : ""),
    order.promo_claim_id,
    order.promotion_id,
  );
  if (
    !claim ||
    claim.state !== "USED" ||
    Number(claim.order_id) !== Number(order.id)
  )
    return false;
  const restored = await tx.run(
    "UPDATE promo_claims SET state='CLAIMED',order_id=NULL,used_at=NULL WHERE id=? AND state='USED' AND order_id=?",
    claim.id,
    order.id,
  );
  if (!restored.changes) return false;
  await tx.run(
    "UPDATE promotions SET used_count=used_count-1 WHERE id=? AND used_count>0",
    order.promotion_id,
  );
  return true;
}
