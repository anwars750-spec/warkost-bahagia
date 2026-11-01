import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  getAdminCashState,
  startAdminShift,
} from "../../../lib/admin-cash-control.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  console.error("Admin cash control error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await getAdminCashState(user));
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

    if (action === "START_SHIFT") {
      return out(await startAdminShift(user, {
          operatorId: body.operatorId,
          pin: body.pin,
        }));
    }

    throw new DomainError(
      "Admin hanya dapat memilih operator yang sudah didaftarkan Owner dan memulai shift",
      404,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
