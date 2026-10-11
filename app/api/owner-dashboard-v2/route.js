import { NextResponse } from "next/server";
import * as store from "../../../lib/store.mjs";
import { currentUser } from "../../../lib/auth.mjs";
import { requiredCapability } from "../../../lib/domain.mjs";
import { expirePendingPayments } from "../../../lib/payments.mjs";
import { nonNegativeInteger } from "../../../lib/numbers.mjs";
import { CAPABILITIES } from "../../../lib/rbac.mjs";
import { resolveManagerPeriod } from "../../../lib/manager-analytics.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request) {
  try {
    const user = await currentUser(request);
    requiredCapability(user, CAPABILITIES.DASHBOARD_READ);
    await expirePendingPayments();

    const requestedDate = request.nextUrl.searchParams.get("date");
    const period = resolveManagerPeriod(
      requestedDate
        ? { preset: "custom", from: requestedDate, to: requestedDate }
        : { preset: "today" },
    );
    const { from, until } = period;

    const today = await store.get(
      "SELECT COUNT(*) orders FROM orders WHERE created_at>=? AND created_at<?",
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
      "SELECT status,COUNT(*) count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",
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

    const codOutstanding = await store.get(
      `SELECT COUNT(*) count,
              COALESCE(SUM(COALESCE(s.expected_amount,p.amount,o.total)),0) amount
         FROM orders o
         JOIN payments p ON p.order_id=o.id
         LEFT JOIN cod_settlements s ON s.order_id=o.id
        WHERE o.created_at>=? AND o.created_at<?
          AND p.method IN ('CASH','COD','CASH_ON_DELIVERY')
          AND o.status='DELIVERED'
          AND (s.status IS NULL OR s.status<>'VERIFIED')`,
      from,
      until,
    );

    return out({
      date: period.fromDate,
      today,
      statuses,
      paymentStatuses,
      codOutstanding: {
        count: nonNegativeInteger(
          codOutstanding.count,
          "Jumlah COD belum final",
        ),
        amount: nonNegativeInteger(
          codOutstanding.amount,
          "Nilai COD belum final",
        ),
      },
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
    console.error("Owner dashboard V2 error", error);
    return out({ error: error?.message || "Terjadi kesalahan server" }, error?.status || 500);
  }
}
