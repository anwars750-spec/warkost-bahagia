import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { awardOrderPoints } from "./loyalty.mjs";
import { getCodBatch, submitCodBatch } from "./cod-settlement-batches.mjs";
import {
  recordAdminBatchReceipt,
  requireActiveAdminShift,
} from "./admin-cash-control.mjs";

function positiveId(value, label = "ID") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

function serialize(row, items = [], replayed = false) {
  return {
    id: Number(row.id),
    driver: { id: Number(row.driver_id), name: row.driver_name },
    expected_amount: Number(row.expected_amount),
    submitted_amount: Number(row.submitted_amount),
    discrepancy_amount: Number(row.discrepancy_amount),
    status: row.status,
    evidence_reference: row.evidence_reference || null,
    submitted_at: row.submitted_at || null,
    admin_verifier_id:
      row.admin_verifier_id == null ? null : Number(row.admin_verifier_id),
    admin_verifier_name: row.admin_verifier_name || null,
    verified_at: row.verified_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    order_count: items.length,
    orders: items.map((item) => ({
      order_id: Number(item.order_id),
      display_number: `WB${String(item.order_id).padStart(6, "0")}`,
      settlement_id: Number(item.settlement_id),
      customer: item.customer_name,
      address: item.address,
      expected_amount: Number(item.expected_amount),
      order_status: item.order_status,
      payment_status: item.payment_status,
      settlement_status: item.settlement_status,
    })),
    replayed,
  };
}

async function detail(tx, mysql, batchId, lock = false) {
  const row = await tx.get(
    `SELECT b.*,d.name driver_name,d.role driver_role,d.active driver_active,
            a.name admin_verifier_name
       FROM cod_settlement_batches b
       JOIN users d ON d.id=b.driver_id
       LEFT JOIN users a ON a.id=b.admin_verifier_id
      WHERE b.id=?${lock && mysql ? " FOR UPDATE" : ""}`,
    batchId,
  );
  if (!row) throw new DomainError("Batch setoran COD tidak ditemukan", 404);
  const items = await tx.all(
    `SELECT i.batch_id,i.order_id,i.settlement_id,i.expected_amount,
            o.status order_status,o.customer_id,o.subtotal,o.voucher_discount,
            o.loyalty_discount,o.total,u.name customer_name,a.detail address,
            p.method,p.status payment_status,p.amount payment_amount,
            s.status settlement_status,s.driver_id settlement_driver_id
       FROM cod_settlement_batch_items i
       JOIN orders o ON o.id=i.order_id
       JOIN users u ON u.id=o.customer_id
       JOIN addresses a ON a.id=o.address_id
       JOIN payments p ON p.order_id=o.id
       JOIN cod_settlements s ON s.id=i.settlement_id
      WHERE i.batch_id=?
      ORDER BY i.order_id${lock && mysql ? " FOR UPDATE" : ""}`,
    batchId,
  );
  return { row, items };
}

async function auditBatch(tx, user, action, row, items, extra = {}) {
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    action,
    JSON.stringify({
      actorRole: user.role,
      batchId: Number(row.id),
      driverId: Number(row.driver_id),
      orderIds: items.map((item) => Number(item.order_id)),
      expectedAmount: Number(row.expected_amount),
      submittedAmount: Number(row.submitted_amount),
      discrepancyAmount: Number(row.discrepancy_amount),
      ...extra,
    }),
  );
}

export async function submitCodBatchCashHandover(user, input) {
  const result = await submitCodBatch(user, input);
  if (
    result.status !== "NEEDS_REVIEW" ||
    Number(result.submitted_amount) < Number(result.expected_amount)
  )
    return result;

  await store.transaction(async (tx, mysql) => {
    const { row, items } = await detail(tx, mysql, result.id, true);
    if (
      row.status === "NEEDS_REVIEW" &&
      Number(row.submitted_amount) >= Number(row.expected_amount)
    ) {
      await tx.run(
        `UPDATE cod_settlement_batches
            SET status='SUBMITTED',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='NEEDS_REVIEW'`,
        row.id,
      );
      const refreshed = await detail(tx, mysql, result.id);
      await auditBatch(
        tx,
        user,
        "BATCH_OVERAGE_ACCEPTED",
        refreshed.row,
        refreshed.items,
        { overageAmount: Number(row.submitted_amount) - Number(row.expected_amount) },
      );
    }
  });
  return getCodBatch(user, result.id);
}

