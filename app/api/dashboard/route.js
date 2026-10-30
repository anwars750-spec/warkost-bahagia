import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import {
  DomainError,
  requiredCapability,
} from "../../../lib/domain.mjs";
import { expirePendingPayments } from "../../../lib/payments.mjs";
import { nonNegativeInteger } from "../../../lib/numbers.mjs";
import { CAPABILITIES } from "../../../lib/rbac.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError) return out({ error: error.message }, error.status);
  console.error("Dashboard API error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    requiredCapability(user, CAPABILITIES.DASHBOARD_READ);
    await expirePendingPayments();

    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const first = new Date(localDate + "T00:00:00+07:00");
    const from = first.toISOString().slice(0, 19).replace("T", " ");
    const until = new Date(first.getTime() + 86400000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const today = await store.get(
      "SELECT COUNT(*) orders FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.created_at>=? AND o.created_at<? AND (p.method!='QRIS' OR p.status='PAID')",
      from,
      until,
    );
    today.orders = nonNegativeInteger(today.orders, "Jumlah pesanan");
    today.revenue = (
      await store.get(
        "SELECT COALESCE(SUM(o.total),0) revenue FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?",
        from,
        until,
      )
    ).revenue;
    today.revenue = nonNegativeInteger(today.revenue, "Revenue");

    const statuses = await store.all(
      "SELECT o.status,COUNT(*) count FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.created_at>=? AND o.created_at<? AND (p.method!='QRIS' OR p.status='PAID') GROUP BY o.status",
      from,
      until,
    );
    for (const row of statuses)
      row.count = nonNegativeInteger(row.count, "Jumlah status");

    const paymentStatuses = await store.all(
      "SELECT p.status,COUNT(*) count FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.created_at>=? AND o.created_at<? AND p.status IN ('PENDING','PAID','FAILED','EXPIRED') GROUP BY p.status",
      from,
      until,
    );
    for (const row of paymentStatuses)
      row.count = nonNegativeInteger(row.count, "Jumlah status pembayaran");

    return out({
      today,
      statuses,
      paymentStatuses,
      customers: nonNegativeInteger(
        (
          await store.get(
            "SELECT COUNT(*) count FROM users WHERE role='CUSTOMER'",
          )
        ).count,
        "Jumlah pelanggan",
      ),
      drivers: nonNegativeInteger(
        (
          await store.get(
            "SELECT COUNT(*) count FROM users WHERE role='DRIVER' AND active=1",
          )
        ).count,
        "Jumlah driver",
      ),
      loyalty: nonNegativeInteger(
        (
          await store.get(
            "SELECT COUNT(*) count FROM loyalty_transactions WHERE created_at>=? AND created_at<?",
            from,
            until,
          )
        ).count,
        "Jumlah transaksi loyalti",
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
