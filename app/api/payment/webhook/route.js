import { NextResponse } from "next/server";
import { DomainError } from "../../../../lib/domain.mjs";
import { processPaymentWebhook } from "../../../../lib/payments.mjs";
import { publishActionRealtime } from "../../../../lib/realtime.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-payment-signature");
    const result = await processPaymentWebhook(rawBody, signature);
    try {
      const payment = result?.payment || result;
      await publishActionRealtime(
        "payment",
        null,
        { orderId: Number(payment?.order_id || result?.orderId || 0) },
        {
          status: payment?.status || result?.status,
          replayed: Boolean(result?.replayed),
        },
      );
    } catch (realtimeError) {
      console.error("Payment realtime publication failed", realtimeError);
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DomainError)
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    console.error("Payment webhook error", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
