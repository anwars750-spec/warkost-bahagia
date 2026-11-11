import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import { midtransNewPaymentsEnabled } from "./payment-provider.mjs";
import {
  MIDTRANS_SANDBOX,
  chargeMidtrans,
  getMidtransQr,
  getMidtransStatus,
  matchesMidtransPayment,
  midtransSandboxConfig,
  readMidtransObservation,
  sqlPaymentTime,
  utcPaymentTime,
  verifyMidtransSignature,
} from "./midtrans-sandbox.mjs";
import {
  applyMidtransObservation,
  expirePendingPayments,
  getPaymentStatus,
  recordMidtransCallback,
} from "./payments.mjs";
import { publishActionRealtime } from "./realtime.mjs";

const trackedPayment =
  "SELECT p.id,p.order_id,p.status,p.provider,p.amount,p.provider_reference,p.transaction_reference,p.expires_at,t.merchant_id,t.created_at,t.charge_attempted_at FROM payments p JOIN midtrans_qris_tracking t ON t.payment_id=p.id";
const workerKey = Symbol.for("warkost.midtrans.sandbox.reconciliation");
const dayMs = 24 * 60 * 60 * 1000;

function sandbox() {
  const config = midtransSandboxConfig();
  if (!config) throw new DomainError("Endpoint sandbox tidak tersedia", 404);
  return config;
}

async function publish(result) {
  if (result.changed) {
    try {
      await publishActionRealtime(
        "payment",
        null,
        { orderId: result.payment.order_id },
        { status: result.payment.status, replayed: false },
      );
    } catch {
      // The authoritative payment, notifications and print queue have committed.
      console.error("Midtrans sandbox realtime publication failed");
    }
  }
  return result;
}

async function observe(
  config,
  payment,
  fetcher,
  { allowCharge = false, callback } = {},
) {
  if (config.merchantId !== payment.merchant_id) {
    await applyMidtransObservation(
      payment.id,
      null,
      "MERCHANT_CONFIGURATION_CHANGED",
    );
    return { kind: "retry" };
  }
  let result = await getMidtransStatus(
    config,
    payment.transaction_reference,
    fetcher,
  );
  if (
    allowCharge &&
    result.kind === "missing" &&
    payment.status === "PENDING" &&
    !payment.provider_reference &&
    utcPaymentTime(payment.expires_at) > Date.now()
  ) {
    const approved = await store.transaction(async (tx) => {
      if (!(await midtransNewPaymentsEnabled(tx))) return false;
      const changed = await tx.run(
        "UPDATE midtrans_qris_tracking SET charge_attempted_at=COALESCE(charge_attempted_at,CURRENT_TIMESTAMP) WHERE payment_id=? AND EXISTS (SELECT 1 FROM payments WHERE id=? AND status='PENDING' AND provider_reference IS NULL AND expires_at>CURRENT_TIMESTAMP)",
        payment.id,
        payment.id,
      );
      return Boolean(changed.changes);
    });
    if (approved) {
      result = await chargeMidtrans(config, payment, fetcher);
      if (result.kind !== "observed" || result.observation.status !== "pending")
        result = await getMidtransStatus(
          config,
          payment.transaction_reference,
          fetcher,
        );
    }
  }

  if (result.kind === "invalid") {
    await applyMidtransObservation(
      payment.id,
      null,
      "INVALID_PROVIDER_RESPONSE",
    );
    return { kind: "retry" };
  }
  if (result.kind !== "observed") return result;
  if (callback && result.observation.transactionId !== callback.transactionId) {
    await applyMidtransObservation(
      payment.id,
      result.observation,
      "CALLBACK_STATUS_REFERENCE_CONFLICT",
    );
    return { kind: "conflict" };
  }
  if (callback?.status === "settlement" &&
      !["pending", "settlement"].includes(result.observation.status) &&
      payment.status !== "PAID")
    await applyMidtransObservation(payment.id, callback, "CALLBACK_SETTLEMENT_UNCONFIRMED");
  const local = await publish(
    await applyMidtransObservation(payment.id, result.observation),
  );
  // An authenticated status response can lag behind a signed settlement notification.
  if (
    callback?.status === "settlement" &&
    result.observation.status !== "settlement" &&
    local.payment.status !== "PAID"
  )
    return { kind: "retry" };
  return {
    kind: "observed",
    providerStatus: result.observation.status,
    ...local,
  };
}

