import { DomainError } from "./domain.mjs";
import { isGuestCustomer } from "./customer-kind.mjs";
import { productLineTotal } from "./product-units.mjs";
import * as store from "./store.mjs";

export const PROMOTION_FAMILIES = Object.freeze([
  "PERCENT_ITEM",
  "FIXED",
  "FREE_ITEM",
  "FIRST_MEMBER",
  "SCHEDULED",
  "BIRTHDAY",
]);

const REGULAR_FAMILIES = new Set(
  PROMOTION_FAMILIES.filter((item) => item !== "BIRTHDAY"),
);
const sqlDate = (value) => Date.parse(String(value).replace(" ", "T") + "Z");
const csv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function jakartaParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday,
    ),
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function promotionScheduleEligible(row, now = new Date()) {
  const instant = now.getTime();
  if (!row.active) return { eligible: false, reason: "Promo dinonaktifkan" };
  if (instant < sqlDate(row.starts_at))
    return { eligible: false, reason: "Promo belum dimulai" };
  if (instant >= sqlDate(row.ends_at))
    return { eligible: false, reason: "Promo sudah berakhir" };
  const local = jakartaParts(now);
  const type = row.schedule_type || "RANGE";
  if (
    type === "WEEKLY" &&
    !csv(row.schedule_weekdays).includes(String(local.weekday))
  )
    return { eligible: false, reason: "Promo tidak berlaku pada hari ini" };
  if (
    type === "MONTHLY" &&
    !csv(row.schedule_month_days).includes(String(local.day))
  )
    return { eligible: false, reason: "Promo tidak berlaku pada tanggal ini" };
  if (type === "DATES" && !csv(row.schedule_dates).includes(local.date))
    return { eligible: false, reason: "Promo tidak berlaku pada tanggal ini" };
  if (row.time_start && local.time < row.time_start)
    return { eligible: false, reason: "Promo belum dimulai hari ini" };
  if (row.time_end && local.time >= row.time_end)
    return { eligible: false, reason: "Promo sudah selesai hari ini" };
  return { eligible: true, local };
}

function targetLines(row, lines) {
  if (row.scope_type === "PRODUCT")
    return lines.filter(
      (line) => Number(line.id) === Number(row.target_product_id),
    );
  if (row.scope_type === "CATEGORY")
    return lines.filter(
      (line) => Number(line.category_id) === Number(row.target_category_id),
    );
  if (row.scope_type === "SUBCATEGORY")
    return lines.filter(
      (line) =>
        Number(line.subcategory_id) === Number(row.target_subcategory_id),
    );
  return lines;
}

function benefitType(row) {
  if (row.benefit_type) return row.benefit_type;
  if (row.promotion_family === "PERCENT_ITEM") return "PERCENT";
  if (row.promotion_family === "FIXED") return "FIXED";
  if (row.promotion_family === "FREE_ITEM") return "FREE_ITEM";
  return row.voucher_type;
}

function calculateDiscount(row, eligibleSubtotal, subtotal) {
  const type = benefitType(row);
  let discount = 0;
  if (type === "PERCENT") {
    const value = Number(row.discount_value);
    if (!Number.isSafeInteger(value) || value < 1 || value > 100)
      throw new DomainError("Konfigurasi diskon persen tidak valid", 422);
    discount = Math.floor((eligibleSubtotal * value) / 100);
    if (row.max_discount !== null)
      discount = Math.min(discount, Number(row.max_discount));
  } else if (type === "FIXED") {
    discount = Math.min(eligibleSubtotal, Number(row.discount_value));
  } else if (type !== "FREE_ITEM") {
    throw new DomainError("Benefit promo tidak valid", 422);
  }
  return Math.max(0, Math.min(subtotal, discount));
}

function birthdayEligible(birthDate, row, local) {
  if (!birthDate) return false;
  const [, month, day] = String(birthDate).split("-").map(Number);
  if (!month || !day) return false;
  const birthday = new Date(Date.UTC(local.year, month - 1, day) - 7 * 3600000);
  const today = new Date(`${local.date}T00:00:00+07:00`);
  const delta = Math.round((today - birthday) / 86400000);
  return (
    delta >= -Number(row.birthday_window_before || 0) &&
    delta <= Number(row.birthday_window_after || 0)
  );
}

