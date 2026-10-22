import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { createOrder, DomainError } from "../../../lib/domain.mjs";
import { ensurePickupAddress } from "../../../lib/pickup.mjs";
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

function errorResponse(error) {
  if (error instanceof DomainError) return out({ error: error.message }, error.status);
  if (Number.isInteger(error?.status))
    return out({ error: error.message }, error.status);
  console.error("Checkout API error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const user = await currentUser(request);
    if (!body.idempotencyKey)
      throw new DomainError("Kunci checkout wajib diisi");

    const fulfillmentType = String(body.fulfillmentType || "DELIVERY").toUpperCase();
    let addressId = integer(body.addressId);
    if (fulfillmentType === "PICKUP" && user) {
      const pickupAddress = await ensurePickupAddress(user.id);
      addressId = pickupAddress.id;
    }

    const result = await createOrder(user, {
      ...body,
      fulfillmentType,
      addressId,
      promotionId:
        body.promotionId == null ? null : integer(body.promotionId),
      loyaltyRewardId:
        body.loyaltyRewardId == null ? null : integer(body.loyaltyRewardId),
    });

    try {
      const unpaidQris =
        result?.payment?.method === "QRIS" && result?.payment?.status !== "PAID";
      await publishActionRealtime(
        "checkout",
        user,
        body,
        unpaidQris ? { ...result, replayed: true } : result,
      );
    } catch (realtimeError) {
      console.error("Checkout realtime publication failed", realtimeError);
    }

    return out(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
