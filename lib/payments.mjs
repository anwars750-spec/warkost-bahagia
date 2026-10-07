import crypto from "node:crypto";
import * as store from "./store.mjs";
import {
  commitOrderStock,
  DomainError,
  required,
  requiredCapability,
} from "./domain.mjs";
import { awardOrderPoints, restoreRedeemedPoints } from "./loyalty.mjs";
import { restoreVoucherForOrder } from "./vouchers.mjs";
import { enqueueOrderPrintJobs } from "./print-queue.mjs";
import { verifyProviderWebhook } from "./payment-provider.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const PAYMENT_COLUMNS =
  "p.id,p.order_id,p.method,p.status,p.amount,p.provider,p.provider_reference,p.transaction_reference,p.qr_payload,p.payment_url,p.paid_at,p.failed_at,p.expired_at,p.expires_at," +
  "o.status order_status,o.customer_id,o.subtotal,o.voucher_discount,o.loyalty_discount,o.promotion_id,o.promo_claim_id,o.loyalty_reward_rule_id,o.loyalty_points_redeemed";

function publicPayment(payment) {
  return {
    id: Number(payment.id),
    order_id: Number(payment.order_id),
    method: payment.method,
    status: payment.status,
    amount: Number(payment.amount),
    provider_reference: payment.provider_reference,
    transaction_reference: payment.transaction_reference,
    qr_payload: payment.qr_payload,
    payment_url: payment.payment_url,
    paid_at: payment.paid_at,
    failed_at: payment.failed_at,
    expired_at: payment.expired_at,
    expires_at: payment.expires_at,
  };
}

async function paymentRow(tx, mysql, where, value) {
  return tx.get(
    `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${where}` +
      (mysql ? " FOR UPDATE" : ""),
    value,
  );
}

async function releasePendingOrderBenefits(tx, mysql, payment) {
  await tx.run(
    "UPDATE stock_reservations SET status='RELEASED',released_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'",
    payment.order_id,
  );
  await restoreVoucherForOrder(tx, mysql, {
    id: payment.order_id,
    promotion_id: payment.promotion_id,
    promo_claim_id: payment.promo_claim_id,
  });
  await restoreRedeemedPoints(tx, mysql, {
    id: payment.order_id,
    customer_id: payment.customer_id,
  });
}

async function printerSimulation(tx) {
  return (
    (
      await tx.get(
        "SELECT value FROM settings WHERE `key`='printer_simulation'",
      )
    )?.value !== "false"
  );
}

async function applyPaymentStatus(tx, mysql, payment, status, context = {}) {
  if (payment.status === status)
    return { payment: publicPayment(payment), replayed: true };
  if (payment.status !== "PENDING")
    throw new DomainError(
      payment.status === "EXPIRED" && status === "PAID"
        ? "Pembayaran kedaluwarsa tidak dapat diaktifkan kembali"
        : "Status pembayaran tidak dapat diubah",
      409,
    );
  if (
    status === "PAID" &&
    payment.expires_at &&
    Date.parse(String(payment.expires_at).replace(" ", "T") + "Z") <= Date.now()
  )
    throw new DomainError(
      "Pembayaran sudah melewati batas waktu dan tidak dapat dilunasi",
      409,
    );
  if (status === "PAID" && payment.method === "QRIS") {
    if (!context.providerReference)
      throw new DomainError("Referensi provider wajib untuk QRIS PAID", 422);
    if (
      payment.provider_reference &&
      payment.provider_reference !== context.providerReference
    )
      throw new DomainError("Referensi provider tidak cocok", 409);
  }
  const changed = await tx.run(
    `UPDATE payments
        SET status=?,
            provider_reference=COALESCE(provider_reference,?),
            paid_at=CASE WHEN ?='PAID' THEN CURRENT_TIMESTAMP ELSE paid_at END,
            failed_at=CASE WHEN ?='FAILED' THEN CURRENT_TIMESTAMP ELSE failed_at END,
            expired_at=CASE WHEN ?='EXPIRED' THEN CURRENT_TIMESTAMP ELSE expired_at END,
            updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='PENDING'`,
    status,
    context.providerReference || null,
    status,
    status,
    status,
    payment.id,
  );
  if (!changed.changes)
    throw new DomainError("Status pembayaran berubah, silakan muat ulang", 409);

  if (status === "PAID") {
    await commitOrderStock(tx, mysql, payment.order_id, null);
    await enqueueOrderPrintJobs(
      tx,
      payment.order_id,
      null,
      await printerSimulation(tx),
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      payment.customer_id,
      `Pembayaran pesanan #${payment.order_id} berhasil`,
    );
    if (payment.order_status === "DELIVERED")
      await awardOrderPoints(tx, mysql, {
        id: payment.order_id,
        customer_id: payment.customer_id,
        status: payment.order_status,
        subtotal: payment.subtotal,
        voucher_discount: payment.voucher_discount,
        loyalty_discount: payment.loyalty_discount,
      });
  } else {
    await releasePendingOrderBenefits(tx, mysql, payment);
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      payment.customer_id,
      status === "FAILED"
        ? `Pembayaran pesanan #${payment.order_id} gagal`
        : `Waktu pembayaran pesanan #${payment.order_id} telah habis`,
    );
  }
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(NULL,?,?)",
    `PAYMENT_${status}`,
    JSON.stringify({
      orderId: Number(payment.order_id),
      provider: payment.provider,
      providerReference: context.providerReference || null,
      eventId: context.eventId || null,
    }),
  );
  const updated = await paymentRow(tx, mysql, "p.id=?", payment.id);
  return { payment: publicPayment(updated), replayed: false };
}

