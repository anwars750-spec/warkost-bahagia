import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.mjs";
import { DomainError } from "../../../../lib/domain.mjs";
import { extendAdminPreparationEta } from "../../../../lib/preparing-eta-extensions.mjs";
import { publishActionRealtime } from "../../../../lib/realtime.mjs";
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
    const result = await extendAdminPreparationEta(user, Number(body.orderId));
    try {
      await publishActionRealtime(
        "preparing-eta-extended",
        user,
        { orderId: result.orderId },
        result,
      );
    } catch (realtimeError) {
      console.error("Preparation ETA extension realtime publication failed", realtimeError);
    }
    return out(result);
  } catch (error) {
    if (error instanceof DomainError) return out({ error: error.message }, error.status);
    console.error("Preparation ETA extension error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
