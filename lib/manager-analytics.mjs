import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

const DAY = 86_400_000;
const JAKARTA_OFFSET = "+07:00";
const VALID_PRESETS = new Set(["today", "yesterday", "7d", "month", "custom"]);
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

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

function validDate(value) {
  if (!datePattern.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

const localStart = (value) => new Date(value + "T00:00:00" + JAKARTA_OFFSET);
const sqlDateTime = (value) =>
  value.toISOString().slice(0, 19).replace("T", " ");
const addDays = (value, amount) =>
  dateKey(new Date(localStart(value).getTime() + amount * DAY));

export function resolveManagerPeriod(params = {}, now = new Date()) {
  const preset = String(params.preset || "today");
  if (!VALID_PRESETS.has(preset)) throw new DomainError("Periode tidak valid");
  const today = dateKey(now);
  let fromDate = today;
  let toDate = today;
  if (preset === "yesterday") fromDate = toDate = addDays(today, -1);
  if (preset === "7d") fromDate = addDays(today, -6);
  if (preset === "month") fromDate = today.slice(0, 8) + "01";
  if (preset === "custom") {
    fromDate = String(params.from || "");
    toDate = String(params.to || "");
    if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate)
      throw new DomainError("Rentang tanggal tidak valid");
  }
  const start = localStart(fromDate);
  const end = new Date(localStart(toDate).getTime() + DAY);
  const days = Math.round((end - start) / DAY);
  if (days < 1 || days > 366)
    throw new DomainError("Rentang tanggal maksimal 366 hari");
  const previousEnd = start;
  const previousStart = new Date(start.getTime() - days * DAY);
  return {
    preset,
    fromDate,
    toDate,
    from: sqlDateTime(start),
    until: sqlDateTime(end),
    previousFrom: sqlDateTime(previousStart),
    previousUntil: sqlDateTime(previousEnd),
    days,
    grouping: days === 1 ? "hour" : "day",
  };
}

const number = (value) => Number(value || 0);
const contribution = (value, total) =>
  total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
const comparison = (current, previous) =>
  previous > 0
    ? Number((((current - previous) / previous) * 100).toFixed(1))
    : current > 0
      ? 100
      : 0;

function bucketLabel(createdAt, grouping) {
  const raw = String(createdAt || "").replace(" ", "T") + "Z";
  const date = new Date(raw);
  if (grouping === "hour")
    return (
      new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(date) + ":00"
    );
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function summarizeOrders(rows) {
  const valid = rows.filter((row) => VALID_SALES_STATUSES.has(row.status));
  const paid = valid.filter((row) => row.payment_status === "PAID");
  const revenue = paid.reduce((sum, row) => sum + number(row.total), 0);
  return { valid, paid, revenue, totalOrders: valid.length };
}

export function formatWeightedQuantity(quantity, unit) {
  const value = number(quantity);
  if (unit !== "GRAM") return String(Math.trunc(value));
  if (value < 1000) return `${value} g`;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value / 1000)} kg`;
}

export async function managerAnalytics(user, input = {}, now = new Date()) {
  required(user, ["MANAGER"]);
  const period = resolveManagerPeriod(input, now);
  const orders = await store.all(
    `SELECT o.id,o.status,o.total,o.created_at,p.status payment_status
       FROM orders o JOIN payments p ON p.order_id=o.id
      WHERE o.created_at>=? AND o.created_at<? ORDER BY o.created_at,o.id`,
    period.from,
    period.until,
  );
  const previousOrders = await store.all(
    `SELECT o.id,o.status,o.total,o.created_at,p.status payment_status
       FROM orders o JOIN payments p ON p.order_id=o.id
      WHERE o.created_at>=? AND o.created_at<? ORDER BY o.created_at,o.id`,
    period.previousFrom,
    period.previousUntil,
  );
  const summary = summarizeOrders(orders);
  const previous = summarizeOrders(previousOrders);
  const paidIds = new Set(summary.paid.map((row) => number(row.id)));
  const items = paidIds.size
    ? await store.all(
        `SELECT i.order_id,i.product_id,i.name,i.price,i.quantity,i.stock_unit,i.price_unit_quantity,
                c.name category_name,s.name subcategory_name,o.created_at
           FROM order_items i JOIN orders o ON o.id=i.order_id
           JOIN products p ON p.id=i.product_id JOIN categories c ON c.id=p.category_id
           LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
          WHERE o.created_at>=? AND o.created_at<? AND EXISTS
                (SELECT 1 FROM payments pay WHERE pay.order_id=o.id AND pay.status='PAID')
            AND o.status!='CANCELLED'`,
        period.from,
        period.until,
      )
    : [];

  const quantity = items.reduce((sum, item) => sum + number(item.quantity), 0);
  const previousQuantityRows = previous.paid.length
    ? await store.get(
        `SELECT COALESCE(SUM(i.quantity),0) quantity FROM order_items i JOIN orders o ON o.id=i.order_id
          WHERE o.created_at>=? AND o.created_at<? AND o.status!='CANCELLED'
            AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='PAID')`,
        period.previousFrom,
        period.previousUntil,
      )
    : { quantity: 0 };

  const status = {
    waiting: 0,
    preparing: 0,
    ready: 0,
    delivery: 0,
    done: 0,
    paid: summary.paid.length,
  };
  for (const order of summary.valid) {
    if (["PENDING", "CONFIRMED"].includes(order.status)) status.waiting += 1;
    if (order.status === "PREPARING") status.preparing += 1;
    if (order.status === "READY") status.ready += 1;
    if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(order.status))
      status.delivery += 1;
    if (order.status === "DELIVERED") status.done += 1;
  }

  const trendMap = new Map();
  for (const order of summary.valid) {
    const label = bucketLabel(order.created_at, period.grouping);
    const bucket = trendMap.get(label) || { label, orders: 0, revenue: 0 };
    bucket.orders += 1;
    if (order.payment_status === "PAID") bucket.revenue += number(order.total);
    trendMap.set(label, bucket);
  }

  const categoryMap = new Map();
  const subcategoryMap = new Map();
  const productMap = new Map();
  let merchandiseRevenue = 0;
  for (const item of items) {
    const itemRevenue = Math.trunc(
      (number(item.price) * number(item.quantity)) /
        Math.max(1, number(item.price_unit_quantity)),
    );
    merchandiseRevenue += itemRevenue;
    const categoryName = item.category_name || "Lainnya";
    if (MAIN_CATEGORIES.has(categoryName)) {
      const category = categoryMap.get(categoryName) || {
        name: categoryName,
        quantity: 0,
        revenue: 0,
      };
      category.quantity += number(item.quantity);
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
      subcategory.quantity += number(item.quantity);
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
    product.quantity += number(item.quantity);
    product.revenue += itemRevenue;
    productMap.set(product.id, product);
  }
  const rank = (values) =>
    [...values].map((row) => ({
      ...row,
      contribution: contribution(row.revenue, merchandiseRevenue),
    }));
  const categories = rank(categoryMap.values()).sort(
    (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
  );
  const subcategories = rank(subcategoryMap.values()).sort(
    (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
  );
  const products = rank(productMap.values())
    .map((row) => ({
      ...row,
      quantity_label: formatWeightedQuantity(row.quantity, row.unit),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const byQuantity = [...products].sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue,
  );
  const insights = [];
  if (categories[0])
    insights.push(
      `Kategori ${categories[0].name} menyumbang ${Math.round(categories[0].contribution)}% dari penjualan periode ini.`,
    );
  if (products[0])
    insights.push(
      `${products[0].name} menjadi produk dengan revenue tertinggi.`,
    );
  if (byQuantity[0] && byQuantity[0].id !== products[0]?.id)
    insights.push(
      `${byQuantity[0].name} menjadi produk dengan quantity tertinggi.`,
    );

  const aov = summary.totalOrders
    ? Math.round(summary.revenue / summary.totalOrders)
    : 0;
  const previousAov = previous.totalOrders
    ? Math.round(previous.revenue / previous.totalOrders)
    : 0;
  return {
    period: {
      preset: period.preset,
      from: period.fromDate,
      to: period.toDate,
      grouping: period.grouping,
    },
    summary: {
      total_orders: summary.totalOrders,
      revenue: summary.revenue,
      quantity,
      aov,
      comparison: {
        total_orders: comparison(summary.totalOrders, previous.totalOrders),
        revenue: comparison(summary.revenue, previous.revenue),
        quantity: comparison(quantity, number(previousQuantityRows.quantity)),
        aov: comparison(aov, previousAov),
      },
      status,
    },
    trend: [...trendMap.values()],
    categories,
    subcategories,
    products,
    products_by_quantity: byQuantity,
    insights,
    empty: summary.totalOrders === 0,
    generated_at: new Date().toISOString(),
  };
}