export async function processTrustedProviderEvent(event) {
  if (!event?.trusted)
    throw new DomainError("Event provider belum terverifikasi", 401);
  if (
    !event.provider ||
    !event.eventId ||
    !event.transactionReference ||
    !["PAID", "FAILED", "EXPIRED"].includes(event.status)
  )
    throw new DomainError("Event pembayaran tidak valid", 422);
  return store.transaction(async (tx, mysql) => {
    const payment = await paymentRow(
      tx,
      mysql,
      "p.transaction_reference=?",
      event.transactionReference,
    );
    if (!payment || payment.method !== "QRIS")
      throw new DomainError("Pembayaran QRIS tidak ditemukan", 404);
    if (payment.provider !== event.provider)
      throw new DomainError("Provider pembayaran tidak cocok", 409);
    const recorded = await tx.run(
      "INSERT OR IGNORE INTO payment_provider_events(provider,event_id,payment_id,event_type,payload_hash) VALUES(?,?,?,?,?)",
      event.provider,
      event.eventId,
      payment.id,
      event.status,
      event.payloadHash,
    );
    if (!recorded.changes)
      return { payment: publicPayment(payment), replayed: true };
    return applyPaymentStatus(tx, mysql, payment, event.status, {
      providerReference: event.providerReference,
      eventId: event.eventId,
    });
  });
}

export async function processPaymentWebhook(rawBody, signature) {
  const verification = verifyProviderWebhook(rawBody, signature);
  if (!verification.valid)
    throw new DomainError(
      verification.reason || "Webhook tidak tepercaya",
      401,
    );
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new DomainError("Payload webhook tidak valid", 400);
  }
  return processTrustedProviderEvent({
    trusted: true,
    provider: verification.provider,
    eventId: String(payload.event_id || ""),
    transactionReference: String(payload.transaction_reference || ""),
    providerReference: String(payload.provider_reference || ""),
    status: String(payload.status || "").toUpperCase(),
    payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
  });
}

export async function getPaymentStatus(user, orderId) {
  required(user, ["CUSTOMER", "ADMIN", "OWNER"]);
  if (!Number.isSafeInteger(orderId) || orderId < 1)
    throw new DomainError("Order tidak valid");
  await expirePendingPayments();
  const payment = await store.get(
    `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.order_id=?`,
    orderId,
  );
  if (!payment) throw new DomainError("Pembayaran tidak ditemukan", 404);
  if (user.role === "CUSTOMER" && Number(payment.customer_id) !== user.id)
    throw new DomainError("Akses ditolak", 403);
  return publicPayment(payment);
}

export async function verifyPayment(user, orderId, status) {
  requiredCapability(user, CAPABILITIES.PAYMENTS_VERIFY);
  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    !["PAID", "FAILED"].includes(status)
  )
    throw new DomainError("Verifikasi pembayaran tidak valid");
  return store.transaction(async (tx, mysql) => {
    const payment = await paymentRow(tx, mysql, "p.order_id=?", orderId);
    if (!payment) throw new DomainError("Pembayaran tidak ditemukan", 404);
    if (payment.method === "QRIS")
      throw new DomainError(
        "QRIS hanya dapat diverifikasi melalui callback provider tepercaya",
        403,
      );
    if (
      payment.order_status === "CANCELLED" ||
      !["UNPAID", "PENDING"].includes(payment.status)
    )
      throw new DomainError("Pembayaran tidak dapat diverifikasi");
    if (payment.method === "CASH")
      throw new DomainError(
        "Pembayaran COD hanya dapat dilunasi melalui verifikasi setoran setelah pesanan selesai",
        409,
      );
    await tx.run(
      "UPDATE payments SET status=?,verified_by=?,paid_at=CASE WHEN ?='PAID' THEN CURRENT_TIMESTAMP ELSE NULL END,failed_at=CASE WHEN ?='FAILED' THEN CURRENT_TIMESTAMP ELSE failed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      status,
      user.id,
      status,
      status,
      payment.id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PAYMENT_VERIFIED",
      JSON.stringify({ orderId, status }),
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      payment.customer_id,
      `Pembayaran pesanan #${orderId} ${status === "PAID" ? "telah dikonfirmasi" : "gagal diverifikasi"}`,
    );
    if (status === "FAILED")
      await releasePendingOrderBenefits(tx, mysql, payment);
    if (status === "PAID" && payment.order_status === "DELIVERED")
      await awardOrderPoints(tx, mysql, {
        id: orderId,
        customer_id: payment.customer_id,
        status: payment.order_status,
        subtotal: payment.subtotal,
        voucher_discount: payment.voucher_discount,
        loyalty_discount: payment.loyalty_discount,
      });
    return { orderId, status };
  });
}

export async function expirePendingPayments() {
  const due = await store.all(
    "SELECT id FROM payments WHERE status='PENDING' AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP ORDER BY id",
  );
  let changed = 0;
  for (const item of due) {
    const result = await store.transaction(async (tx, mysql) => {
      const payment = await paymentRow(tx, mysql, "p.id=?", item.id);
      if (!payment || payment.status !== "PENDING") return false;
      await applyPaymentStatus(tx, mysql, payment, "EXPIRED", {
        eventId: `system-expiry-${payment.id}-${payment.expires_at}`,
      });
      return true;
    });
    if (result) changed += 1;
  }
  return changed;
}
