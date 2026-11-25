import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import { submitCodBatchCashHandover } from "../../../lib/cod-cash-handover-v1.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function fail(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  console.error("COD batch submit error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const result = await submitCodBatchCashHandover(user, {
        cashAmount: body.cashAmount,
        evidenceReference: body.evidenceReference,
      });
    await publishActionRealtime("cod-batch-submit", user, body, result).catch(() => {});
    return out(result);
  } catch (error) {
    return fail(error);
  }
}
