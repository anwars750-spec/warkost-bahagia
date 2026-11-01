import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  getManagerOwnerSettlementState,
  rejectOwnerManagerSettlement,
  submitManagerOwnerSettlement,
  verifyOwnerManagerSettlement,
} from "../../../lib/manager-owner-settlement.mjs";
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
  console.error("Manager owner settlement error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await getManagerOwnerSettlementState(user));
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

    if (action === "SUBMIT") {
      const result = await submitManagerOwnerSettlement(user, {
          destination: body.destination,
          submittedAmount: body.submittedAmount,
          bankReference: body.bankReference,
        });
      await publishActionRealtime(
        "manager-settlement-submit",
        user,
        body,
        result,
      ).catch(() => {});
      return out(result);
    }

    if (action === "VERIFY") {
      const result = await verifyOwnerManagerSettlement(user, {
          settlementId: body.settlementId,
          receivedAmount: body.receivedAmount,
        });
      await publishActionRealtime(
        "manager-settlement-verify",
        user,
        body,
        result,
      ).catch(() => {});
      return out(result);
    }

    if (action === "REJECT") {
      const result = await rejectOwnerManagerSettlement(user, {
          settlementId: body.settlementId,
          reason: body.reason,
        });
      await publishActionRealtime(
        "manager-settlement-reject",
        user,
        body,
        result,
      ).catch(() => {});
      return out(result);
    }

    throw new DomainError("Aksi setoran Manager tidak dikenal", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
