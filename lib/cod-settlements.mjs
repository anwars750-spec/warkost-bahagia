import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { awardOrderPoints } from "./loyalty.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const SETTLEMENT_COLUMNS = `
  s.*,o.status order_status,o.customer_id,o.subtotal,o.voucher_discount,
  o.loyalty_discount,p.method,p.status payment_status,p.amount payment_amount,
  d.driver_id assigned_driver_id,d.delivered_at
`;

function validOrderId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function publicSettlement(row, replayed = false) {
  return {
    id: Number(row.id),
    order_id: Number(row.order_id),
    driver_id: Number(row.driver_id),
    expected_amount: Number(row.expected_amount),
    cash_amount: row.cash_amount == null ? null : Number(row.cash_amount),
    evidence_reference: row.evidence_reference || null,
    submitted_at: row.submitted_at || null,
    admin_verifier_id:
      row.admin_verifier_id == null ? null : Number(row.admin_verifier_id),
    verified_at: row.verified_at || null,
    status: row.status,
    discrepancy_amount: Number(row.discrepancy_amount || 0),
    payment_status: row.payment_status,
    replayed,
  };
}

async function settlementRow(tx, mysql, orderId) {
  return tx.get(
    `SELECT ${SETTLEMENT_COLUMNS}
       FROM cod_settlements s
       JOIN orders o ON o.id=s.order_id
       JOIN payments p ON p.order_id=o.id
       JOIN deliveries d ON d.order_id=o.id
      WHERE s.order_id=?${mysql ? " FOR UPDATE" : ""}`,
    orderId,
  );
}

async function audit(tx, user, action, row, extra = {}) {
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    action,
    JSON.stringify({
      actorRole: user.role,
      settlementId: Number(row.id),
      orderId: Number(row.order_id),
      driverId: Number(row.driver_id),
      expectedAmount: Number(row.expected_amount),
      cashAmount: row.cash_amount == null ? null : Number(row.cash_amount),
      ...extra,
    }),
  );
}

export async function submitCodSettlement(user, input) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  const orderId = Number(input?.orderId);
  const cashAmount = Number(input?.cashAmount);
  const evidenceReference = String(input?.evidenceReference || "").trim();
  if (!validOrderId(orderId)) throw new DomainError("Order tidak valid");
  if (!Number.isSafeInteger(cashAmount) || cashAmount < 0)
    throw new DomainError("Jumlah setoran tunai tidak valid");
  if (evidenceReference.length > 191)
    throw new DomainError("Referensi bukti maksimal 191 karakter");

  return store.transaction(async (tx, mysql) => {
    const row = await settlementRow(tx, mysql, orderId);
    if (!row) throw new DomainError("Setoran COD belum tersedia", 404);
    if (row.method !== "CASH")
      throw new DomainError("Pesanan bukan pembayaran COD", 409);
    if (
      Number(row.assigned_driver_id) !== user.id ||
      Number(row.driver_id) !== user.id
    )
      throw new DomainError(
        "Setoran hanya dapat dilakukan driver terkait",
        403,
      );
    if (row.order_status !== "DELIVERED" || !row.delivered_at)
      throw new DomainError(
        "Setoran hanya dapat dilakukan setelah pesanan selesai",
        409,
      );
    if (row.status === "VERIFIED")
      throw new DomainError("Setoran terverifikasi tidak dapat diubah", 409);
    if (row.status === "SUBMITTED") {
      if (
        Number(row.cash_amount) === cashAmount &&
        String(row.evidence_reference || "") === evidenceReference
      )
        return publicSettlement(row, true);
      throw new DomainError("Setoran sedang menunggu verifikasi Admin", 409);
    }
    if (!["AWAITING_COD_SETTLEMENT", "NEEDS_REVIEW"].includes(row.status))
      throw new DomainError("Status setoran tidak dapat diubah", 409);

    await tx.run(
      `UPDATE cod_settlements
          SET cash_amount=?,evidence_reference=?,submitted_at=CURRENT_TIMESTAMP,
              admin_verifier_id=NULL,verified_at=NULL,status='SUBMITTED',
              discrepancy_amount=0,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      cashAmount,
      evidenceReference || null,
      row.id,
    );
    const updated = await settlementRow(tx, mysql, orderId);
    await audit(tx, user, "COD_CASH_SUBMITTED", updated, {
      submittedAt: updated.submitted_at,
    });
    return publicSettlement(updated);
  });
}

