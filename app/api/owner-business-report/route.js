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

function normalizeEmptyBusinessHealth(report) {
  const summary = report?.summary || {};
  const finance = report?.finance || {};
  const hasPeriodActivity =
    Number(summary.orders || 0) > 0 ||
    Number(summary.quantity || 0) > 0 ||
    Number(finance.paid_transactions || 0) > 0 ||
    Number(summary.revenue || 0) > 0;
  const hasOpenCashIssue =
    Number(finance.cod_outstanding_current?.amount || 0) > 0 ||
    Number(finance.owner_pending_current?.amount || 0) > 0;

  if (hasPeriodActivity || hasOpenCashIssue) return report;

  return {
    ...report,
    health: {
      score: "—",
      status: "BELUM ADA DATA",
      signals: [
        {
          level: "info",
          text: "Belum ada transaksi pada periode ini, jadi kesehatan bisnis belum dapat dinilai.",
        },
      ],
      note: "Mulai penilaian setelah ada data order, pembayaran, delivery, atau aktivitas kas yang relevan.",
    },
  };
}

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
    return out(normalizeEmptyBusinessHealth(report));
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error("Owner business report error", error);
    return out({ error: error?.message || "Terjadi kesalahan server" }, status);
  }
}
