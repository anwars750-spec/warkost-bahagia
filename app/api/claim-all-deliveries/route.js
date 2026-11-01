import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import {
  claimReadyDeliveries,
  DomainError,
  required,
} from "../../../lib/domain.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
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
    required(user, ["DRIVER"]);
    const result = await claimReadyDeliveries(user);
    try {
      await publishActionRealtime("claim-all-deliveries", user, {}, result);
    } catch (realtimeError) {
      console.error("Batch delivery claim realtime publication failed", realtimeError);
    }
    return out(result);
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Batch delivery claim API error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
