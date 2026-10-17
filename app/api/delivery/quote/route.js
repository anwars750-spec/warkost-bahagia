import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError, quoteCoordinateDelivery, quoteDelivery } from "../../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../lib/request.mjs";
import { recordAttempt } from "../../../../lib/rate-limit.mjs";

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
    if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
    if (!(await recordAttempt("delivery-quote", user.id, 30)))
      throw new DomainError("Terlalu banyak permintaan lokasi", 429);
    const body = await readJsonBody(request);
    if (body.latitude !== undefined || body.longitude !== undefined)
      return out(await quoteCoordinateDelivery(user, body));
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
