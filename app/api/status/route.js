import { currentUser } from "../../../lib/auth.mjs";
import { changeStatus, DomainError } from "../../../lib/domain.mjs";
import { hasDeliveryProof } from "../../../lib/delivery-proofs.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const integer = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : NaN;

function errorResponse(error) {
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Status API error", error);
  return Response.json({ error: "Terjadi kesalahan server" }, { status: 500 });
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const user = await currentUser(request);
    const orderId = integer(body.orderId);
    const status = String(body.status || "").toUpperCase();

    if (
      user?.role === "DRIVER" &&
      status === "DELIVERED" &&
      !(await hasDeliveryProof(orderId))
    )
      throw new DomainError(
        "Foto bukti pengantaran wajib sebelum pesanan diselesaikan",
        409,
      );

    const result = await changeStatus(
      user,
      orderId,
      status,
      integer(body.driverId),
    );
    try {
      await publishActionRealtime("status", user, body, result);
    } catch (realtimeError) {
      console.error("Realtime publication failed", {
        action: "status",
        error: realtimeError,
      });
    }
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