export async function handleMidtransNotification(data, { fetcher } = {}) {
  const config = sandbox();
  if (!verifyMidtransSignature(data, config))
    throw new DomainError("Signature Midtrans tidak valid", 401);
  const callback = readMidtransObservation(data);
  if (!callback) throw new DomainError("Notifikasi Midtrans tidak valid", 422);

  const payment = await store.get(
    trackedPayment + " WHERE p.transaction_reference=? AND p.provider=?",
    callback.orderRef,
    MIDTRANS_SANDBOX,
  );
  if (!payment)
    throw new DomainError("Pembayaran sandbox tidak ditemukan", 404);
  if (
    config.merchantId !== payment.merchant_id ||
    !matchesMidtransPayment(payment, callback)
  )
    throw new DomainError(
      "Notifikasi Midtrans tidak cocok dengan pembayaran",
      422,
    );
  await recordMidtransCallback(payment.id, callback);
  const result = await observe(config, payment, fetcher, { callback });
  if (result.kind === "conflict")
    throw new DomainError(
      "Referensi status Midtrans tidak cocok dengan notifikasi",
      422,
    );
  if (result.kind !== "observed")
    throw new DomainError("Status Midtrans belum dapat dikonfirmasi", 503);
  return {
    received: true,
    attention: Boolean(result.attention),
    replayed: Boolean(result.replayed),
  };
}

async function checkDuePayment(config, payment, fetcher) {
  const now = Date.now();
  const lease = sqlPaymentTime(now + 30_000);
  const claimed = await store.run(
    "UPDATE midtrans_qris_tracking SET next_check_at=? WHERE payment_id=? AND next_check_at<=?",
    lease,
    payment.id,
    sqlPaymentTime(now),
  );
  if (!claimed.changes) return null;

  const result = await observe(config, payment, fetcher, { allowCharge: true });
  const expiry = utcPaymentTime(payment.expires_at);
  const overdue = now > expiry + 2 * dayMs;
  let next = sqlPaymentTime(now + (now < expiry ? 10_000 : 5 * 60_000));
  if (
    now >= expiry &&
    result.kind === "missing" &&
    !payment.charge_attempted_at &&
    !payment.provider_reference
  ) {
    next = null;
  } else if (overdue) {
    const terminal =
      result.kind === "observed" && result.providerStatus !== "pending";
    if (terminal) next = null;
    else {
      await applyMidtransObservation(
        payment.id,
        null,
        "RECONCILIATION_OVERDUE",
      );
      next = sqlPaymentTime(now + 60 * 60_000);
    }
  }
  await store.run(
    "UPDATE midtrans_qris_tracking SET next_check_at=? WHERE payment_id=? AND next_check_at=?",
    next,
    payment.id,
    lease,
  );
  return result;
}

export async function runMidtransReconciliation({ fetcher } = {}) {
  const config = midtransSandboxConfig();
  if (!config) return { checked: 0 };
  await expirePendingPayments(MIDTRANS_SANDBOX);
  const due = await store.all(
    trackedPayment +
      " WHERE t.next_check_at<=? AND p.provider=? ORDER BY t.next_check_at,p.id LIMIT 12",
    sqlPaymentTime(Date.now()),
    MIDTRANS_SANDBOX,
  );
  let checked = 0;
  for (const payment of due) {
    try {
      if (await checkDuePayment(config, payment, fetcher)) checked++;
    } catch {
      // Leave the claim to expire so the persisted order is independently retried.
      console.error(
        "Midtrans sandbox reconciliation failed for payment",
        payment.id,
      );
    }
  }
  return { checked };
}

