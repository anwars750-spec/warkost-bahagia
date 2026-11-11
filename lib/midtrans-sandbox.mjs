import crypto from "node:crypto";

export const MIDTRANS_SANDBOX = "MIDTRANS_SANDBOX";
const origin = "https://api.sandbox.midtrans.com";
const timeoutMs = 5_000;
const safeId = /^[A-Za-z0-9_-]{1,64}$/;
const orderId = /^WB-SB-[a-f0-9-]{36}$/;
const idr = /^(0|[1-9]\d{0,14})(?:\.0+)?$/;
const statuses = new Set([
  "pending",
  "settlement",
  "expire",
  "deny",
  "cancel",
  "failure",
  "refund",
  "partial_refund",
]);

export function midtransSandboxConfig(env = process.env) {
  if (
    env.PAYMENT_PROVIDER_MODE !== "midtrans-sandbox" ||
    env.DEPLOYMENT_ENV !== "isolated-uat" ||
    env.DATABASE_URL ||
    !env.DATABASE_PATH?.trim() ||
    !/^SB-Mid-server-[A-Za-z0-9_-]+$/.test(
      env.MIDTRANS_SANDBOX_SERVER_KEY || "",
    ) ||
    !safeId.test(env.MIDTRANS_SANDBOX_MERCHANT_ID || "")
  )
    return null;
  return {
    serverKey: env.MIDTRANS_SANDBOX_SERVER_KEY,
    merchantId: env.MIDTRANS_SANDBOX_MERCHANT_ID,
  };
}

export function midtransOrderReference() {
  return "WB-SB-" + crypto.randomUUID();
}

export function utcPaymentTime(value) {
  return typeof value === "string"
    ? Date.parse(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"))
    : NaN;
}

export function sqlPaymentTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function settlementTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(value.replace(" ", "T") + "+07:00");
  return Number.isFinite(ms) &&
    sqlPaymentTime(ms + 7 * 60 * 60 * 1000) === value
    ? sqlPaymentTime(ms)
    : null;
}

export function verifyMidtransSignature(data, config) {
  if (
    !data ||
    typeof data.order_id !== "string" ||
    typeof data.status_code !== "string" ||
    typeof data.gross_amount !== "string" ||
    typeof data.signature_key !== "string" ||
    !/^[a-f0-9]{128}$/i.test(data.signature_key)
  )
    return false;
  // Midtrans signs the original strings. Payment rules are checked after authentication.
  const expected = crypto
    .createHash("sha512")
    .update(
      data.order_id + data.status_code + data.gross_amount + config.serverKey,
    )
    .digest();
  return crypto.timingSafeEqual(
    expected,
    Buffer.from(data.signature_key, "hex"),
  );
}

export function readMidtransObservation(data, { statusApi = false } = {}) {
  if (
    !data ||
    typeof data.order_id !== "string" ||
    !orderId.test(data.order_id) ||
    typeof data.transaction_id !== "string" ||
    !safeId.test(data.transaction_id) ||
    typeof data.merchant_id !== "string" ||
    !safeId.test(data.merchant_id) ||
    typeof data.gross_amount !== "string" ||
    !idr.test(data.gross_amount) ||
    !statuses.has(data.transaction_status) ||
    !["200", "201", "202"].includes(data.status_code) ||
    (data.transaction_status === "pending" &&
      data.status_code !== "201" &&
      !(statusApi && data.status_code === "200")) ||
    (data.transaction_status === "settlement" && data.status_code !== "200")
  )
    return null;
  const settledAt = settlementTime(data.settlement_time);
  return {
    orderRef: data.order_id,
    transactionId: data.transaction_id,
    merchantId: data.merchant_id,
    amount: Number(data.gross_amount),
    currency: data.currency === "IDR" ? "IDR" : null,
    method: data.payment_type === "qris" ? "QRIS" : null,
    status: data.transaction_status,
    settledAt,
    accepted: data.fraud_status == null || data.fraud_status === "accept",
  };
}

export function matchesMidtransPayment(payment, observation) {
  return (
    observation.orderRef === payment.transaction_reference &&
    observation.merchantId === payment.merchant_id &&
    observation.amount === Number(payment.amount) &&
    observation.currency === "IDR" &&
    observation.method === "QRIS" &&
    observation.accepted &&
    (!payment.provider_reference ||
      observation.transactionId === payment.provider_reference)
  );
}

async function request(
  config,
  pathname,
  { fetcher = fetch, body, key, png = false } = {},
) {
  try {
    const response = await fetcher(origin + pathname, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization:
          "Basic " + Buffer.from(config.serverKey + ":").toString("base64"),
        Accept: png ? "image/png" : "application/json",
        ...(body && {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        }),
      },
      ...(body && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      cache: "no-store",
    });
    if (png) {
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";")[0] !== "image/png"
      )
        return null;
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 512 * 1024) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      const image = Buffer.concat(chunks, length);
      return image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        ? image
        : null;
    }
    const data = await response.json();
    if (response.status === 404 || data?.status_code === "404")
      return { kind: "missing" };
    if (!response.ok || !data || (body && response.status === 202))
      return { kind: "retry" };
    const observation = readMidtransObservation(data, { statusApi: !body });
    return observation
      ? { kind: "observed", observation }
      : { kind: "invalid" };
  } catch {
    return png ? null : { kind: "retry" };
  }
}

export function getMidtransStatus(config, reference, fetcher) {
  if (!orderId.test(reference)) return { kind: "invalid" };
  return request(config, "/v2/" + reference + "/status", { fetcher });
}

export function chargeMidtrans(config, payment, fetcher) {
  const start = utcPaymentTime(payment.created_at);
  const end = utcPaymentTime(payment.expires_at);
  const amount = Number(payment.amount);
  if (
    !orderId.test(payment.transaction_reference) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !(end > start)
  )
    return { kind: "invalid" };
  const jakarta = sqlPaymentTime(start + 7 * 60 * 60 * 1000);
  return request(config, "/v2/charge", {
    fetcher,
    key: payment.transaction_reference,
    body: {
      payment_type: "qris",
      transaction_details: {
        order_id: payment.transaction_reference,
        gross_amount: amount,
      },
      qris: { acquirer: "gopay" },
      custom_expiry: {
        order_time: jakarta + " +0700",
        expiry_duration: (end - start) / 1000,
        unit: "second",
      },
    },
  });
}

export function getMidtransQr(config, transactionId, fetcher) {
  if (!safeId.test(transactionId)) return null;
  return request(config, "/v2/qris/" + transactionId + "/qr-code", {
    fetcher,
    png: true,
  });
}
