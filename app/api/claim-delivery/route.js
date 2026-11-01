import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { claimDelivery, DomainError, required } from "../../../lib/domain.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const integer = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : NaN;

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["DRIVER"]);
    const body = await readJsonBody(request);
    const orderId = integer(body.orderId);
    if (!Number.isSafeInteger(orderId))
      throw new DomainError("Order tidak valid");

    const result = await claimDelivery(user, orderId);
    try {
      await publishActionRealtime("claim-delivery", user, body, result);
    } catch (realtimeError) {
      console.error("Claim delivery realtime publication failed", realtimeError);
    }
    return out(result);
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Claim delivery API error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
