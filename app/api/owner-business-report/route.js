import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { expirePendingPayments } from "../../../lib/payments.mjs";
import { ownerBusinessReport } from "../../../lib/owner-business-report.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request) {
  try {
    const user = await currentUser(request);
    await expirePendingPayments();
    const params = request.nextUrl.searchParams;
    const report = await ownerBusinessReport(user, {
      preset: params.get("preset") || "today",
      from: params.get("from") || "",
      to: params.get("to") || "",
    });
    return out(report);
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error("Owner business report error", error);
    return out({ error: error?.message || "Terjadi kesalahan server" }, status);
  }
}
