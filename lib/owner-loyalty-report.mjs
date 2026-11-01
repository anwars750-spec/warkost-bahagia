import * as store from "./store.mjs";
import { required } from "./domain.mjs";
import { resolveManagerPeriod } from "./manager-analytics.mjs";

const number = (value) => Number(value || 0);
const percent = (value, total) =>
  total > 0 ? Number(((number(value) / number(total)) * 100).toFixed(1)) : 0;

export async function ownerLoyaltyReport(user, input = {}, now = new Date()) {
  required(user, ["OWNER"]);
  const period = resolveManagerPeriod(input, now);

  const [accountRow, activityRow, paidRow, ruleRows, rulePerformanceRows, memberRows] =
    await Promise.all([
      store.get(
        `SELECT COUNT(*) member_count,
                COALESCE(SUM(balance),0) outstanding_points,
                COALESCE(AVG(balance),0) average_balance,
                COALESCE(MAX(balance),0) max_balance
           FROM loyalty_accounts`,
      ),
      store.get(
        `SELECT
            COALESCE(SUM(CASE WHEN kind='EARN' THEN amount ELSE 0 END),0) earned_points,
            COALESCE(SUM(CASE WHEN kind='REDEEM' THEN -amount ELSE 0 END),0) redeemed_points,
            COALESCE(SUM(CASE WHEN kind='RESTORE' THEN amount ELSE 0 END),0) restored_points,
            SUM(CASE WHEN kind='EARN' THEN 1 ELSE 0 END) earn_events,
            SUM(CASE WHEN kind='REDEEM' THEN 1 ELSE 0 END) redeem_events,
            SUM(CASE WHEN kind='RESTORE' THEN 1 ELSE 0 END) restore_events,
            COUNT(DISTINCT user_id) active_members
           FROM loyalty_transactions
          WHERE created_at>=? AND created_at<?`,
        period.from,
        period.until,
      ),
      store.get(
        `SELECT COUNT(*) paid_orders,
                COUNT(DISTINCT o.customer_id) unique_customers,
                COALESCE(SUM(o.total),0) revenue,
                COALESCE(SUM(o.loyalty_discount),0) loyalty_discount,
                COALESCE(SUM(o.loyalty_points_redeemed),0) points_redeemed
           FROM orders o
           JOIN payments p ON p.order_id=o.id
          WHERE p.status='PAID'
            AND o.loyalty_reward_rule_id IS NOT NULL
            AND p.paid_at>=? AND p.paid_at<?`,
        period.from,
        period.until,
      ),
      store.all(
        `SELECT id,name,points_required,reward_type,reward_value,minimum_order,
                maximum_discount,active,created_at,updated_at
           FROM loyalty_reward_rules
          ORDER BY active DESC,points_required ASC,id DESC`,
      ),
      store.all(
        `SELECT o.loyalty_reward_rule_id rule_id,
                COUNT(*) paid_orders,
                COUNT(DISTINCT o.customer_id) unique_customers,
                COALESCE(SUM(o.total),0) revenue,
                COALESCE(SUM(o.loyalty_discount),0) discount_amount,
                COALESCE(SUM(o.loyalty_points_redeemed),0) points_redeemed
           FROM orders o
           JOIN payments p ON p.order_id=o.id
          WHERE p.status='PAID'
            AND o.loyalty_reward_rule_id IS NOT NULL
            AND p.paid_at>=? AND p.paid_at<?
          GROUP BY o.loyalty_reward_rule_id`,
        period.from,
        period.until,
      ),
      store.all(
        `SELECT u.id,u.name,u.email,a.balance,
                COALESCE(SUM(CASE WHEN lt.kind='EARN' THEN lt.amount ELSE 0 END),0) earned_points,
                COALESCE(SUM(CASE WHEN lt.kind='REDEEM' THEN -lt.amount ELSE 0 END),0) redeemed_points,
                MAX(lt.created_at) last_activity
           FROM loyalty_accounts a
           JOIN users u ON u.id=a.user_id
           LEFT JOIN loyalty_transactions lt ON lt.user_id=a.user_id
          GROUP BY u.id,u.name,u.email,a.balance
          ORDER BY earned_points DESC, a.balance DESC
          LIMIT 10`,
      ),
    ]);

  const perfMap = new Map(
    rulePerformanceRows.map((row) => [number(row.rule_id), row]),
  );
  const rules = ruleRows.map((rule) => {
    const perf = perfMap.get(number(rule.id)) || {};
    const paidOrders = number(perf.paid_orders);
    const revenue = number(perf.revenue);
    const discount = number(perf.discount_amount);
    return {
      ...rule,
      id: number(rule.id),
      points_required: number(rule.points_required),
      reward_value: number(rule.reward_value),
      minimum_order: number(rule.minimum_order),
      maximum_discount:
        rule.maximum_discount === null ? null : number(rule.maximum_discount),
      active: Boolean(rule.active),
      period_paid_orders: paidOrders,
      period_unique_customers: number(perf.unique_customers),
      period_revenue: revenue,
      period_discount: discount,
      period_points_redeemed: number(perf.points_redeemed),
      period_aov: paidOrders ? Math.round(revenue / paidOrders) : 0,
      discount_to_revenue: percent(discount, revenue),
    };
  });

  const earnedPoints = number(activityRow.earned_points);
  const redeemedPoints = number(activityRow.redeemed_points);
  const paidOrders = number(paidRow.paid_orders);
  const loyaltyRevenue = number(paidRow.revenue);
  const loyaltyDiscount = number(paidRow.loyalty_discount);
  const activeRules = rules.filter((rule) => rule.active);
  const usedRules = rules
    .filter((rule) => rule.period_paid_orders > 0)
    .sort((a, b) => b.period_paid_orders - a.period_paid_orders);
  const highestRevenueRules = [...rules]
    .filter((rule) => rule.period_revenue > 0)
    .sort((a, b) => b.period_revenue - a.period_revenue);

  const insights = [];
  if (usedRules[0])
    insights.push({
      type: "positive",
      title: "Reward paling sering dipakai",
      text: `${usedRules[0].name} dipakai pada ${usedRules[0].period_paid_orders} order berbayar di periode ini.`,
    });
  if (highestRevenueRules[0])
    insights.push({
      type: "positive",
      title: "Revenue loyalty tertinggi",
      text: `${highestRevenueRules[0].name} teratribusi ke Rp${highestRevenueRules[0].period_revenue.toLocaleString("id-ID")} revenue.`,
    });
  if (activeRules.length && !paidOrders)
    insights.push({
      type: "warning",
      title: "Reward aktif belum digunakan",
      text: `${activeRules.length} reward aktif belum menghasilkan order berbayar dengan redemption pada periode ini.`,
    });
  if (loyaltyRevenue > 0 && percent(loyaltyDiscount, loyaltyRevenue) >= 20)
    insights.push({
      type: "warning",
      title: "Eksposur discount loyalty tinggi",
      text: `Discount loyalty setara ${percent(loyaltyDiscount, loyaltyRevenue)}% dari revenue order loyalty. Evaluasi bersama margin/HPP.`,
    });
  if (!number(activityRow.active_members))
    insights.push({
      type: "neutral",
      title: "Belum ada aktivitas loyalty",
      text: "Belum ada earn, redeem, atau restore poin pada periode yang dipilih.",
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
      members: number(accountRow.member_count),
      outstanding_points: number(accountRow.outstanding_points),
      average_balance: Math.round(number(accountRow.average_balance)),
      max_balance: number(accountRow.max_balance),
      active_members: number(activityRow.active_members),
      earned_points: earnedPoints,
      redeemed_points: redeemedPoints,
      restored_points: number(activityRow.restored_points),
      earn_events: number(activityRow.earn_events),
      redeem_events: number(activityRow.redeem_events),
      restore_events: number(activityRow.restore_events),
      point_usage_ratio: percent(redeemedPoints, earnedPoints),
      paid_orders: paidOrders,
      unique_customers: number(paidRow.unique_customers),
      loyalty_revenue: loyaltyRevenue,
      loyalty_discount: loyaltyDiscount,
      loyalty_aov: paidOrders ? Math.round(loyaltyRevenue / paidOrders) : 0,
      discount_to_revenue: percent(loyaltyDiscount, loyaltyRevenue),
      active_rules: activeRules.length,
      total_rules: rules.length,
    },
    top_rules: usedRules.slice(0, 5),
    rules,
    members: memberRows.map((row) => ({
      id: number(row.id),
      name: row.name,
      email: row.email,
      balance: number(row.balance),
      earned_points: number(row.earned_points),
      redeemed_points: number(row.redeemed_points),
      last_activity: row.last_activity || null,
    })),
    insights,
    note: "Poin beredar adalah saldo poin member, bukan liabilitas rupiah langsung. Nilai biaya loyalty baru dapat dinilai penuh bersama HPP dan biaya operasional.",
  };
}
