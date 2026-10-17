import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError, required } from "../../../../lib/domain.mjs";
import { reverseGeocode } from "../../../../lib/google-maps.mjs";
import { recordAttempt } from "../../../../lib/rate-limit.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../lib/request.mjs";

export const runtime = "nodejs";
const out = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["CUSTOMER"]);
    if (!(await recordAttempt("location-reverse", user.id, 10)))
      throw new DomainError("Terlalu banyak permintaan lokasi perangkat", 429);
    const body = await readJsonBody(request);
    return out(await reverseGeocode(body.latitude, body.longitude));
  } catch (error) {
    if (Number.isInteger(error?.status)) return out({ error: error.message }, error.status);
    console.error("Reverse geocode error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
