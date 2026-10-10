import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "promotion-engine-v1-")),
  "test.db",
);
process.env.SESSION_SECRET = "promotion-engine-v1-secret-more-than-32-bytes";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const { savePromotion } = await import("../lib/promotions.mjs");
const { promotionScheduleEligible, quoteEnginePromotion } =
  await import("../lib/promotion-engine.mjs");
const database = db();
const jakarta = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const part = (name) => jakarta.find((item) => item.type === name)?.value;
const birthDate = `1990-${part("month")}-${part("day")}`;

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,birth_date,active) VALUES
    (1,'Manager','manager@promo-v1.test','x','MANAGER',NULL,1),
    (2,'Admin','admin@promo-v1.test','x','ADMIN',NULL,1),
    (3,'Kitchen','kitchen@promo-v1.test','x','KITCHEN',NULL,1),
    (10,'Member A','member-a@promo-v1.test','x','CUSTOMER','${birthDate}',1),
    (11,'Member B','member-b@promo-v1.test','x','CUSTOMER','1992-01-01',1),
    (12,'Guest','session@guest.warkost.invalid','x','CUSTOMER',NULL,1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan'),(2,'Minuman');
  INSERT INTO product_subcategories(id,category_id,name) VALUES(1,1,'Mie'),(2,2,'Teh');
  INSERT INTO products(id,category_id,subcategory_id,name,description,price,prep_station,stock_quantity) VALUES
    (1,1,1,'Mie Ayam','Mie hangat',50000,'KITCHEN',50),
    (2,2,2,'Teh Manis','Teh segar',10000,'CASHIER',50);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default) VALUES
    (10,10,'Rumah','Alamat A',0,0,1),(11,11,'Rumah','Alamat B',0,0,1),(12,12,'Guest','Alamat Guest',0,0,1);
  INSERT OR REPLACE INTO settings(key,value) VALUES
    ('business_latitude','0'),('business_longitude','0'),('delivery_free_km','3'),
    ('delivery_fee_per_km','2500'),('delivery_max_km','10'),('payment_expiry_minutes','15'),
    ('cod_max_order_amount','150000'),('printer_simulation','true');
  INSERT INTO loyalty_accounts(user_id,balance) VALUES(10,30);
  INSERT INTO loyalty_reward_rules(id,name,points_required,reward_type,reward_value,minimum_order,active,created_by,updated_by)
    VALUES(1,'Reward 5K',5,'FIXED',5000,0,1,1,1);
