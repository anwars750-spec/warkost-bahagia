import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  getAdminShiftSettlementState,
  submitAdminShiftSettlement,
} from "../../../lib/cash-settlement-control.mjs";

export const runtime = "nodejs";

const RUNTIME_REVISION = "P0-ENDSHIFT-R5";

const out = (data, status = 200) =>
  NextResponse.json(
    { ...data, runtime_revision: RUNTIME_REVISION },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );

function errorResponse(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  console.error("Admin shift settlement error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await getAdminShiftSettlementState(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const startedAt = Date.now();
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const action = String(body?.action || "").toUpperCase();
    if (action === "SUBMIT_END_SHIFT") {
      console.info(`[${RUNTIME_REVISION}] submit start`, {
        adminUserId: Number(user?.id || 0),
        shiftId: Number(body?.shiftId || 0),
        submittedAmount: Number(body?.submittedAmount || 0),
      });
      const result = await submitAdminShiftSettlement(user, {
        shiftId: body.shiftId,
        submittedAmount: body.submittedAmount,
      });
      const elapsed = Date.now() - startedAt;
      console.info(`[${RUNTIME_REVISION}] submit success`, {
        shiftId: Number(result?.settlement?.shift_id || result?.shift_id || 0),
        settlementId: Number(result?.settlement?.id || 0),
        noCash: Boolean(result?.no_cash),
        replayed: Boolean(result?.replayed),
        elapsedMs: elapsed,
      });
      return out({ ...result, server_elapsed_ms: elapsed }, 201);
    }
    throw new DomainError("Aksi setoran shift tidak dikenal", 404);
  } catch (error) {
    console.error(`[${RUNTIME_REVISION}] submit failed`, {
      elapsedMs: Date.now() - startedAt,
      message: error?.message || String(error),
    });
    return errorResponse(error);
  }
}
