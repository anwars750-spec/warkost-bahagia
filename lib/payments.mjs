import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import { awardOrderPoints } from "./loyalty.mjs";
export async function verifyPayment(user, orderId, status) {
  required(user, ["ADMIN"]);
  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    !["PAID", "FAILED"].includes(status)
  )
    throw new DomainError("Verifikasi pembayaran tidak valid");
  return store.transaction(async (tx, mysql) => {
    const payment = await tx.get(
      "SELECT p.id,p.status,o.status order_status,o.customer_id,o.subtotal,o.voucher_discount,o.loyalty_discount FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.order_id=?" +
        (mysql ? " FOR UPDATE" : ""),
      orderId,
    );
    if (!payment) throw new DomainError("Pembayaran tidak ditemukan", 404);
    if (
      payment.order_status === "CANCELLED" ||
      !["UNPAID", "PENDING"].includes(payment.status)
    )
      throw new DomainError("Pembayaran tidak dapat diverifikasi");
    await tx.run(
      "UPDATE payments SET status=?,verified_by=?,paid_at=CASE WHEN ?='PAID' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?",
      status,
      user.id,
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
  return store.transaction(async (tx) => {
    const expired = await tx.all(
      "SELECT p.id,p.order_id,o.customer_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='PENDING' AND p.expires_at IS NOT NULL AND p.expires_at<=CURRENT_TIMESTAMP",
    );
    for (const payment of expired) {
      const changed = await tx.run(
        "UPDATE payments SET status='EXPIRED' WHERE id=? AND status='PENDING'",
        payment.id,
      );
      if (!changed.changes) continue;
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(NULL,?,?)",
        "PAYMENT_EXPIRED",
        JSON.stringify({ orderId: payment.order_id }),
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        payment.customer_id,
        `Waktu pembayaran pesanan #${payment.order_id} telah habis`,
      );
    }
    return expired.length;
  });
}
