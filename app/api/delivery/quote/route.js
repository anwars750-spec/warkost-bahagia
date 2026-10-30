import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError, quoteDelivery } from "../../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../lib/request.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const addressId = Number(body.addressId);
    if (!Number.isSafeInteger(addressId) || addressId < 1)
      throw new DomainError("Alamat tidak valid");
    return out(await quoteDelivery(user, addressId));
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Delivery quote error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
