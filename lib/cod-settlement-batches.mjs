import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { awardOrderPoints } from "./loyalty.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const ACTIVE_BATCH_STATUSES = ["SUBMITTED", "NEEDS_REVIEW"];

function positiveId(value, label = "ID") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

function cashAmount(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new DomainError("Jumlah setoran tunai tidak valid");
  return number;
}

function evidenceReference(value) {
  const reference = String(value || "").trim();
  if (reference.length > 191)
    throw new DomainError("Referensi bukti maksimal 191 karakter");
  return reference || null;
}

function displayNumber(orderId) {
  return `WB${String(orderId).padStart(6, "0")}`;
}

function serializeBatch(row, items = [], replayed = false) {
  return {
    id: Number(row.id),
    driver: {
      id: Number(row.driver_id),
      name: row.driver_name,
    },
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
      display_number: displayNumber(item.order_id),
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

async function batchHeader(tx, mysql, batchId, lock = false) {
  return tx.get(
    `SELECT b.*,d.name driver_name,d.role driver_role,d.active driver_active,
            a.name admin_verifier_name
       FROM cod_settlement_batches b
       JOIN users d ON d.id=b.driver_id
       LEFT JOIN users a ON a.id=b.admin_verifier_id
      WHERE b.id=?${lock && mysql ? " FOR UPDATE" : ""}`,
    batchId,
  );
}

async function batchItems(tx, batchId, lock = false, mysql = false) {
  return tx.all(
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
}

async function batchDetail(tx, mysql, batchId, { lock = false } = {}) {
  const row = await batchHeader(tx, mysql, batchId, lock);
  if (!row) throw new DomainError("Batch setoran COD tidak ditemukan", 404);
  const items = await batchItems(tx, batchId, lock, mysql);
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

async function lockDriver(tx, mysql, driverId) {
  const driver = await tx.get(
    `SELECT id,name FROM users WHERE id=? AND role='DRIVER' AND active=1${mysql ? " FOR UPDATE" : ""}`,
    driverId,
  );
  if (!driver) throw new DomainError("Driver tidak aktif", 409);
  return driver;
}

async function openBatchForDriver(tx, mysql, driverId, lock = false) {
  return tx.get(
    `SELECT id FROM cod_settlement_batches
      WHERE driver_id=? AND status IN ('SUBMITTED','NEEDS_REVIEW')
      ORDER BY id DESC LIMIT 1${lock && mysql ? " FOR UPDATE" : ""}`,
    driverId,
  );
}

async function eligibleRows(tx, mysql, driverId, lock = false) {
  return tx.all(
    `SELECT o.id order_id,o.total,u.name customer_name,a.detail address,
            p.amount payment_amount,p.status payment_status,
            s.id settlement_id,s.expected_amount settlement_expected_amount,
            s.status settlement_status
       FROM orders o
       JOIN deliveries d ON d.order_id=o.id
       JOIN payments p ON p.order_id=o.id
       JOIN cod_settlements s ON s.order_id=o.id
       JOIN users u ON u.id=o.customer_id
       JOIN addresses a ON a.id=o.address_id
      WHERE d.driver_id=?
        AND s.driver_id=d.driver_id
        AND o.status='DELIVERED'
        AND d.delivered_at IS NOT NULL
        AND p.method='CASH'
        AND p.status IN ('UNPAID','PENDING')
        AND s.status!='VERIFIED'
        AND NOT EXISTS (
          SELECT 1 FROM cod_settlement_batch_items bi WHERE bi.order_id=o.id
        )
      ORDER BY o.id${lock && mysql ? " FOR UPDATE" : ""}`,
    driverId,
  );
}

async function excludedQris(tx, driverId) {
  const result = await tx.get(
    `SELECT COUNT(*) order_count,COALESCE(SUM(p.amount),0) amount
       FROM orders o
       JOIN deliveries d ON d.order_id=o.id
       JOIN payments p ON p.order_id=o.id
      WHERE d.driver_id=? AND o.status='DELIVERED' AND p.method='QRIS'`,
    driverId,
  );
  return {
    order_count: Number(result?.order_count || 0),
    amount: Number(result?.amount || 0),
  };
}

function assertAuthoritativeAmounts(rows) {
  for (const row of rows) {
    const orderTotal = Number(row.total);
    if (
      !Number.isSafeInteger(orderTotal) ||
      orderTotal < 0 ||
      Number(row.payment_amount) !== orderTotal ||
      Number(row.settlement_expected_amount) !== orderTotal
    )
      throw new DomainError(
        `Nominal COD pesanan #${Number(row.order_id)} tidak konsisten`,
        409,
      );
  }
}

export async function getDriverCodBatch(user) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  return store.transaction(async (tx, mysql) => {
    await lockDriver(tx, mysql, user.id);
    const open = await openBatchForDriver(tx, mysql, user.id);
    const qrisExcluded = await excludedQris(tx, user.id);
    if (open) {
      const { row, items } = await batchDetail(tx, mysql, open.id);
      return {
        current_batch: serializeBatch(row, items),
        eligible_orders: [],
        eligible_expected_amount: 0,
        qris_excluded: qrisExcluded,
      };
    }
    const eligible = await eligibleRows(tx, mysql, user.id);
    assertAuthoritativeAmounts(eligible);
    return {
      current_batch: null,
      eligible_orders: eligible.map((item) => ({
        order_id: Number(item.order_id),
        display_number: displayNumber(item.order_id),
        customer: item.customer_name,
        address: item.address,
        expected_amount: Number(item.total),
        payment_status: item.payment_status,
      })),
      eligible_expected_amount: eligible.reduce(
        (sum, item) => sum + Number(item.total),
        0,
      ),
      qris_excluded: qrisExcluded,
    };
  });
}

export async function submitCodBatch(user, input) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  const submittedAmount = cashAmount(input?.cashAmount);
  const reference = evidenceReference(input?.evidenceReference);

  return store.transaction(async (tx, mysql) => {
    await lockDriver(tx, mysql, user.id);
    const open = await openBatchForDriver(tx, mysql, user.id, true);
    if (open) {
      const { row, items } = await batchDetail(tx, mysql, open.id, {
        lock: true,
      });
      if (row.status === "SUBMITTED") {
        if (
          Number(row.submitted_amount) === submittedAmount &&
          String(row.evidence_reference || "") === String(reference || "")
        )
          return serializeBatch(row, items, true);
        throw new DomainError("Batch sedang menunggu verifikasi Admin", 409);
      }
      if (row.status !== "NEEDS_REVIEW")
        throw new DomainError("Status batch tidak dapat diubah", 409);
      const discrepancy = submittedAmount - Number(row.expected_amount);
      const nextStatus = discrepancy === 0 ? "SUBMITTED" : "NEEDS_REVIEW";
      await tx.run(
        `UPDATE cod_settlement_batches
            SET submitted_amount=?,discrepancy_amount=?,status=?,
                evidence_reference=?,submitted_at=CURRENT_TIMESTAMP,
                admin_verifier_id=NULL,verified_at=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='NEEDS_REVIEW'`,
        submittedAmount,
        discrepancy,
        nextStatus,
        reference,
        row.id,
      );
      const corrected = await batchDetail(tx, mysql, row.id);
      await auditBatch(
        tx,
        user,
        "BATCH_CORRECTED",
        corrected.row,
        corrected.items,
      );
      await auditBatch(
        tx,
        user,
        "BATCH_SUBMITTED",
        corrected.row,
        corrected.items,
      );
      if (discrepancy !== 0)
        await auditBatch(
          tx,
          user,
          "BATCH_DISCREPANCY",
          corrected.row,
          corrected.items,
        );
      return serializeBatch(corrected.row, corrected.items);
    }

    const eligible = await eligibleRows(tx, mysql, user.id, true);
    if (!eligible.length)
      throw new DomainError("Tidak ada pesanan COD yang dapat disetorkan", 409);
    assertAuthoritativeAmounts(eligible);
    const expectedAmount = eligible.reduce(
      (sum, item) => sum + Number(item.total),
      0,
    );
    const discrepancy = submittedAmount - expectedAmount;
    const status = discrepancy === 0 ? "SUBMITTED" : "NEEDS_REVIEW";
    const created = await tx.run(
      `INSERT INTO cod_settlement_batches(
         driver_id,expected_amount,submitted_amount,discrepancy_amount,status,
         evidence_reference,submitted_at
       ) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      user.id,
      expectedAmount,
      submittedAmount,
      discrepancy,
      status,
      reference,
    );
    const batchId = Number(created.lastInsertRowid);
    for (const item of eligible) {
      const inserted = await tx.run(
        "INSERT OR IGNORE INTO cod_settlement_batch_items(batch_id,order_id,settlement_id,expected_amount) VALUES(?,?,?,?)",
        batchId,
        item.order_id,
        item.settlement_id,
        Number(item.total),
      );
      if (!inserted.changes)
        throw new DomainError(
          `Pesanan #${Number(item.order_id)} sudah dimiliki batch lain`,
          409,
        );
    }
    const batch = await batchDetail(tx, mysql, batchId);
    await auditBatch(tx, user, "BATCH_CREATED", batch.row, batch.items);
    await auditBatch(tx, user, "BATCH_SUBMITTED", batch.row, batch.items);
    if (discrepancy !== 0)
      await auditBatch(tx, user, "BATCH_DISCREPANCY", batch.row, batch.items);
    return serializeBatch(batch.row, batch.items);
  });
}

export async function getCodBatch(user, rawBatchId) {
  const batchId = positiveId(rawBatchId, "Batch");
  if (user?.role === "DRIVER") {
    requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  } else {
    requiredCapability(user, CAPABILITIES.PAYMENTS_VERIFY);
  }
  return store.transaction(async (tx, mysql) => {
    const { row, items } = await batchDetail(tx, mysql, batchId);
    if (user.role === "DRIVER" && Number(row.driver_id) !== user.id)
      throw new DomainError(
        "Batch setoran Driver lain tidak dapat diakses",
        403,
      );
    return serializeBatch(row, items);
  });
}

export async function listAdminCodBatches(user, filter = "pending") {
  requiredCapability(user, CAPABILITIES.PAYMENTS_VERIFY);
  const normalized = String(filter || "pending").toLowerCase();
  if (!["pending", "history", "all"].includes(normalized))
    throw new DomainError("Filter batch tidak valid");
  const where =
    normalized === "pending"
      ? "WHERE b.status IN ('SUBMITTED','NEEDS_REVIEW')"
      : normalized === "history"
        ? "WHERE b.status='VERIFIED'"
        : "";
  const rows = await store.all(
    `SELECT b.*,d.name driver_name,a.name admin_verifier_name,
            (SELECT COUNT(*) FROM cod_settlement_batch_items i WHERE i.batch_id=b.id) order_count
       FROM cod_settlement_batches b
       JOIN users d ON d.id=b.driver_id
       LEFT JOIN users a ON a.id=b.admin_verifier_id
       ${where}
      ORDER BY b.id DESC LIMIT 100`,
  );
  return rows.map((row) => ({
    ...serializeBatch(row, []),
    order_count: Number(row.order_count),
    orders: undefined,
  }));
}

export async function verifyCodBatch(user, rawBatchId) {
  requiredCapability(user, CAPABILITIES.PAYMENTS_VERIFY);
  const batchId = positiveId(rawBatchId, "Batch");
  return store.transaction(async (tx, mysql) => {
    const { row, items } = await batchDetail(tx, mysql, batchId, {
      lock: true,
    });
    if (row.status === "VERIFIED") {
      if (
        items.length > 0 &&
        items.every(
          (item) =>
            item.payment_status === "PAID" &&
            item.settlement_status === "VERIFIED",
        )
      )
        return serializeBatch(row, items, true);
      throw new DomainError("Batch terverifikasi tidak konsisten", 409);
    }
    if (row.status !== "SUBMITTED")
      throw new DomainError("Batch belum siap diverifikasi", 409);
    if (row.driver_role !== "DRIVER" || !Number(row.driver_active))
      throw new DomainError("Driver batch tidak lagi valid", 409);
    if (Number(row.submitted_amount) !== Number(row.expected_amount))
      throw new DomainError("Nominal batch belum sesuai", 409);
    if (!items.length)
      throw new DomainError("Batch tidak memiliki pesanan", 409);

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
          SET status='VERIFIED',discrepancy_amount=0,admin_verifier_id=?,
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
          WHERE order_id=? AND method='CASH' AND status IN ('UNPAID','PENDING')`,
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

    const completed = await batchDetail(tx, mysql, batchId);
    await auditBatch(
      tx,
      user,
      "BATCH_VERIFIED",
      completed.row,
      completed.items,
    );
    await auditBatch(tx, user, "BATCH_CLOSED", completed.row, completed.items);
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      row.driver_id,
      `Batch setoran COD #${batchId} telah diverifikasi`,
    );
    return serializeBatch(completed.row, completed.items);
  });
}

export const COD_BATCH_ACTIVE_STATUSES = Object.freeze(ACTIVE_BATCH_STATUSES);
