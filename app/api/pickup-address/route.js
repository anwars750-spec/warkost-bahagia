import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError, required } from "../../../lib/domain.mjs";
import { ensurePickupAddress } from "../../../lib/pickup.mjs";
import { assertSameOrigin } from "../../../lib/request.mjs";

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
    required(user, ["CUSTOMER"]);

    return out(await ensurePickupAddress(user.id));
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    if (Number.isInteger(error?.status))
      return out({ error: error.message }, error.status);
    console.error("Pickup address API error", error);
    return out({ error: "Gagal menyiapkan opsi ambil di tempat" }, 500);
  }
}
