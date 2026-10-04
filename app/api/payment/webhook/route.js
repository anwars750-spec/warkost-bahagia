import { NextResponse } from "next/server";
import { DomainError } from "../../../../lib/domain.mjs";
import { processPaymentWebhook } from "../../../../lib/payments.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-payment-signature");
    const result = await processPaymentWebhook(rawBody, signature);
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
