import { DomainError } from "../../../../../lib/domain.mjs";
import { handleMidtransNotification } from "../../../../../lib/midtrans-reconciliation.mjs";
import { readJsonBody } from "../../../../../lib/request.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    return Response.json(
      await handleMidtransNotification(await readJsonBody(request)),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const known = error instanceof DomainError;
    if (!known)
      console.error("Midtrans sandbox webhook storage or processing failed");
    return Response.json(
      {
        error: known
          ? error.message
          : "Notifikasi sandbox belum dapat diproses",
      },
      {
        status: known ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
