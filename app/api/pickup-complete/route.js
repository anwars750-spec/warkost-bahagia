import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import {
  completePickupOrder,
  DomainError,
  required,
} from "../../../lib/domain.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : NaN;
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["ADMIN", "OWNER"]);
    const body = await readJsonBody(request);
    const orderId = integer(body.orderId);
    if (!Number.isSafeInteger(orderId))
      throw new DomainError("Order tidak valid");
    const result = await completePickupOrder(user, orderId);
    try {
      await publishActionRealtime("status", user, body, result);
    } catch (realtimeError) {
      console.error("Pickup completion realtime publication failed", realtimeError);
    }
    return out(result);
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Pickup complete API error", error);
    return out({ error: "Gagal menyelesaikan pesanan pickup" }, 500);
  }
}
