import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  createOwnerAdminOperator,
  listOwnerAdminOperators,
  resetOwnerAdminOperatorPin,
  setOwnerAdminOperatorActive,
} from "../../../lib/owner-admin-operators.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError)
    return out({ error: error.message }, error.status);
  console.error("Owner admin operator error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await listOwnerAdminOperators(user));
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

    if (action === "CREATE")
      return out(
        await createOwnerAdminOperator(user, {
          name: body.name,
          pin: body.pin,
        }),
        201,
      );

    if (action === "RESET_PIN")
      return out(
        await resetOwnerAdminOperatorPin(user, {
          operatorId: body.operatorId,
          pin: body.pin,
        }),
      );

    if (action === "SET_ACTIVE")
      return out(
        await setOwnerAdminOperatorActive(user, {
          operatorId: body.operatorId,
          active: body.active === true,
        }),
      );

    throw new DomainError("Aksi operator tidak dikenal", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
