import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { listDeliveryHistory } from "../../../lib/delivery-history.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await currentUser(request);
    const before = request.nextUrl.searchParams.get("before");
    const result = await listDeliveryHistory(user, { before });
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DomainError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Delivery history error", error);
    return Response.json(
      { error: "Gagal memuat riwayat delivery" },
      { status: 500 },
    );
  }
}
