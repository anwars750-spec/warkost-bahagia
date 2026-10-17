import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError, required } from "../../../../lib/domain.mjs";
import { getPlaceDetails } from "../../../../lib/google-maps.mjs";
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
    if (!(await recordAttempt("location-place", user.id, 20)))
      throw new DomainError("Terlalu banyak detail lokasi", 429);
    return out(await getPlaceDetails(user, await readJsonBody(request)));
  } catch (error) {
    if (Number.isInteger(error?.status)) return out({ error: error.message }, error.status);
    console.error("Place details error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