export async function verifyCodSettlement(user, orderId) {
  requiredCapability(user, CAPABILITIES.PAYMENTS_VERIFY);
  if (!validOrderId(orderId)) throw new DomainError("Order tidak valid");

  return store.transaction(async (tx, mysql) => {
    const row = await settlementRow(tx, mysql, orderId);
    if (!row) throw new DomainError("Setoran COD belum tersedia", 404);
    if (row.method !== "CASH")
      throw new DomainError("Pesanan bukan pembayaran COD", 409);
    if (row.order_status !== "DELIVERED" || !row.delivered_at)
      throw new DomainError(
        "Setoran belum dapat diverifikasi sebelum pesanan selesai",
        409,
      );
    if (row.status === "VERIFIED" && row.payment_status === "PAID")
      return publicSettlement(row, true);
    if (row.status === "NEEDS_REVIEW") return publicSettlement(row, true);
    if (row.status !== "SUBMITTED" || row.cash_amount == null)
      throw new DomainError("Setoran tunai belum dikirim driver", 409);
    if (!["UNPAID", "PENDING"].includes(row.payment_status))
      throw new DomainError(
        "Status pembayaran COD tidak dapat diverifikasi",
        409,
      );

    const discrepancy = Number(row.cash_amount) - Number(row.expected_amount);
    if (discrepancy !== 0) {
      await tx.run(
        `UPDATE cod_settlements
            SET status='NEEDS_REVIEW',discrepancy_amount=?,admin_verifier_id=?,
                verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='SUBMITTED'`,
        discrepancy,
        user.id,
        row.id,
      );
      const updated = await settlementRow(tx, mysql, orderId);
      await audit(tx, user, "COD_SETTLEMENT_DISCREPANCY", updated, {
        discrepancyAmount: discrepancy,
        verifiedAt: updated.verified_at,
      });
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        row.driver_id,
        `Setoran COD pesanan #${orderId} perlu diperbaiki (${discrepancy < 0 ? "kurang" : "lebih"} ${Math.abs(discrepancy)})`,
      );
      return publicSettlement(updated);
    }

    const settled = await tx.run(
      `UPDATE cod_settlements
          SET status='VERIFIED',discrepancy_amount=0,admin_verifier_id=?,
              verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='SUBMITTED'`,
      user.id,
      row.id,
    );
    if (!settled.changes)
      throw new DomainError("Status setoran berubah, silakan muat ulang", 409);
    const paid = await tx.run(
      `UPDATE payments
          SET status='PAID',verified_by=?,paid_at=CURRENT_TIMESTAMP,
              updated_at=CURRENT_TIMESTAMP
        WHERE order_id=? AND method='CASH' AND status IN('UNPAID','PENDING')`,
      user.id,
      orderId,
    );
    if (!paid.changes)
      throw new DomainError("Pembayaran COD tidak dapat diselesaikan", 409);

    const updated = await settlementRow(tx, mysql, orderId);
    await audit(tx, user, "COD_SETTLEMENT_VERIFIED", updated, {
      discrepancyAmount: 0,
      verifiedAt: updated.verified_at,
    });
    await audit(tx, user, "COD_SETTLEMENT_CLOSED", updated, {
      verifiedAt: updated.verified_at,
    });
    await audit(tx, user, "PAYMENT_PAID", updated, {
      paymentStatus: "PAID",
      verifiedAt: updated.verified_at,
    });
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      row.customer_id,
      `Pembayaran COD pesanan #${orderId} telah dikonfirmasi`,
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      row.driver_id,
      `Setoran COD pesanan #${orderId} telah diverifikasi`,
    );
    await awardOrderPoints(tx, mysql, {
      id: orderId,
      customer_id: row.customer_id,
      status: row.order_status,
      subtotal: row.subtotal,
      voucher_discount: row.voucher_discount,
      loyalty_discount: row.loyalty_discount,
    });
    return publicSettlement(updated);
  });
}
