import * as store from "./store.mjs";
import { required } from "./domain.mjs";
import { resolveManagerPeriod, formatWeightedQuantity } from "./manager-analytics.mjs";

const VALID_SALES_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "ASSIGNED",
  "PICKED_UP",
  "ON_DELIVERY",
  "DELIVERED",
]);

const MAIN_CATEGORIES = new Set(["Makanan", "Minuman", "Bahan Baku"]);
const number = (value) => Number(value || 0);
const percent = (value, total) =>
  total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
const comparison = (current, previous) =>
  previous > 0
    ? Number((((current - previous) / previous) * 100).toFixed(1))
    : current > 0
      ? 100
      : 0;

function summarizeOrders(rows) {
  const active = rows.filter((row) => VALID_SALES_STATUSES.has(row.status));
  const cancelled = rows.filter((row) => row.status === "CANCELLED");
  const delivered = rows.filter((row) => row.status === "DELIVERED");
  const paid = rows.filter((row) => row.payment_status === "PAID");
  return {
    created: rows.length,
    active: active.length,
    cancelled: cancelled.length,
    delivered: delivered.length,
    paid: paid.length,
    orderValue: active.reduce((sum, row) => sum + number(row.total), 0),
  };
}

function mapById(rows, key = "id") {
  return new Map(rows.map((row) => [number(row[key]), row]));
}

function statusCounts(rows) {
  const result = {};
  for (const row of rows) result[row.status] = number(row.count);
  return result;
}

export function classifyOwnerBusinessHealth(input = {}) {
  const revenueGrowth = number(input.revenueGrowth);
  const cancelRate = number(input.cancelRate);
  const paymentSuccessRate = number(input.paymentSuccessRate);
  const paymentSample = number(input.paymentSample);
  const codOutstandingAmount = number(input.codOutstandingAmount);
  const ownerPendingAmount = number(input.ownerPendingAmount);
  const deliveryCompletionRate = number(input.deliveryCompletionRate);
  const deliverySample = number(input.deliverySample);

  let score = 100;
  const signals = [];

  if (revenueGrowth < -20) {
    score -= 20;
    signals.push({ level: "danger", text: `Revenue turun ${Math.abs(revenueGrowth)}% dibanding periode sebelumnya.` });
  } else if (revenueGrowth < 0) {
    score -= 10;
    signals.push({ level: "warning", text: `Revenue turun ${Math.abs(revenueGrowth)}% dibanding periode sebelumnya.` });
  } else if (revenueGrowth > 0) {
    signals.push({ level: "good", text: `Revenue tumbuh ${revenueGrowth}% dibanding periode sebelumnya.` });
  }

  if (cancelRate > 15) {
    score -= 20;
    signals.push({ level: "danger", text: `Cancellation rate tinggi di ${cancelRate}%.` });
  } else if (cancelRate > 5) {
    score -= 10;
    signals.push({ level: "warning", text: `Cancellation rate ${cancelRate}% perlu dipantau.` });
  }

  if (paymentSample >= 3 && paymentSuccessRate < 75) {
    score -= 20;
    signals.push({ level: "danger", text: `Payment success hanya ${paymentSuccessRate}%.` });
  } else if (paymentSample >= 3 && paymentSuccessRate < 90) {
    score -= 10;
    signals.push({ level: "warning", text: `Payment success ${paymentSuccessRate}% masih dapat ditingkatkan.` });
  }

  if (codOutstandingAmount > 0) {
    score -= 10;
    signals.push({ level: "warning", text: "Masih ada uang COD yang belum final/terverifikasi." });
  }
  if (ownerPendingAmount > 0) {
    score -= 10;
    signals.push({ level: "warning", text: "Masih ada setoran Manager yang menunggu konfirmasi Owner." });
  }

  if (deliverySample >= 3 && deliveryCompletionRate < 80) {
    score -= 10;
    signals.push({ level: "warning", text: `Delivery completion ${deliveryCompletionRate}% perlu perhatian.` });
  }

  score = Math.max(0, Math.min(100, score));
  const status = score >= 80 ? "SEHAT" : score >= 60 ? "PERLU PERHATIAN" : "KRITIS";
  if (!signals.length)
    signals.push({ level: "good", text: "Tidak ada indikator operasional utama yang membutuhkan perhatian khusus." });

  return {
    score,
    status,
    signals,
    note: "Status kesehatan bisnis berbasis revenue, order, pembayaran, delivery, dan akuntabilitas kas; bukan perhitungan laba-rugi.",
  };
}

