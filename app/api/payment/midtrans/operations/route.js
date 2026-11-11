import { currentUser } from "../../../../../lib/auth.mjs";
import { DomainError } from "../../../../../lib/domain.mjs";
import {
  getMidtransOperations,
  updateMidtransOperations,
} from "../../../../../lib/midtrans-reconciliation.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../../lib/request.mjs";

export const runtime = "nodejs";

async function respond(action) {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(await action(), { headers });
  } catch (error) {
    const known = error instanceof DomainError;
    return Response.json(
      {
        error: known
          ? error.message
          : "Operasi QRIS sandbox belum dapat diproses",
      },
      { status: known ? error.status : 503, headers },
    );
  }
}

export async function GET(request) {
  return respond(async () => getMidtransOperations(await currentUser(request)));
}

export async function POST(request) {
  return respond(async () => {
    assertSameOrigin(request);
    const user = await currentUser(request);
    return updateMidtransOperations(user, await readJsonBody(request));
  });
}
