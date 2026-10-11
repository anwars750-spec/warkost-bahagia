import { NextResponse } from "next/server";
import * as store from "../../../lib/store.mjs";
import { currentUser } from "../../../lib/auth.mjs";
import { requiredCapability } from "../../../lib/domain.mjs";
import { expirePendingPayments } from "../../../lib/payments.mjs";
import { nonNegativeInteger } from "../../../lib/numbers.mjs";
import { CAPABILITIES } from "../../../lib/rbac.mjs";
import { resolveManagerPeriod } from "../../../lib/manager-analytics.mjs";

export const runtime = "nodejs";

const DAY = 86_400_000;

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const dateKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function previousMonthRange(now = new Date()) {
  const today = dateKey(now);
  const [year, month] = today.split("-").map(Number);
  const thisMonthStart = new Date(Date.UTC(year, month - 1, 1));
  const previousMonthEnd = new Date(thisMonthStart.getTime() - DAY);
  const previousMonthStart = new Date(
    Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1),
  );
  return {
    from: previousMonthStart.toISOString().slice(0, 10),
    to: previousMonthEnd.toISOString().slice(0, 10),
  };
}

function resolveOwnerPeriod(request) {
  const preset = request.nextUrl.searchParams.get("preset") || "today";
  if (preset === "last_month") {
    const range = previousMonthRange();
    return {
      requestedPreset: preset,
      ...resolveManagerPeriod({ preset: "custom", from: range.from, to: range.to }),
    };
  }
  if (preset === "custom") {
    return {
      requestedPreset: preset,
      ...resolveManagerPeriod({
        preset: "custom",
        from: request.nextUrl.searchParams.get("from") || "",
        to: request.nextUrl.searchParams.get("to") || "",
      }),
    };
  }
  const safePreset = preset === "month" ? "month" : "today";
  return {
    requestedPreset: safePreset,
    ...resolveManagerPeriod({ preset: safePreset }),
  };
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    requiredCapability(user, CAPABILITIES.DASHBOARD_READ);
    await expirePendingPayments();

    const period = resolveOwnerPeriod(request);
    const { from, until } = period;

    const summary = await store.get(
      "SELECT COUNT(*) orders FROM orders WHERE created_at>=? AND created_at<?",
      from,
      until,
    );
    summary.orders = nonNegativeInteger(summary.orders, "Jumlah pesanan");
    summary.revenue = (
      await store.get(
        "SELECT COALESCE(SUM(o.total),0) revenue FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?",
        from,
        until,
      )
    ).revenue;
    summary.revenue = nonNegativeInteger(summary.revenue, "Revenue");

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
          AND UPPER(COALESCE(p.method,'')) IN ('CASH','COD','CASH_ON_DELIVERY')
          AND o.status='DELIVERED'
          AND (s.status IS NULL OR s.status<>'VERIFIED')`,
      from,
      until,
    );

    const digitalPayments = await store.get(
      `SELECT COUNT(*) count,
              COALESCE(SUM(o.total),0) amount
         FROM payments p
         JOIN orders o ON o.id=p.order_id
        WHERE p.status='PAID'
          AND p.paid_at>=? AND p.paid_at<?
          AND UPPER(COALESCE(p.method,'')) IN (
            'QRIS','TRANSFER','BANK_TRANSFER','BANK TRANSFER','VIRTUAL_ACCOUNT','VA'
          )`,
      from,
      until,
    );

    return out({
      period: {
        preset: period.requestedPreset,
        fromDate: period.fromDate,
        toDate: period.toDate,
        days: period.days,
      },
      today: summary,
      statuses,
      paymentStatuses,
      codOutstanding: {
        count: nonNegativeInteger(codOutstanding.count, "Jumlah COD belum final"),
        amount: nonNegativeInteger(codOutstanding.amount, "Nilai COD belum final"),
      },
      digitalPayments: {
        count: nonNegativeInteger(digitalPayments.count, "Jumlah QRIS dan Transfer"),
        amount: nonNegativeInteger(digitalPayments.amount, "Nilai QRIS dan Transfer"),
      },
      customers: nonNegativeInteger(
        (
          await store.get("SELECT COUNT(*) count FROM users WHERE role='CUSTOMER'")
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
    return out(
      { error: error?.message || "Terjadi kesalahan server" },
      error?.status || 500,
    );
  }
}
