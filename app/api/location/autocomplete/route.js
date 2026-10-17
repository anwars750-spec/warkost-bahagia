import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError, required } from "../../../../lib/domain.mjs";
import { operationalSettings } from "../../../../lib/delivery.mjs";
import { autocompletePlaces } from "../../../../lib/google-maps.mjs";
import { recordAttempt } from "../../../../lib/rate-limit.mjs";
import * as store from "../../../../lib/store.mjs";

export const runtime = "nodejs";
const out = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function failed(error) {
  if (Number.isInteger(error?.status)) return out({ error: error.message }, error.status);
  console.error("Location autocomplete error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    required(user, ["CUSTOMER"]);
    if (!(await recordAttempt("location-autocomplete", user.id, 40)))
      throw new DomainError("Terlalu banyak pencarian lokasi", 429);
    const { origin } = await operationalSettings(store);
    return out(await autocompletePlaces(user, {
      query: request.nextUrl.searchParams.get("q"),
      sessionToken: request.nextUrl.searchParams.get("sessionToken"),
    }, origin));
  } catch (error) {
    return failed(error);
  }
}
