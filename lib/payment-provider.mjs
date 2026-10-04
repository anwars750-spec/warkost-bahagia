import crypto from "node:crypto";

export const LOCAL_QRIS_PROVIDER = "LOCAL_SIMULATION";

export function paymentProviderConfiguration() {
  const mode = String(process.env.PAYMENT_PROVIDER_MODE || "").toLowerCase();
  const production = process.env.NODE_ENV === "production";
  if (mode === "simulation") {
    if (production)
      return {
        available: false,
        provider: LOCAL_QRIS_PROVIDER,
        reason: "Simulasi QRIS tidak diizinkan pada environment production",
      };
    return {
      available: true,
      provider: LOCAL_QRIS_PROVIDER,
      simulation: true,
    };
  }
  return {
    available: false,
    provider: null,
    simulation: false,
    reason: "Provider QRIS produksi belum dikonfigurasi",
  };
}

export function createLocalQrisDescriptor(orderId, amount, expiresAt) {
  const configuration = paymentProviderConfiguration();
  if (!configuration.available || !configuration.simulation)
    throw new Error(configuration.reason || "Provider QRIS tidak tersedia");
  const transactionReference = `WB-QRIS-${orderId}-${crypto.randomUUID()}`;
  const providerReference = `SIM-${crypto.randomUUID()}`;
  return {
    provider: configuration.provider,
    providerReference,
    transactionReference,
    qrPayload: `WARKOST-LOCAL-QRIS|${transactionReference}|${amount}|${expiresAt}`,
    paymentUrl: null,
  };
}

function webhookSecret() {
  const secret = String(process.env.PAYMENT_WEBHOOK_SECRET || "");
  if (secret.length < 32)
    throw new Error("PAYMENT_WEBHOOK_SECRET minimal 32 karakter");
  return secret;
}

export function signLocalWebhook(rawBody) {
  return crypto
    .createHmac("sha256", webhookSecret())
    .update(rawBody)
    .digest("hex");
}

export function verifyProviderWebhook(rawBody, signature) {
  const configuration = paymentProviderConfiguration();
  if (!configuration.available || !configuration.simulation)
    return {
      valid: false,
      reason: configuration.reason || "Provider QRIS tidak tersedia",
    };
  if (!/^[a-f0-9]{64}$/i.test(String(signature || "")))
    return { valid: false, reason: "Signature webhook tidak valid" };
  let expected;
  try {
    expected = signLocalWebhook(rawBody);
  } catch (error) {
    return { valid: false, reason: error.message };
  }
  const valid = crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex"),
  );
  return valid
    ? { valid: true, provider: configuration.provider }
    : { valid: false, reason: "Signature webhook tidak valid" };
}