export async function verifyCodBatchWithOperator(user, rawBatchId) {
  if (!user || user.role !== "ADMIN") throw new DomainError("Akses ditolak", 403);
  const batchId = positiveId(rawBatchId, "Batch");

  return store.transaction(async (tx, mysql) => {
    const { row, items } = await detail(tx, mysql, batchId, true);

    if (row.status === "VERIFIED") {
      if (
        items.length > 0 &&
        items.every(
          (item) =>
            item.payment_status === "PAID" &&
            item.settlement_status === "VERIFIED",
        )
      )
        return serialize(row, items, true);
      throw new DomainError("Batch terverifikasi tidak konsisten", 409);
    }

    if (row.status !== "SUBMITTED")
      throw new DomainError("Batch belum siap diverifikasi", 409);
    if (row.driver_role !== "DRIVER" || !Number(row.driver_active))
      throw new DomainError("Driver batch tidak lagi valid", 409);
    if (Number(row.submitted_amount) < Number(row.expected_amount))
      throw new DomainError("Setoran kurang tidak dapat diterima Admin", 409);
    if (!items.length) throw new DomainError("Batch tidak memiliki pesanan", 409);

    const shift = await requireActiveAdminShift(tx, mysql, user);

    let authoritativeTotal = 0;
    for (const item of items) {
      const expected = Number(item.expected_amount);
      authoritativeTotal += Number(item.total);
      if (
        item.order_status !== "DELIVERED" ||
        item.method !== "CASH" ||
        !["UNPAID", "PENDING"].includes(item.payment_status) ||
        item.settlement_status === "VERIFIED" ||
        Number(item.settlement_driver_id) !== Number(row.driver_id) ||
        Number(item.total) !== expected ||
        Number(item.payment_amount) !== expected
      )
        throw new DomainError(
          `Pesanan #${Number(item.order_id)} tidak lagi valid untuk batch`,
          409,
        );
    }
    if (authoritativeTotal !== Number(row.expected_amount))
      throw new DomainError("Total batch tidak konsisten", 409);

    const verified = await tx.run(
      `UPDATE cod_settlement_batches
          SET status='VERIFIED',admin_verifier_id=?,
              verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='SUBMITTED'`,
      user.id,
      batchId,
    );
    if (!verified.changes)
      throw new DomainError("Status batch berubah, silakan muat ulang", 409);

    for (const item of items) {
      const settlement = await tx.run(
        `UPDATE cod_settlements
            SET status='VERIFIED',cash_amount=expected_amount,
                discrepancy_amount=0,admin_verifier_id=?,
                verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status!='VERIFIED'`,
        user.id,
        item.settlement_id,
      );
      if (!settlement.changes)
        throw new DomainError(
          `Settlement pesanan #${Number(item.order_id)} berubah`,
          409,
        );

      const payment = await tx.run(
        `UPDATE payments
            SET status='PAID',verified_by=?,paid_at=CURRENT_TIMESTAMP,
                updated_at=CURRENT_TIMESTAMP
          WHERE order_id=? AND method='CASH' AND status IN('UNPAID','PENDING')`,
        user.id,
        item.order_id,
      );
      if (!payment.changes)
        throw new DomainError(
          `Pembayaran pesanan #${Number(item.order_id)} berubah`,
          409,
        );

      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "PAYMENT_PAID",
        JSON.stringify({
          actorRole: user.role,
          shiftId: shift.id,
          operatorId: shift.operator_id,
          operatorName: shift.operator_name,
          batchId,
          orderId: Number(item.order_id),
          settlementId: Number(item.settlement_id),
          expectedAmount: Number(item.expected_amount),
          paymentStatus: "PAID",
        }),
      );

      for (const action of ["COD_SETTLEMENT_VERIFIED", "COD_SETTLEMENT_CLOSED"])
        await tx.run(
          "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
          user.id,
          action,
          JSON.stringify({
            actorRole: user.role,
            shiftId: shift.id,
            operatorId: shift.operator_id,
            operatorName: shift.operator_name,
            batchId,
            orderId: Number(item.order_id),
            settlementId: Number(item.settlement_id),
            driverId: Number(row.driver_id),
            expectedAmount: Number(item.expected_amount),
          }),
        );

      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        item.customer_id,
        `Pembayaran COD pesanan #${Number(item.order_id)} telah dikonfirmasi`,
      );
      await awardOrderPoints(tx, mysql, {
        id: Number(item.order_id),
        customer_id: Number(item.customer_id),
        status: item.order_status,
        subtotal: Number(item.subtotal),
        voucher_discount: Number(item.voucher_discount || 0),
        loyalty_discount: Number(item.loyalty_discount || 0),
      });
    }

    await recordAdminBatchReceipt(tx, user, shift, row);

    const completed = await detail(tx, mysql, batchId);
    await auditBatch(
      tx,
      user,
      "BATCH_VERIFIED",
      completed.row,
      completed.items,
      {
        shiftId: shift.id,
        operatorId: shift.operator_id,
        operatorName: shift.operator_name,
        overageAmount: Math.max(
          Number(row.submitted_amount) - Number(row.expected_amount),
          0,
        ),
      },
    );
    await auditBatch(tx, user, "BATCH_CLOSED", completed.row, completed.items, {
      shiftId: shift.id,
      operatorId: shift.operator_id,
      operatorName: shift.operator_name,
    });
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      row.driver_id,
      `Batch setoran COD #${batchId} telah diterima ${shift.operator_name}`,
    );

    return serialize(completed.row, completed.items);
  });
}