export function startMidtransReconciliation() {
  if (!midtransSandboxConfig() || globalThis[workerKey]) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runMidtransReconciliation();
    } catch {
      console.error("Midtrans sandbox reconciliation sweep failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, 5_000);
  timer.unref?.();
  globalThis[workerKey] = timer;
  void run();
}

export async function prepareMidtransCheckout(result) {
  if (
    result.payment?.provider !== MIDTRANS_SANDBOX ||
    result.payment.provider_reference
  )
    return result;
  try {
    const config = sandbox();
    const payment = await store.get(
      trackedPayment + " WHERE p.id=?",
      result.payment.id,
    );
    const outcome = payment && (await checkDuePayment(config, payment));
    return outcome?.payment ? { ...result, payment: outcome.payment } : result;
  } catch {
    // An ambiguous charge result stays attached to the persisted intent for the worker.
    return result;
  }
}

export async function readMidtransQr(user, orderId, { fetcher } = {}) {
  const config = sandbox();
  required(user, ["CUSTOMER"]);
  const payment = await getPaymentStatus(user, orderId);
  if (
    payment.provider !== MIDTRANS_SANDBOX ||
    payment.status !== "PENDING" ||
    !payment.provider_reference ||
    !payment.payment_url
  )
    throw new DomainError("Kode QR sandbox tidak tersedia", 404);
  const tracking = await store.get(
    "SELECT merchant_id FROM midtrans_qris_tracking WHERE payment_id=?",
    payment.id,
  );
  if (tracking?.merchant_id !== config.merchantId)
    throw new DomainError("Merchant sandbox tidak cocok", 503);
  const png = await getMidtransQr(config, payment.provider_reference, fetcher);
  if (!png) throw new DomainError("Kode QR sandbox belum dapat dimuat", 503);
  return png;
}

export async function getMidtransOperations(user) {
  required(user, ["OWNER", "ADMIN"]);
  sandbox();
  return {
    enabled: await midtransNewPaymentsEnabled(store),
    canToggle: user.role === "OWNER",
    cases: await store.all(
      "SELECT a.id,a.reason,a.observed_status,a.observed_amount,a.transaction_reference,a.settled_at,a.created_at,p.order_id,p.transaction_reference order_reference,p.status payment_status,p.amount expected_amount FROM midtrans_qris_attention a JOIN payments p ON p.id=a.payment_id WHERE a.reviewed_at IS NULL ORDER BY a.id LIMIT 50",
    ),
  };
}

export async function updateMidtransOperations(user, body) {
  required(user, ["OWNER", "ADMIN"]);
  const config = sandbox();
  if (body.action === "set-new-payments") {
    required(user, ["OWNER"]);
    if (typeof body.enabled !== "boolean")
      throw new DomainError("Status QRIS baru tidak valid");
    await store.transaction(async (tx) => {
      await tx.run(
        "UPDATE settings SET value=? WHERE `key`='midtrans_qris_new_enabled'",
        String(body.enabled),
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "MIDTRANS_NEW_PAYMENTS_SWITCH",
        JSON.stringify({ enabled: body.enabled }),
      );
    });
  } else if (
    ["review", "reconcile"].includes(body.action) &&
    Number.isSafeInteger(body.caseId) &&
    body.caseId > 0
  ) {
    if (body.action === "review") {
      await store.transaction(async (tx) => {
        const changed = await tx.run(
          "UPDATE midtrans_qris_attention SET reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND reviewed_at IS NULL",
          user.id,
          body.caseId,
        );
        if (changed.changes)
          await tx.run(
            "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
            user.id,
            "MIDTRANS_CASE_REVIEWED",
            JSON.stringify({ caseId: body.caseId }),
          );
      });
    } else {
      const payment = await store.get(
        trackedPayment +
          " WHERE p.id=(SELECT payment_id FROM midtrans_qris_attention WHERE id=?)",
        body.caseId,
      );
      if (!payment) throw new DomainError("Kasus tidak ditemukan", 404);
      const result = await observe(config, payment);
      if (result.kind !== "observed")
        throw new DomainError("Status Midtrans belum dapat dikonfirmasi", 503);
      await store.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "MIDTRANS_CASE_RECHECKED",
        JSON.stringify({ caseId: body.caseId, status: result.providerStatus }),
      );
    }
  } else throw new DomainError("Aksi sandbox tidak valid");
  return getMidtransOperations(user);
}