export async function validateEnginePromotion(
  tx,
  mysql,
  user,
  rawId,
  lines,
  subtotal,
  paymentMethod,
  now = new Date(),
) {
  if (rawId == null) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Promo tidak valid");
  const row = await tx.get(
    "SELECT p.*,u.birth_date,u.created_at customer_created_at FROM promotions p JOIN users u ON u.id=? WHERE p.id=?" +
      (mysql ? " FOR UPDATE" : ""),
    user.id,
    id,
  );
  if (!row || !row.promotion_family) return null;
  if (isGuestCustomer(user))
    throw new DomainError("Guest tidak dapat menggunakan promo member", 403);
  const schedule = promotionScheduleEligible(row, now);
  if (!schedule.eligible) throw new DomainError(schedule.reason, 422);
  if (Number(subtotal) < Number(row.minimum_order || 0))
    throw new DomainError(
      `Minimum belanja promo adalah Rp${Number(row.minimum_order).toLocaleString("id-ID")}`,
      422,
    );
  const method = String(paymentMethod || "").toUpperCase();
  if (
    ["CASH", "COD", "CASH_ON_DELIVERY"].includes(method) &&
    row.promotion_family !== "BIRTHDAY"
  )
    throw new DomainError(
      "Promo reguler tidak berlaku untuk pembayaran COD",
      422,
    );
  if (row.quota !== null && Number(row.used_count) >= Number(row.quota))
    throw new DomainError("Kuota promo sudah habis", 409);
  const usage = await tx.get(
    "SELECT COUNT(*) count FROM promotion_redemptions WHERE promotion_id=? AND customer_id=? AND status='APPLIED'",
    id,
    user.id,
  );
  if (Number(usage.count) >= Number(row.per_member_limit || 1))
    throw new DomainError(
      "Batas penggunaan promo untuk akun ini sudah tercapai",
      409,
    );
  if (row.promotion_family === "FIRST_MEMBER") {
    const prior = await tx.get(
      "SELECT COUNT(*) count FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.customer_id=? AND o.status='DELIVERED' AND p.status='PAID'",
      user.id,
    );
    if (Number(prior.count) > 0)
      throw new DomainError("Promo hanya untuk transaksi pertama", 422);
    if (row.registration_days !== null) {
      const created = sqlDate(row.customer_created_at);
      if (now.getTime() >= created + Number(row.registration_days) * 86400000)
        throw new DomainError(
          "Periode promo member pertama sudah berakhir",
          422,
        );
    }
  }
  if (row.promotion_family === "BIRTHDAY") {
    if (!birthdayEligible(row.birth_date, row, schedule.local))
      throw new DomainError(
        "Promo ulang tahun belum berlaku untuk akun ini",
        422,
      );
    const annual = await tx.get(
      "SELECT COUNT(*) count FROM promotion_redemptions WHERE promotion_id=? AND customer_id=? AND calendar_year=? AND status='APPLIED'",
      id,
      user.id,
      schedule.local.year,
    );
    if (Number(annual.count))
      throw new DomainError("Promo ulang tahun tahun ini sudah digunakan", 409);
  }
  const targets = targetLines(row, lines);
  if (!targets.length)
    throw new DomainError("Keranjang tidak memiliki produk target promo", 422);
  const eligibleSubtotal = targets.reduce(
    (sum, line) => sum + productLineTotal(line, line.quantity),
    0,
  );
  const discount = calculateDiscount(row, eligibleSubtotal, subtotal);
  let gift = null;
  if (benefitType(row) === "FREE_ITEM") {
    gift = await tx.get(
      `SELECT p.id,p.name,p.price,p.prep_station,p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,p.category_id,p.subcategory_id
         FROM products p LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
        WHERE p.id=? AND p.active=1 AND (p.subcategory_id IS NULL OR s.active=1)` +
        (mysql ? " FOR UPDATE" : ""),
      row.gift_product_id,
    );
    if (!gift) throw new DomainError("Produk hadiah tidak tersedia", 409);
    gift = {
      ...gift,
      quantity: Number(gift.minimum_order_quantity || 1),
      note: null,
      isPromotionGift: true,
      promotionId: id,
    };
  }
  const summary = `${row.title}: ${benefitType(row) === "FREE_ITEM" ? `gratis ${gift.name}` : `${benefitType(row) === "PERCENT" ? `${row.discount_value}%` : `Rp${Number(row.discount_value).toLocaleString("id-ID")}`} diskon`}`;
  return {
    engine: true,
    promotionId: id,
    claimId: null,
    family: row.promotion_family,
    discount,
    gift,
    calendarYear: schedule.local.year,
    snapshot: {
      id,
      name: row.title,
      family: row.promotion_family,
      benefit_type: benefitType(row),
      discount_amount: discount,
      gift: gift
        ? { product_id: gift.id, name: gift.name, quantity: gift.quantity }
        : null,
      rule_summary: summary,
      eligibility:
        row.promotion_family === "BIRTHDAY"
          ? "BIRTHDAY_MEMBER"
          : "MEMBER_NON_CASH",
    },
  };
}

