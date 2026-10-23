import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError, required } from "../../../lib/domain.mjs";
import { listPreparationEta } from "../../../lib/preparing-eta.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  if (error instanceof TypeError) return out({ error: error.message }, 400);
  console.error("Preparing ETA API error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    required(user, ["CUSTOMER", "KITCHEN"]);
    const rawOrderId = request.nextUrl.searchParams.get("orderId");
    const orderId = rawOrderId === null ? null : Number(rawOrderId);
    if (
      rawOrderId !== null &&
      (!Number.isSafeInteger(orderId) || orderId < 1)
    )
      throw new TypeError("Order ETA tidak valid");
    return out(await listPreparationEta(user, { orderId }));
  } catch (error) {
    return errorResponse(error);
  }
}
