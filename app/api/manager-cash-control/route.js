import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  getManagerCashState,
  verifyManagerSettlement,
} from "../../../lib/cash-settlement-control.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  console.error("Manager cash control error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await getManagerCashState(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const action = String(body?.action || "").toUpperCase();
    if (action === "VERIFY_ADMIN_SETTLEMENT") {
      const result = await verifyManagerSettlement(user, {
          settlementId: body.settlementId,
          receivedAmount: body.receivedAmount,
        });
      await publishActionRealtime(
        "admin-settlement-verified",
        user,
        body,
        result,
      ).catch(() => {});
      return out(result);
    }
    throw new DomainError("Aksi kas Manager tidak dikenal", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