export async function recordPromotionRedemption(
  tx,
  promotion,
  customerId,
  orderId,
) {
  if (!promotion?.engine) return;
  const updated = await tx.run(
    "UPDATE promotions SET used_count=used_count+1 WHERE id=? AND active=1 AND (quota IS NULL OR used_count<quota)",
    promotion.promotionId,
  );
  if (updated.changes !== 1)
    throw new DomainError("Kuota promo sudah habis", 409);
  await tx.run(
    "INSERT INTO promotion_redemptions(promotion_id,customer_id,order_id,discount_amount,gift_product_id,gift_quantity,calendar_year) VALUES(?,?,?,?,?,?,?)",
    promotion.promotionId,
    customerId,
    orderId,
    promotion.discount,
    promotion.gift?.id || null,
    promotion.gift?.quantity || 0,
    promotion.family === "BIRTHDAY" ? promotion.calendarYear : null,
  );
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    customerId,
    "PROMOTION_APPLIED",
    JSON.stringify({
      promotionId: promotion.promotionId,
      orderId: Number(orderId),
      discount: promotion.discount,
      giftProductId: promotion.gift?.id || null,
    }),
  );
}

export async function restoreEnginePromotion(tx, order, actorId) {
  if (!order?.promotion_id || !order?.promotion_snapshot) return false;
  const restored = await tx.run(
    "UPDATE promotion_redemptions SET status='RESTORED',restored_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='APPLIED'",
    order.id,
  );
  if (!restored.changes) return false;
  await tx.run(
    "UPDATE promotions SET used_count=CASE WHEN used_count>0 THEN used_count-1 ELSE 0 END WHERE id=?",
    order.promotion_id,
  );
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    actorId,
    "PROMOTION_RESTORED",
    JSON.stringify({ promotionId: order.promotion_id, orderId: order.id }),
  );
  return true;
}

export async function listCustomerEnginePromotions(user) {
  if (!user || user.role !== "CUSTOMER" || isGuestCustomer(user)) return [];
  const rows = await store.all(
    "SELECT p.*,(SELECT COUNT(*) FROM promotion_redemptions r WHERE r.promotion_id=p.id AND r.customer_id=? AND r.status='APPLIED') member_usage FROM promotions p WHERE p.promotion_family IS NOT NULL ORDER BY p.ends_at,p.id",
    user.id,
  );
  return rows.map((row) => {
    const schedule = promotionScheduleEligible(row);
    const exhausted =
      row.quota !== null && Number(row.used_count) >= Number(row.quota);
    const limited =
      Number(row.member_usage) >= Number(row.per_member_limit || 1);
    return {
      ...row,
      state:
        schedule.eligible && !exhausted && !limited
          ? "ELIGIBLE"
          : "UNAVAILABLE",
      ineligible_reason: !schedule.eligible
        ? schedule.reason
        : exhausted
          ? "Kuota promo sudah habis"
          : limited
            ? "Batas penggunaan sudah tercapai"
            : null,
    };
  });
}

export async function quoteEnginePromotion(user, input) {
  if (!user || user.role !== "CUSTOMER")
    throw new DomainError("Silakan masuk terlebih dahulu", 401);
  if (!Array.isArray(input.items) || !input.items.length)
    throw new DomainError("Keranjang tidak valid");
  return store.transaction(async (tx, mysql) => {
    let subtotal = 0;
    const lines = [];
    for (const item of input.items) {
      const product = await tx.get(
        `SELECT p.id,p.name,p.price,p.prep_station,p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,p.category_id,p.subcategory_id
           FROM products p LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
          WHERE p.id=? AND p.active=1 AND (p.subcategory_id IS NULL OR s.active=1)`,
        item.productId,
      );
      if (!product || !Number.isSafeInteger(item.quantity) || item.quantity < 1)
        throw new DomainError("Item tidak valid");
      const line = { ...product, quantity: item.quantity };
      subtotal += productLineTotal(line, line.quantity);
      lines.push(line);
    }
    const promotion = await validateEnginePromotion(
      tx,
      mysql,
      user,
      input.promotionId,
      lines,
      subtotal,
      input.paymentMethod,
    );
    if (!promotion) return null;
    return {
      promotion_id: promotion.promotionId,
      subtotal,
      voucher_discount: promotion.discount,
      promotion_discount: promotion.discount,
      gift: promotion.snapshot.gift,
      total_after_discount: subtotal - promotion.discount,
    };
  });
}
