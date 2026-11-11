import { currentUser } from "../../../../../lib/auth.mjs";
import { DomainError } from "../../../../../lib/domain.mjs";
import { readMidtransQr } from "../../../../../lib/midtrans-reconciliation.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const orderId = Number(new URL(request.url).searchParams.get("orderId"));
    const png = await readMidtransQr(await currentUser(request), orderId);
    return new Response(png, {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  } catch (error) {
    const known = error instanceof DomainError;
    return Response.json(
      { error: known ? error.message : "Kode QR sandbox belum dapat dimuat" },
      { status: known ? error.status : 503, headers },
    );
  }
}