`);

const manager = { id: 1, role: "MANAGER" };
const admin = { id: 2, role: "ADMIN" };
const memberA = { id: 10, role: "CUSTOMER", email: "member-a@promo-v1.test" };
const memberB = { id: 11, role: "CUSTOMER", email: "member-b@promo-v1.test" };
const guest = {
  id: 12,
  role: "CUSTOMER",
  email: "session@guest.warkost.invalid",
  isGuest: true,
};
const iso = (delta) => new Date(Date.now() + delta).toISOString();

async function promo(overrides = {}) {
  const family = overrides.promotionFamily || "PERCENT_ITEM";
  return savePromotion(manager, {
    title: overrides.title || `Promo ${family} ${Math.random()}`,
    description: "Promo engine terverifikasi server",
    badge: "PROMO",
    terms: "Berlaku sesuai rule server",
    ctaLabel: "Pakai Promo",
    imageUrl: "",
    startsAt: overrides.startsAt || iso(-3600000),
    endsAt: overrides.endsAt || iso(86400000),
    active: overrides.active ?? true,
    promotionFamily: family,
    benefitType:
      overrides.benefitType ||
      (family === "FIXED"
        ? "FIXED"
        : family === "FREE_ITEM"
          ? "FREE_ITEM"
          : "PERCENT"),
    discountValue: overrides.discountValue ?? 20,
    minimumOrder: overrides.minimumOrder ?? 0,
    maxDiscount: overrides.maxDiscount ?? null,
    scopeType: overrides.scopeType || "ORDER",
    targetProductId: overrides.targetProductId ?? null,
    targetCategoryId: overrides.targetCategoryId ?? null,
    targetSubcategoryId: overrides.targetSubcategoryId ?? null,
    giftProductId: overrides.giftProductId ?? null,
    registrationDays: overrides.registrationDays ?? null,
    birthdayWindowBefore: overrides.birthdayWindowBefore ?? 0,
    birthdayWindowAfter: overrides.birthdayWindowAfter ?? 0,
    scheduleType: overrides.scheduleType || "RANGE",
    scheduleWeekdays: overrides.scheduleWeekdays || [],
    scheduleDates: overrides.scheduleDates || [],
    scheduleMonthDays: overrides.scheduleMonthDays || [],
    timeStart: overrides.timeStart || null,
    timeEnd: overrides.timeEnd || null,
    quota: overrides.quota ?? null,
    perMemberLimit: overrides.perMemberLimit ?? 1,
  });
}

const input = (customer, promotionId, extra = {}) => ({
  addressId: customer.id,
  method: "BANK_TRANSFER",
  promotionId,
  items: [{ productId: 1, quantity: 1 }],
  ...extra,
});

test("persen target kategori dan nominal order dihitung server", async () => {
  const percent = await promo({
    targetCategoryId: 1,
    scopeType: "CATEGORY",
    maxDiscount: 15000,
  });
  const percentOrder = await createOrder(memberA, input(memberA, percent.id));
  assert.equal(percentOrder.promotionDiscount, 10000);
  const fixed = await promo({
    promotionFamily: "FIXED",
    benefitType: "FIXED",
    discountValue: 10000,
  });
  const fixedOrder = await createOrder(memberB, input(memberB, fixed.id));
  assert.equal(fixedOrder.total, 40000);
});

test("free item ikut reservasi, routing, commit, dan restore", async () => {
  const free = await promo({
    promotionFamily: "FREE_ITEM",
    benefitType: "FREE_ITEM",
    giftProductId: 2,
    minimumOrder: 25000,
  });
  const order = await createOrder(memberA, input(memberA, free.id));
  const gift = database
    .prepare(
      "SELECT name,price,prep_station,is_promotion_gift FROM order_items WHERE order_id=? AND is_promotion_gift=1",
    )
    .get(order.id);
  assert.deepEqual(
    { ...gift },
    {
      name: "Teh Manis",
      price: 0,
      prep_station: "CASHIER",
      is_promotion_gift: 1,
    },
  );
  assert.equal(
    database
      .prepare(
        "SELECT quantity FROM stock_reservations WHERE order_id=? AND product_id=2",
      )
      .get(order.id).quantity,
    1,
  );
  await changeStatus(admin, order.id, "CONFIRMED");
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=2").get()
      .stock_quantity,
    49,
  );
  await changeStatus(admin, order.id, "CANCELLED");
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=2").get()
      .stock_quantity,
    50,
  );
  assert.equal(
    database
      .prepare("SELECT status FROM promotion_redemptions WHERE order_id=?")
      .get(order.id).status,
    "RESTORED",
  );
  const freeFood = await promo({
    promotionFamily: "FREE_ITEM",
    benefitType: "FREE_ITEM",
    giftProductId: 1,
  });
  const foodGiftOrder = await createOrder(
    memberB,
    input(memberB, freeFood.id, { items: [{ productId: 2, quantity: 1 }] }),
  );
  assert.equal(
    database
      .prepare(
        "SELECT prep_station FROM order_items WHERE order_id=? AND is_promotion_gift=1",
      )
      .get(foodGiftOrder.id).prep_station,
    "KITCHEN",
  );
});

test("member pertama sekali pakai dan validity dijaga", async () => {
  const first = await promo({
    promotionFamily: "FIRST_MEMBER",
    benefitType: "FIXED",
    discountValue: 5000,
    registrationDays: 30,
  });
  const order = await createOrder(memberB, input(memberB, first.id));
  assert.equal(order.promotionDiscount, 5000);
  await assert.rejects(
    createOrder(memberB, input(memberB, first.id)),
    /batas penggunaan|transaksi pertama/i,
  );
  const expired = await promo({
    promotionFamily: "FIRST_MEMBER",
    benefitType: "FIXED",
    discountValue: 5000,
    startsAt: iso(-7200000),
    endsAt: iso(-3600000),
  });
  await assert.rejects(
    createOrder(memberA, input(memberA, expired.id)),
    /berakhir/i,
  );
});

test("schedule weekly, monthly, tanggal spesifik, dan jam memakai Asia/Jakarta", () => {
  const now = new Date("2026-10-10T03:30:00Z"); // Sabtu 10:30 Jakarta
  const base = {
    active: 1,
    starts_at: "2026-10-01 00:00:00",
    ends_at: "2026-11-01 00:00:00",
  };
  assert.equal(
    promotionScheduleEligible(
      {
        ...base,
        schedule_type: "WEEKLY",
        schedule_weekdays: "6",
        time_start: "09:00",
        time_end: "12:00",
      },
      now,
    ).eligible,
    true,
  );
  assert.equal(
    promotionScheduleEligible(
      { ...base, schedule_type: "MONTHLY", schedule_month_days: "10" },
      now,
    ).eligible,
    true,
  );
  assert.equal(
    promotionScheduleEligible(
      { ...base, schedule_type: "DATES", schedule_dates: "2026-10-10" },
      now,
    ).eligible,
    true,
  );
  assert.equal(
    promotionScheduleEligible(
      { ...base, schedule_type: "WEEKLY", schedule_weekdays: "1" },
      now,
    ).eligible,
    false,
  );
});

test("birthday COD + loyalty diperbolehkan dan hanya sekali per tahun", async () => {
  const birthday = await promo({
    promotionFamily: "BIRTHDAY",
    benefitType: "FIXED",
    discountValue: 7000,
    perMemberLimit: 10,
  });
  const order = await createOrder(
    memberA,
    input(memberA, birthday.id, { method: "CASH", loyaltyRewardId: 1 }),
  );
  assert.equal(order.promotionDiscount, 7000);
  assert.equal(order.loyaltyDiscount, 5000);
  await assert.rejects(
    createOrder(memberA, input(memberA, birthday.id, { method: "CASH" })),
    /tahun ini/i,
  );
});

test("guest dan COD reguler ditolak; non-cash diterima", async () => {
  const regular = await promo({ perMemberLimit: 5 });
  await assert.rejects(createOrder(guest, input(guest, regular.id)), /Guest/i);
  await assert.rejects(
    createOrder(memberA, input(memberA, regular.id, { method: "CASH" })),
    /COD/i,
  );
  const quote = await quoteEnginePromotion(memberA, {
    promotionId: regular.id,
    paymentMethod: "BANK_TRANSFER",
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(quote.promotion_discount, 10000);
});

test("quota, per-member limit, deaktivasi, minimum belanja, dan stacking dijaga", async () => {
  const limited = await promo({ quota: 1, perMemberLimit: 1 });
  await createOrder(memberA, input(memberA, limited.id));
  await assert.rejects(
    createOrder(memberB, input(memberB, limited.id)),
    /Kuota/i,
  );
  const minimum = await promo({ minimumOrder: 60000 });
  await assert.rejects(
    createOrder(memberB, input(memberB, minimum.id)),
    /Minimum/i,
  );
  const inactive = await promo({ active: false });
  await assert.rejects(
    createOrder(memberB, input(memberB, inactive.id)),
    /dinonaktifkan/i,
  );
  const regular = await promo();
  await assert.rejects(
    createOrder(memberA, input(memberA, regular.id, { loyaltyRewardId: 1 })),
    /tidak dapat digunakan bersamaan/i,
  );
});

test("snapshot historis immutable dan Admin read-only", async () => {
  const original = await promo({
    title: "Nama Promo Awal",
    promotionFamily: "FIXED",
    benefitType: "FIXED",
    discountValue: 10000,
  });
  const order = await createOrder(memberB, input(memberB, original.id));
  await savePromotion(manager, {
    id: original.id,
    title: "Nama Promo Baru",
    description: "Promo sesudah edit tetap aman",
    badge: "BARU",
    terms: "Ketentuan baru",
    ctaLabel: "Pakai",
    imageUrl: "",
    startsAt: iso(-3600000),
    endsAt: iso(86400000),
    active: true,
    promotionFamily: "FIXED",
    benefitType: "FIXED",
    discountValue: 5000,
    minimumOrder: 0,
    scopeType: "ORDER",
    perMemberLimit: 2,
  });
  const snapshot = JSON.parse(
    database
      .prepare("SELECT promotion_snapshot FROM orders WHERE id=?")
      .get(order.id).promotion_snapshot,
  );
  assert.equal(snapshot.name, "Nama Promo Awal");
  assert.equal(snapshot.discount_amount, 10000);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='PROMOTION_APPLIED' AND details LIKE ?",
      )
      .get(`%\"orderId\":${order.id}%`).count,
    1,
  );
  await assert.rejects(
    savePromotion(admin, { ...original, title: "Admin mencoba edit" }),
    /Akses/,
  );
});