export async function ownerBusinessReport(user, input = {}, now = new Date()) {
  required(user, ["OWNER"]);
  const period = resolveManagerPeriod(input, now);

  const [orders, previousOrders] = await Promise.all([
    store.all(
      `SELECT o.id,o.status,o.total,o.created_at,p.status payment_status,p.method,p.paid_at
         FROM orders o LEFT JOIN payments p ON p.order_id=o.id
        WHERE o.created_at>=? AND o.created_at<? ORDER BY o.created_at,o.id`,
      period.from,
      period.until,
    ),
    store.all(
      `SELECT o.id,o.status,o.total,o.created_at,p.status payment_status,p.method,p.paid_at
         FROM orders o LEFT JOIN payments p ON p.order_id=o.id
        WHERE o.created_at>=? AND o.created_at<? ORDER BY o.created_at,o.id`,
      period.previousFrom,
      period.previousUntil,
    ),
  ]);

  const current = summarizeOrders(orders);
  const previous = summarizeOrders(previousOrders);

  const [revenueRow, previousRevenueRow] = await Promise.all([
    store.get(
      `SELECT COUNT(*) transactions,COALESCE(SUM(o.total),0) revenue
         FROM payments p JOIN orders o ON o.id=p.order_id
        WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?`,
      period.from,
      period.until,
    ),
    store.get(
      `SELECT COUNT(*) transactions,COALESCE(SUM(o.total),0) revenue
         FROM payments p JOIN orders o ON o.id=p.order_id
        WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?`,
      period.previousFrom,
      period.previousUntil,
    ),
  ]);

  const revenue = number(revenueRow.revenue);
  const previousRevenue = number(previousRevenueRow.revenue);

  const items = await store.all(
    `SELECT i.order_id,i.product_id,i.name,i.price,i.quantity,i.stock_unit,i.price_unit_quantity,
            c.name category_name,s.name subcategory_name
       FROM order_items i
       JOIN orders o ON o.id=i.order_id
       JOIN products p ON p.id=i.product_id
       JOIN categories c ON c.id=p.category_id
       LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
      WHERE o.created_at>=? AND o.created_at<? AND o.status<>'CANCELLED'
        AND EXISTS (SELECT 1 FROM payments pay WHERE pay.order_id=o.id AND pay.status='PAID')`,
    period.from,
    period.until,
  );

  const previousQuantityRow = await store.get(
    `SELECT COALESCE(SUM(i.quantity),0) quantity
       FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE o.created_at>=? AND o.created_at<? AND o.status<>'CANCELLED'
        AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='PAID')`,
    period.previousFrom,
    period.previousUntil,
  );

  const categoryMap = new Map();
  const subcategoryMap = new Map();
  const productMap = new Map();
  let quantity = 0;
  let merchandiseRevenue = 0;

  for (const item of items) {
    const itemQty = number(item.quantity);
    const itemRevenue = Math.trunc(
      (number(item.price) * itemQty) / Math.max(1, number(item.price_unit_quantity)),
    );
    quantity += itemQty;
    merchandiseRevenue += itemRevenue;
    const categoryName = item.category_name || "Lainnya";

    if (MAIN_CATEGORIES.has(categoryName)) {
      const category = categoryMap.get(categoryName) || { name: categoryName, quantity: 0, revenue: 0 };
      category.quantity += itemQty;
      category.revenue += itemRevenue;
      categoryMap.set(categoryName, category);
    }

    if (item.subcategory_name) {
      const key = `${categoryName}:${item.subcategory_name}`;
      const subcategory = subcategoryMap.get(key) || {
        name: item.subcategory_name,
        category: categoryName,
        quantity: 0,
        revenue: 0,
      };
      subcategory.quantity += itemQty;
      subcategory.revenue += itemRevenue;
      subcategoryMap.set(key, subcategory);
    }

    const product = productMap.get(number(item.product_id)) || {
      id: number(item.product_id),
      name: item.name,
      category: categoryName,
      subcategory: item.subcategory_name || null,
      unit: item.stock_unit || "PCS",
      quantity: 0,
      revenue: 0,
    };
    product.quantity += itemQty;
    product.revenue += itemRevenue;
    productMap.set(product.id, product);
  }

  const rank = (values) =>
    [...values].map((row) => ({ ...row, contribution: percent(row.revenue, merchandiseRevenue) }));

  const categories = rank(categoryMap.values()).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const subcategories = rank(subcategoryMap.values()).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const products = rank(productMap.values())
    .map((row) => ({ ...row, quantity_label: formatWeightedQuantity(row.quantity, row.unit) }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const productsByQuantity = [...products].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

  const unsoldProducts = await store.all(
    `SELECT p.id,p.name,c.name category_name,s.name subcategory_name,p.stock_quantity,p.stock_unit
       FROM products p
       JOIN categories c ON c.id=p.category_id
       LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
      WHERE p.active=1
        AND NOT EXISTS (
          SELECT 1 FROM order_items i
          JOIN orders o ON o.id=i.order_id
          JOIN payments pay ON pay.order_id=o.id
          WHERE i.product_id=p.id AND o.created_at>=? AND o.created_at<?
            AND o.status<>'CANCELLED' AND pay.status='PAID'
        )
      ORDER BY p.stock_quantity DESC,p.name LIMIT 10`,
    period.from,
    period.until,
  );

  const paymentStatusesRows = await store.all(
    `SELECT COALESCE(p.status,'UNPAID') status,COUNT(*) count
       FROM orders o LEFT JOIN payments p ON p.order_id=o.id
      WHERE o.created_at>=? AND o.created_at<?
      GROUP BY COALESCE(p.status,'UNPAID')`,
    period.from,
    period.until,
  );
  const paymentStatuses = statusCounts(paymentStatusesRows);
  const paymentSample = Object.values(paymentStatuses).reduce((sum, value) => sum + number(value), 0);
  const paymentSuccessRate = percent(number(paymentStatuses.PAID), paymentSample);

  const paymentMethods = await store.all(
    `SELECT UPPER(COALESCE(p.method,'LAINNYA')) method,COUNT(*) transactions,COALESCE(SUM(o.total),0) amount
       FROM payments p JOIN orders o ON o.id=p.order_id
      WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?
      GROUP BY UPPER(COALESCE(p.method,'LAINNYA')) ORDER BY amount DESC`,
    period.from,
    period.until,
  );

  const [codPeriod, codCurrent, adminCashPeriod, managerCashPeriod, ownerPendingCurrent] = await Promise.all([
    store.get(
      `SELECT COUNT(*) count,COALESCE(SUM(COALESCE(s.expected_amount,p.amount,o.total)),0) amount
         FROM orders o JOIN payments p ON p.order_id=o.id
         LEFT JOIN cod_settlements s ON s.order_id=o.id
        WHERE o.created_at>=? AND o.created_at<?
          AND UPPER(COALESCE(p.method,'')) IN ('CASH','COD','CASH_ON_DELIVERY')
          AND o.status='DELIVERED' AND (s.status IS NULL OR s.status<>'VERIFIED')`,
      period.from,
      period.until,
    ),
    store.get(
      `SELECT COUNT(*) count,COALESCE(SUM(COALESCE(s.expected_amount,p.amount,o.total)),0) amount
         FROM orders o JOIN payments p ON p.order_id=o.id
         LEFT JOIN cod_settlements s ON s.order_id=o.id
        WHERE UPPER(COALESCE(p.method,'')) IN ('CASH','COD','CASH_ON_DELIVERY')
          AND o.status='DELIVERED' AND (s.status IS NULL OR s.status<>'VERIFIED')`,
    ),
    store.get(
      `SELECT COUNT(*) count,
              COALESCE(SUM(expected_amount),0) expected_amount,
              COALESCE(SUM(submitted_amount),0) submitted_amount,
              COALESCE(SUM(CASE WHEN status='VERIFIED' THEN manager_received_amount ELSE 0 END),0) verified_amount,
              SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending_count
         FROM admin_shift_settlements WHERE submitted_at>=? AND submitted_at<?`,
      period.from,
      period.until,
    ),
    store.get(
      `SELECT COUNT(*) count,
              COALESCE(SUM(expected_amount),0) expected_amount,
              COALESCE(SUM(submitted_amount),0) submitted_amount,
              COALESCE(SUM(CASE WHEN status='VERIFIED' THEN owner_received_amount ELSE 0 END),0) verified_amount,
              SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending_count,
              SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) rejected_count
         FROM manager_owner_settlements WHERE submitted_at>=? AND submitted_at<?`,
      period.from,
      period.until,
    ),
    store.get(
      `SELECT COUNT(*) count,COALESCE(SUM(submitted_amount),0) amount
         FROM manager_owner_settlements WHERE status='PENDING'`,
    ),
  ]);

  const managers = await store.all("SELECT id,name,active FROM users WHERE role='MANAGER' ORDER BY active DESC,name");
  const managerAdminVerification = await store.all(
    `SELECT manager_id,
            COUNT(*) verified_settlements,
            COALESCE(SUM(manager_received_amount),0) verified_amount,
            COALESCE(SUM(manager_overage_amount),0) overage_amount
       FROM admin_shift_settlements
      WHERE manager_id IS NOT NULL AND verified_at>=? AND verified_at<?
      GROUP BY manager_id`,
    period.from,
    period.until,
  );
  const managerOwnerRows = await store.all(
    `SELECT manager_id,COUNT(*) owner_settlements,
            COALESCE(SUM(submitted_amount),0) submitted_amount,
            SUM(CASE WHEN status='VERIFIED' THEN 1 ELSE 0 END) verified_count,
            SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending_count,
            SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) rejected_count
       FROM manager_owner_settlements
      WHERE submitted_at>=? AND submitted_at<? GROUP BY manager_id`,
    period.from,
    period.until,
  );
  const managerVerificationMap = mapById(managerAdminVerification, "manager_id");
  const managerOwnerMap = mapById(managerOwnerRows, "manager_id");
  const managerPerformance = managers.map((manager) => {
    const cash = managerVerificationMap.get(number(manager.id)) || {};
    const ownerCash = managerOwnerMap.get(number(manager.id)) || {};
    return {
      id: number(manager.id),
      name: manager.name,
      active: Boolean(manager.active),
      admin_settlements_verified: number(cash.verified_settlements),
      admin_cash_verified: number(cash.verified_amount),
      admin_cash_overage: number(cash.overage_amount),
      owner_settlements: number(ownerCash.owner_settlements),
      owner_cash_submitted: number(ownerCash.submitted_amount),
      owner_verified_count: number(ownerCash.verified_count),
      owner_pending_count: number(ownerCash.pending_count),
      owner_rejected_count: number(ownerCash.rejected_count),
    };
  });

  const operators = await store.all("SELECT id,name,active FROM admin_operators ORDER BY active DESC,name");
  const operatorShifts = await store.all(
    `SELECT operator_id,COUNT(*) shifts,
            COALESCE(SUM(CASE WHEN ended_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE,started_at,ended_at) ELSE 0 END),0) minutes_worked
       FROM admin_shifts WHERE started_at>=? AND started_at<? GROUP BY operator_id`,
    period.from,
    period.until,
  );
  const operatorReceipts = await store.all(
    `SELECT operator_id,COUNT(*) receipts,
            COALESCE(SUM(expected_amount),0) expected_amount,
            COALESCE(SUM(actual_amount),0) actual_amount,
            COALESCE(SUM(overage_amount),0) overage_amount
       FROM admin_cash_receipts WHERE received_at>=? AND received_at<? GROUP BY operator_id`,
    period.from,
    period.until,
  );
  const operatorSettlements = await store.all(
    `SELECT operator_id,COUNT(*) settlements,
            COALESCE(SUM(submitted_amount),0) submitted_amount,
            SUM(CASE WHEN status='VERIFIED' THEN 1 ELSE 0 END) verified_count,
            SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending_count
       FROM admin_shift_settlements WHERE submitted_at>=? AND submitted_at<? GROUP BY operator_id`,
    period.from,
    period.until,
  );
  const shiftMap = mapById(operatorShifts, "operator_id");
  const receiptMap = mapById(operatorReceipts, "operator_id");
  const settlementMap = mapById(operatorSettlements, "operator_id");
  const adminPerformance = operators.map((operator) => {
    const shifts = shiftMap.get(number(operator.id)) || {};
    const receipts = receiptMap.get(number(operator.id)) || {};
    const settlements = settlementMap.get(number(operator.id)) || {};
    return {
      id: number(operator.id),
      name: operator.name,
      active: Boolean(operator.active),
      shifts: number(shifts.shifts),
      minutes_worked: number(shifts.minutes_worked),
      cod_receipts: number(receipts.receipts),
      cod_expected: number(receipts.expected_amount),
      cod_received: number(receipts.actual_amount),
      cash_overage: number(receipts.overage_amount),
      settlements: number(settlements.settlements),
      settlement_amount: number(settlements.submitted_amount),
      verified_count: number(settlements.verified_count),
      pending_count: number(settlements.pending_count),
    };
  });

  const driverPerformance = await store.all(
    `SELECT u.id,u.name,u.active,
            COUNT(d.id) assignments,
            SUM(CASE WHEN o.status='DELIVERED' THEN 1 ELSE 0 END) delivered,
            SUM(CASE WHEN o.status='CANCELLED' THEN 1 ELSE 0 END) cancelled,
            COALESCE(AVG(CASE WHEN d.accepted_at IS NOT NULL AND d.delivered_at IS NOT NULL
                         THEN TIMESTAMPDIFF(MINUTE,d.accepted_at,d.delivered_at) END),0) avg_delivery_minutes,
            COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.method,'')) IN ('CASH','COD','CASH_ON_DELIVERY')
                               AND o.status='DELIVERED' THEN o.total ELSE 0 END),0) cod_carried,
            COALESCE(SUM(CASE WHEN cs.status='VERIFIED' THEN COALESCE(cs.cash_amount,cs.expected_amount,0) ELSE 0 END),0) cod_verified
       FROM deliveries d
       JOIN orders o ON o.id=d.order_id
       JOIN users u ON u.id=d.driver_id
       LEFT JOIN payments p ON p.order_id=o.id
       LEFT JOIN cod_settlements cs ON cs.order_id=o.id
      WHERE COALESCE(d.accepted_at,o.created_at)>=? AND COALESCE(d.accepted_at,o.created_at)<?
      GROUP BY u.id,u.name,u.active ORDER BY delivered DESC,assignments DESC,u.name`,
    period.from,
    period.until,
  );
  for (const driver of driverPerformance) {
    driver.id = number(driver.id);
    driver.active = Boolean(driver.active);
    driver.assignments = number(driver.assignments);
    driver.delivered = number(driver.delivered);
    driver.cancelled = number(driver.cancelled);
    driver.avg_delivery_minutes = Number(number(driver.avg_delivery_minutes).toFixed(1));
    driver.cod_carried = number(driver.cod_carried);
    driver.cod_verified = number(driver.cod_verified);
    driver.completion_rate = percent(driver.delivered, driver.assignments);
  }

  const totalDeliveryAssignments = driverPerformance.reduce((sum, row) => sum + row.assignments, 0);
  const totalDelivered = driverPerformance.reduce((sum, row) => sum + row.delivered, 0);
  const deliveryCompletionRate = percent(totalDelivered, totalDeliveryAssignments);
  const cancelRate = percent(current.cancelled, current.created);
  const revenueGrowth = comparison(revenue, previousRevenue);
  const aov = number(revenueRow.transactions) ? Math.round(revenue / number(revenueRow.transactions)) : 0;
  const previousAov = number(previousRevenueRow.transactions)
    ? Math.round(previousRevenue / number(previousRevenueRow.transactions))
    : 0;

  const health = classifyOwnerBusinessHealth({
    revenueGrowth,
    cancelRate,
    paymentSuccessRate,
    paymentSample,
    codOutstandingAmount: number(codCurrent.amount),
    ownerPendingAmount: number(ownerPendingCurrent.amount),
    deliveryCompletionRate,
    deliverySample: totalDeliveryAssignments,
  });

  const insights = [];
  if (revenueGrowth !== 0)
    insights.push({
      type: revenueGrowth > 0 ? "positive" : "warning",
      title: revenueGrowth > 0 ? "Revenue bertumbuh" : "Revenue menurun",
      text: `Revenue ${revenueGrowth > 0 ? "naik" : "turun"} ${Math.abs(revenueGrowth)}% dibanding periode sebelumnya.`,
    });
  if (categories[0])
    insights.push({ type: "info", title: "Kategori terkuat", text: `${categories[0].name} menyumbang ${categories[0].contribution}% merchandise revenue periode ini.` });
  if (products[0])
    insights.push({ type: "info", title: "Produk revenue terbaik", text: `${products[0].name} menjadi produk dengan revenue tertinggi.` });
  if (productsByQuantity[0])
    insights.push({ type: "info", title: "Produk paling banyak terjual", text: `${productsByQuantity[0].name} mencatat quantity tertinggi (${productsByQuantity[0].quantity_label}).` });
  if (number(codCurrent.amount) > 0)
    insights.push({ type: "warning", title: "COD belum final", text: `Masih ada COD ${number(codCurrent.count)} transaksi senilai Rp${number(codCurrent.amount).toLocaleString("id-ID")} yang belum final.` });
  if (number(ownerPendingCurrent.amount) > 0)
    insights.push({ type: "warning", title: "Kas menunggu Owner", text: `${number(ownerPendingCurrent.count)} setoran Manager senilai Rp${number(ownerPendingCurrent.amount).toLocaleString("id-ID")} menunggu konfirmasi Owner.` });
  const bestDriver = driverPerformance.find((row) => row.assignments > 0);
  if (bestDriver)
    insights.push({ type: "info", title: "Aktivitas driver", text: `${bestDriver.name} menyelesaikan ${bestDriver.delivered} dari ${bestDriver.assignments} tugas delivery pada periode ini.` });

  return {
    generated_at: new Date().toISOString(),
    period: {
      preset: period.preset,
      from: period.fromDate,
      to: period.toDate,
      days: period.days,
      previous_from: period.previousFrom,
      previous_until: period.previousUntil,
    },
    health,
    summary: {
      revenue,
      orders: current.created,
      active_orders: current.active,
      delivered_orders: current.delivered,
      cancelled_orders: current.cancelled,
      quantity,
      aov,
      comparison: {
        revenue: revenueGrowth,
        orders: comparison(current.created, previous.created),
        quantity: comparison(quantity, number(previousQuantityRow.quantity)),
        aov: comparison(aov, previousAov),
      },
      cancel_rate: cancelRate,
      payment_success_rate: paymentSuccessRate,
      delivery_completion_rate: deliveryCompletionRate,
    },
    finance: {
      revenue,
      paid_transactions: number(revenueRow.transactions),
      payment_methods: paymentMethods.map((row) => ({ method: row.method, transactions: number(row.transactions), amount: number(row.amount) })),
      payment_statuses: paymentStatuses,
      cod_outstanding_period: { count: number(codPeriod.count), amount: number(codPeriod.amount) },
      cod_outstanding_current: { count: number(codCurrent.count), amount: number(codCurrent.amount) },
      admin_to_manager: {
        count: number(adminCashPeriod.count),
        expected_amount: number(adminCashPeriod.expected_amount),
        submitted_amount: number(adminCashPeriod.submitted_amount),
        verified_amount: number(adminCashPeriod.verified_amount),
        pending_count: number(adminCashPeriod.pending_count),
      },
      manager_to_owner: {
        count: number(managerCashPeriod.count),
        expected_amount: number(managerCashPeriod.expected_amount),
        submitted_amount: number(managerCashPeriod.submitted_amount),
        verified_amount: number(managerCashPeriod.verified_amount),
        pending_count: number(managerCashPeriod.pending_count),
        rejected_count: number(managerCashPeriod.rejected_count),
      },
      owner_pending_current: { count: number(ownerPendingCurrent.count), amount: number(ownerPendingCurrent.amount) },
      accounting_note: "Laba bersih belum dihitung karena database operasional belum menyimpan HPP dan seluruh biaya usaha secara lengkap.",
    },
    merchandise: {
      revenue: merchandiseRevenue,
      categories,
      subcategories,
      products: products.slice(0, 15),
      products_by_quantity: productsByQuantity.slice(0, 15),
      unsold_products: unsoldProducts.map((row) => ({
        id: number(row.id),
        name: row.name,
        category: row.category_name,
        subcategory: row.subcategory_name || null,
        stock_quantity: number(row.stock_quantity),
        stock_unit: row.stock_unit || "PCS",
      })),
    },
    team: {
      managers: managerPerformance,
      admins: adminPerformance,
      drivers: driverPerformance,
    },
    insights,
    empty: current.created === 0 && revenue === 0,
  };
}
