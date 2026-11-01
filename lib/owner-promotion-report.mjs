import * as store from "./store.mjs";
import { required } from "./domain.mjs";
import { resolveManagerPeriod } from "./manager-analytics.mjs";

const number = (value) => Number(value || 0);
const percent = (value, total) =>
  total > 0 ? Number(((number(value) / number(total)) * 100).toFixed(1)) : 0;

function statusOf(row, nowMs = Date.now()) {
  if (!row.active) return "INACTIVE";
  const starts = Date.parse(String(row.starts_at).replace(" ", "T") + "Z");
  const ends = Date.parse(String(row.ends_at).replace(" ", "T") + "Z");
  if (nowMs < starts) return "SCHEDULED";
  if (nowMs >= ends) return "EXPIRED";
  return "ACTIVE";
}

function benefitLabel(row) {
  if (row.benefit_type === "FREE_ITEM") return "Gratis item";
  if (row.benefit_type === "PERCENT") return `${number(row.discount_value)}%`;
  if (row.benefit_type === "FIXED")
    return `Rp${number(row.discount_value).toLocaleString("id-ID")}`;
  return "Benefit promo";
}

export async function ownerPromotionReport(user, input = {}, now = new Date()) {
  required(user, ["OWNER"]);
  const period = resolveManagerPeriod(input, now);
  const nowMs = now.getTime();

  const [promotions, paidRows, redemptionRows, globalRow, totalRevenueRow] =
    await Promise.all([
      store.all(
        `SELECT id,title,description,badge,starts_at,ends_at,active,promotion_family,
                benefit_type,discount_value,minimum_order,max_discount,quota,used_count,
                per_member_limit,scope_type,payment_eligibility
           FROM promotions ORDER BY id DESC`,
      ),
      store.all(
        `SELECT o.promotion_id,
                COUNT(*) paid_orders,
                COUNT(DISTINCT o.customer_id) unique_customers,
                COALESCE(SUM(o.total),0) revenue,
                COALESCE(SUM(o.promotion_discount),0) discount_amount
           FROM orders o
           JOIN payments pay ON pay.order_id=o.id
          WHERE o.promotion_id IS NOT NULL
            AND pay.status='PAID'
            AND pay.paid_at>=? AND pay.paid_at<?
          GROUP BY o.promotion_id`,
        period.from,
        period.until,
      ),
      store.all(
        `SELECT promotion_id,
                SUM(CASE WHEN status='APPLIED' THEN 1 ELSE 0 END) applied_count,
                SUM(CASE WHEN status='RESTORED' THEN 1 ELSE 0 END) restored_count
           FROM promotion_redemptions
          WHERE created_at>=? AND created_at<?
          GROUP BY promotion_id`,
        period.from,
        period.until,
      ),
      store.get(
        `SELECT COUNT(*) paid_orders,
                COUNT(DISTINCT o.customer_id) unique_customers,
                COALESCE(SUM(o.total),0) revenue,
                COALESCE(SUM(o.promotion_discount),0) discount_amount
           FROM orders o
           JOIN payments pay ON pay.order_id=o.id
          WHERE o.promotion_id IS NOT NULL
            AND pay.status='PAID'
            AND pay.paid_at>=? AND pay.paid_at<?`,
        period.from,
        period.until,
      ),
      store.get(
        `SELECT COALESCE(SUM(o.total),0) revenue
           FROM orders o
           JOIN payments pay ON pay.order_id=o.id
          WHERE pay.status='PAID' AND pay.paid_at>=? AND pay.paid_at<?`,
        period.from,
        period.until,
      ),
    ]);

  const paidMap = new Map(paidRows.map((row) => [number(row.promotion_id), row]));
  const redemptionMap = new Map(
    redemptionRows.map((row) => [number(row.promotion_id), row]),
  );

  const rows = promotions.map((promotion) => {
    const paid = paidMap.get(number(promotion.id)) || {};
    const redemption = redemptionMap.get(number(promotion.id)) || {};
    const status = statusOf(promotion, nowMs);
    const endsAt = Date.parse(
      String(promotion.ends_at).replace(" ", "T") + "Z",
    );
    const endingSoon =
      status === "ACTIVE" && endsAt - nowMs >= 0 && endsAt - nowMs <= 3 * 86400000;
    const paidOrders = number(paid.paid_orders);
    const revenue = number(paid.revenue);
    const discountAmount = number(paid.discount_amount);
    const quota = promotion.quota === null ? null : number(promotion.quota);
    const lifetimeUsed = number(promotion.used_count);
    return {
      ...promotion,
      id: number(promotion.id),
      active: Boolean(promotion.active),
      status,
      ending_soon: endingSoon,
      benefit_label: benefitLabel(promotion),
      period_paid_orders: paidOrders,
      period_unique_customers: number(paid.unique_customers),
      period_revenue: revenue,
      period_discount: discountAmount,
      period_aov: paidOrders ? Math.round(revenue / paidOrders) : 0,
      applied_count: number(redemption.applied_count),
      restored_count: number(redemption.restored_count),
      lifetime_used: lifetimeUsed,
      quota,
      quota_usage: quota ? percent(lifetimeUsed, quota) : null,
      discount_to_revenue: percent(discountAmount, revenue),
      performance:
        paidOrders > 0
          ? "TERPAKAI"
          : status === "ACTIVE"
            ? "BELUM DIGUNAKAN"
            : "TANPA TRANSAKSI PERIODE",
    };
  });

  const promoRevenue = number(globalRow.revenue);
  const promoDiscount = number(globalRow.discount_amount);
  const promoPaidOrders = number(globalRow.paid_orders);
  const totalRevenue = number(totalRevenueRow.revenue);
  const active = rows.filter((row) => row.status === "ACTIVE");
  const scheduled = rows.filter((row) => row.status === "SCHEDULED");
  const endingSoon = rows.filter((row) => row.ending_soon);
  const inactive = rows.filter((row) =>
    ["INACTIVE", "EXPIRED"].includes(row.status),
  );
  const activeUnused = active.filter((row) => row.period_paid_orders === 0);
  const rankedByRevenue = [...rows]
    .filter((row) => row.period_revenue > 0)
    .sort((a, b) => b.period_revenue - a.period_revenue);
  const rankedByUsage = [...rows]
    .filter((row) => row.period_paid_orders > 0)
    .sort((a, b) => b.period_paid_orders - a.period_paid_orders);

  const insights = [];
  if (rankedByRevenue[0])
    insights.push({
      type: "positive",
      title: "Revenue promo tertinggi",
      text: `${rankedByRevenue[0].title} menghasilkan Rp${rankedByRevenue[0].period_revenue.toLocaleString("id-ID")} revenue teratribusi pada periode ini.`,
    });
  if (rankedByUsage[0])
    insights.push({
      type: "info",
      title: "Promo paling sering dipakai",
      text: `${rankedByUsage[0].title} digunakan pada ${rankedByUsage[0].period_paid_orders} order berbayar.`,
    });
  if (activeUnused.length)
    insights.push({
      type: "warning",
      title: "Promo aktif belum menghasilkan transaksi",
      text: `${activeUnused.length} promo aktif belum digunakan pada order berbayar di periode ini.`,
    });
  if (endingSoon.length)
    insights.push({
      type: "warning",
      title: "Promo segera berakhir",
      text: `${endingSoon.length} promo aktif akan berakhir dalam ≤ 3 hari.`,
    });
  if (promoRevenue > 0 && percent(promoDiscount, promoRevenue) >= 25)
    insights.push({
      type: "warning",
      title: "Eksposur diskon tinggi",
      text: `Nilai diskon setara ${percent(promoDiscount, promoRevenue)}% dari revenue order promo. Evaluasi bersama margin/HPP sebelum memperpanjang campaign.`,
    });
  if (!promoPaidOrders)
    insights.push({
      type: "neutral",
      title: "Belum ada transaksi promo",
      text: "Belum ada order berbayar yang memakai promo pada periode yang dipilih.",
    });

  return {
    generated_at: new Date().toISOString(),
    period: {
      preset: period.preset,
      from: period.fromDate,
      to: period.toDate,
      days: period.days,
    },
    summary: {
      total_promotions: rows.length,
      active: active.length,
      scheduled: scheduled.length,
      ending_soon: endingSoon.length,
      inactive_or_expired: inactive.length,
      paid_orders: promoPaidOrders,
      unique_customers: number(globalRow.unique_customers),
      promo_revenue: promoRevenue,
      promo_discount: promoDiscount,
      promo_aov: promoPaidOrders ? Math.round(promoRevenue / promoPaidOrders) : 0,
      promo_revenue_contribution: percent(promoRevenue, totalRevenue),
      discount_to_promo_revenue: percent(promoDiscount, promoRevenue),
      total_paid_revenue: totalRevenue,
      active_unused: activeUnused.length,
    },
    top: {
      revenue: rankedByRevenue.slice(0, 3),
      usage: rankedByUsage.slice(0, 3),
    },
    promotions: rows,
    insights,
    note: "Revenue promo adalah revenue order PAID yang memakai promo, bukan laba bersih. Profitabilitas promo membutuhkan data HPP dan biaya operasional.",
  };
}
