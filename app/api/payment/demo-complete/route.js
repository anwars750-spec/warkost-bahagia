import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError } from "../../../../lib/domain.mjs";
import {
  getPaymentStatus,
  processTrustedProviderEvent,
} from "../../../../lib/payments.mjs";
import {
  LOCAL_QRIS_PROVIDER,
  paymentProviderConfiguration,
} from "../../../../lib/payment-provider.mjs";
import { publishActionRealtime } from "../../../../lib/realtime.mjs";
import {
  assertSameOrigin,
  readJsonBody,
} from "../../../../lib/request.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function requireDemoSimulation() {
  if (process.env.DEPLOYMENT_ENV !== "demo")
    throw new DomainError("Endpoint tidak ditemukan", 404);
  const configuration = paymentProviderConfiguration();
  if (
    !configuration.available ||
    !configuration.simulation ||
    configuration.provider !== LOCAL_QRIS_PROVIDER
  )
    throw new DomainError("Simulasi QRIS demo tidak tersedia", 503);
  return configuration;
}

export async function GET() {
  try {
    requireDemoSimulation();
    return out({ enabled: true });
  } catch (error) {
    if (error instanceof DomainError) return out({ error: error.message }, error.status);
    console.error("QRIS demo configuration error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}

export async function POST(request) {
  try {
    requireDemoSimulation();
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const orderId = Number(body.orderId);
    if (!Number.isSafeInteger(orderId) || orderId < 1)
      throw new DomainError("Order tidak valid");

    const payment = await getPaymentStatus(user, orderId);
    if (payment.method !== "QRIS")
      throw new DomainError("Pembayaran QRIS tidak ditemukan", 404);
    if (payment.status !== "PENDING")
      throw new DomainError("Pembayaran QRIS tidak lagi menunggu pembayaran", 409);
    if (!payment.transaction_reference || !payment.provider_reference)
      throw new DomainError("Referensi pembayaran QRIS demo tidak lengkap", 422);

    const eventId = `demo-paid-${payment.id}-${crypto.randomUUID()}`;
    const result = await processTrustedProviderEvent({
      trusted: true,
      provider: LOCAL_QRIS_PROVIDER,
      eventId,
      transactionReference: payment.transaction_reference,
      providerReference: payment.provider_reference,
      status: "PAID",
      payloadHash: crypto
        .createHash("sha256")
        .update(`${orderId}:${eventId}`)
        .digest("hex"),
    });

    try {
      await publishActionRealtime(
        "payment",
        user,
        { orderId },
        { status: result.payment?.status || "PAID" },
      );
    } catch (realtimeError) {
      console.error("QRIS demo realtime publication failed", realtimeError);
    }

    return out(result);
  } catch (error) {
    if (error instanceof DomainError) return out({ error: error.message }, error.status);
    console.error("QRIS demo settlement error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
