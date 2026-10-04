import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "loyalty-test-")),
  "test.db",
);
process.env.SESSION_SECRET = "loyalty-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus, acceptDelivery, updateStationStatus } =
  await import("../lib/domain.mjs");
const {
  calculateEarnPoints,
  calculateLoyaltyDiscount,
  listCustomerRewards,
  quoteLoyaltyReward,
  saveRewardRule,
} = await import("../lib/loyalty.mjs");
const { claimVoucher } = await import("../lib/vouchers.mjs");
const { verifyPayment } = await import("../lib/payments.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Owner','owner@loyalty.test','x','OWNER'),
    (2,'Admin','admin@loyalty.test','x','ADMIN'),
    (3,'Kitchen','kitchen@loyalty.test','x','KITCHEN'),
    (4,'Driver','driver@loyalty.test','x','DRIVER'),
    (10,'Customer A','a@loyalty.test','x','CUSTOMER'),
    (11,'Customer B','b@loyalty.test','x','CUSTOMER');
  INSERT INTO loyalty_accounts(user_id,balance) VALUES(10,0),(11,0);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price) VALUES
    (1,1,'Menu 9.999',9999),
    (2,1,'Menu 10.000',10000),
    (3,1,'Menu 19.999',19999),
    (4,1,'Menu 20.000',20000),
    (5,1,'Menu 52.000',52000),
    (6,1,'Menu 50.000',50000);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES
    (10,10,'Gratis','Alamat gratis ongkir',0,0),
    (12,10,'Berbayar','Alamat ongkir berbayar',0.049462,0),
    (11,11,'Rumah B','Alamat Customer B',0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('printer_simulation','true');
`);

const owner = { id: 1, role: "OWNER" };
const admin = { id: 2, role: "ADMIN" };
const kitchen = { id: 3, role: "KITCHEN" };
const driver = { id: 4, role: "DRIVER" };
const customerA = { id: 10, role: "CUSTOMER" };
const customerB = { id: 11, role: "CUSTOMER" };

function setBalance(customerId, balance) {
  database
    .prepare("UPDATE loyalty_accounts SET balance=? WHERE user_id=?")
    .run(balance, customerId);
}

function balance(customerId = 10) {
  return database
    .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=?")
    .get(customerId).balance;
}

async function complete(orderId, { pay = true } = {}) {
  if (pay) await verifyPayment(admin, orderId, "PAID");
  await changeStatus(admin, orderId, "CONFIRMED");
  await updateStationStatus(kitchen, orderId, "PREPARING");
  await updateStationStatus(kitchen, orderId, "READY");
  await changeStatus(admin, orderId, "ASSIGNED", driver.id);
  await acceptDelivery(driver, orderId);
  await changeStatus(driver, orderId, "PICKED_UP");
  await changeStatus(driver, orderId, "ON_DELIVERY");
  await changeStatus(driver, orderId, "DELIVERED");
}

function orderInput({
  customer = customerA,
  addressId = customer.id,
  productId = 6,
  loyaltyRewardId = null,
  promotionId = null,
  idempotencyKey,
  extra = {},
} = {}) {
  return {
    addressId,
    method: "CASH",
    items: [{ productId, quantity: 1 }],
    loyaltyRewardId,
    promotionId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...extra,
  };
}

let percentRule;
let fixedRule;

test("Owner mengelola PERCENT/FIXED reward dan role lain ditolak", async () => {
  await assert.rejects(
    saveRewardRule(admin, {
      name: "Tidak sah",
      pointsRequired: 1,
      rewardType: "FIXED",
      rewardValue: 1000,
      minimumOrder: 0,
      active: true,
    }),
    /Akses ditolak/,
  );
  percentRule = await saveRewardRule(owner, {
    name: "Hemat 30%",
    pointsRequired: 20,
    rewardType: "PERCENT",
    rewardValue: 30,
    minimumOrder: 30000,
    maximumDiscount: 12000,
    active: true,
  });
  fixedRule = await saveRewardRule(owner, {
    name: "Potongan 10K",
    pointsRequired: 15,
    rewardType: "FIXED",
    rewardValue: 10000,
    minimumOrder: 25000,
    active: true,
  });
  assert.equal(percentRule.reward_type, "PERCENT");
  assert.equal(fixedRule.reward_type, "FIXED");
});

test("earn memakai FLOOR pada kelipatan Rp10.000", () => {
  assert.equal(calculateEarnPoints(9999), 0);
  assert.equal(calculateEarnPoints(10000), 1);
  assert.equal(calculateEarnPoints(19999), 1);
  assert.equal(calculateEarnPoints(20000), 2);
  assert.equal(calculateEarnPoints(52000), 5);
  assert.equal(calculateEarnPoints(100000), 10);
});

test("poin hanya masuk setelah DELIVERED dan ongkir tidak menjadi earn base", async () => {
  setBalance(10, 0);
  const order = await createOrder(
    customerA,
    orderInput({ addressId: 12, productId: 2 }),
  );
  assert.equal(order.subtotal, 10000);
  assert.equal(order.deliveryFee, 2500);
  assert.equal(order.total, 12500);
  assert.equal(balance(), 0);
  await complete(order.id, { pay: false });
  assert.equal(balance(), 0);
  await verifyPayment(admin, order.id, "PAID");
  assert.equal(balance(), 1);
  assert.equal(
    database
      .prepare(
        "SELECT amount FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(order.id).amount,
    1,
  );
  assert.match(
    database
      .prepare(
        "SELECT message FROM notifications WHERE user_id=10 AND message LIKE '%mendapatkan%poin%' ORDER BY id DESC LIMIT 1",
      )
      .get().message,
    /1 poin.*pesanan/,
  );
});

test("payment FAILED dan EXPIRED tidak menghasilkan poin", async () => {
  setBalance(10, 0);
  const failed = await createOrder(
    customerA,
    orderInput({ productId: 4 }),
  );
  await verifyPayment(admin, failed.id, "FAILED");
  await complete(failed.id, { pay: false });
  assert.equal(balance(), 0);

  const expired = await createOrder(customerA, {
    ...orderInput({ productId: 4 }),
    method: "BANK_TRANSFER",
  });
  database
    .prepare("UPDATE payments SET status='EXPIRED' WHERE order_id=?")
    .run(expired.id);
  await complete(expired.id, { pay: false });
  assert.equal(balance(), 0);
});

test("order cancelled mendapat 0 poin dan completion tidak dapat menggandakan earn", async () => {
  setBalance(10, 0);
  const cancelled = await createOrder(customerA, orderInput({ productId: 5 }));
  await changeStatus(admin, cancelled.id, "CANCELLED");
  assert.equal(balance(), 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(cancelled.id).count,
    0,
  );

  const delivered = await createOrder(customerA, orderInput({ productId: 4 }));
  await complete(delivered.id);
  assert.equal(balance(), 2);
  await assert.rejects(
    changeStatus(driver, delivered.id, "DELIVERED"),
    /tidak diizinkan/,
  );
  assert.equal(balance(), 2);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(delivered.id).count,
    1,
  );
});

test("perhitungan PERCENT, FIXED, dan maximum discount benar", () => {
  assert.equal(
    calculateLoyaltyDiscount(
      { reward_type: "PERCENT", reward_value: 30, maximum_discount: null },
      50000,
    ),
    15000,
  );
  assert.equal(
    calculateLoyaltyDiscount(
      { reward_type: "FIXED", reward_value: 10000, maximum_discount: null },
      50000,
    ),
    10000,
  );
  assert.equal(
    calculateLoyaltyDiscount(
      { reward_type: "PERCENT", reward_value: 30, maximum_discount: 12000 },
      50000,
    ),
    12000,
  );
});

test("sufficient balance redeem, server menghitung diskon dan ongkir", async () => {
  setBalance(10, 30);
  const quote = await quoteLoyaltyReward(customerA, {
    rewardRuleId: fixedRule.id,
    items: [{ productId: 6, quantity: 1 }],
  });
  assert.equal(quote.loyalty_discount, 10000);
  assert.equal(quote.points_redeemed, 15);
  const order = await createOrder(
    customerA,
    orderInput({
      addressId: 12,
      loyaltyRewardId: fixedRule.id,
      extra: { loyaltyDiscount: 49999, loyaltyBalance: 999999 },
    }),
  );
  assert.equal(order.loyaltyDiscount, 10000);
  assert.equal(order.deliveryFee, 2500);
  assert.equal(order.total, 42500);
  assert.equal(balance(), 15);
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT subtotal,loyalty_points_redeemed,loyalty_discount,delivery_fee,total FROM orders WHERE id=?",
        )
        .get(order.id),
    },
    {
      subtotal: 50000,
      loyalty_points_redeemed: 15,
      loyalty_discount: 10000,
      delivery_fee: 2500,
      total: 42500,
    },
  );
});

test("insufficient balance, inactive reward, minimum order, dan rule palsu ditolak", async () => {
  setBalance(10, 14);
  await assert.rejects(
    createOrder(
      customerA,
      orderInput({
        loyaltyRewardId: fixedRule.id,
        extra: { loyaltyBalance: 999999 },
      }),
    ),
    /tidak mencukupi/,
  );
  setBalance(10, 100);
  await saveRewardRule(owner, {
    id: fixedRule.id,
    name: fixedRule.name,
    pointsRequired: fixedRule.points_required,
    rewardType: fixedRule.reward_type,
    rewardValue: fixedRule.reward_value,
    minimumOrder: fixedRule.minimum_order,
    maximumDiscount: fixedRule.maximum_discount,
    active: false,
  });
  await assert.rejects(
    createOrder(customerA, orderInput({ loyaltyRewardId: fixedRule.id })),
    /tidak aktif/,
  );
  fixedRule = await saveRewardRule(owner, {
    id: fixedRule.id,
    name: fixedRule.name,
    pointsRequired: fixedRule.points_required,
    rewardType: fixedRule.reward_type,
    rewardValue: fixedRule.reward_value,
    minimumOrder: fixedRule.minimum_order,
    maximumDiscount: fixedRule.maximum_discount,
    active: true,
  });
  await assert.rejects(
    createOrder(
      customerA,
      orderInput({ productId: 4, loyaltyRewardId: fixedRule.id }),
    ),
    /Minimum belanja/,
  );
  await assert.rejects(
    createOrder(customerA, orderInput({ loyaltyRewardId: 999999 })),
    /tidak ditemukan/,
  );
});

test("double submit tidak double deduct dan race tidak membuat balance negatif", async () => {
  setBalance(10, 15);
  const input = orderInput({
    loyaltyRewardId: fixedRule.id,
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  });
  const first = await createOrder(customerA, input);
  const replay = await createOrder(customerA, input);
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  assert.equal(balance(), 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='REDEEM'",
      )
      .get(first.id).count,
    1,
  );
  await assert.rejects(
    createOrder(customerA, orderInput({ loyaltyRewardId: fixedRule.id })),
    /tidak mencukupi/,
  );
  assert.equal(balance(), 0);
});

test("cancel redeemed order memulihkan poin tepat sekali", async () => {
  setBalance(10, 15);
  const order = await createOrder(
    customerA,
    orderInput({ loyaltyRewardId: fixedRule.id }),
  );
  assert.equal(balance(), 0);
  await changeStatus(admin, order.id, "CANCELLED");
  assert.equal(balance(), 15);
  await assert.rejects(
    changeStatus(admin, order.id, "CANCELLED"),
    /tidak diizinkan/,
  );
  assert.equal(balance(), 15);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='RESTORE'",
      )
      .get(order.id).count,
    1,
  );
});

test("failed pre-commit order tidak mengurangi poin", async () => {
  setBalance(10, 15);
  database.exec(`
    CREATE TRIGGER reject_loyalty_order_notification
    BEFORE INSERT ON notifications
    WHEN NEW.user_id=10 AND NEW.message LIKE 'Pesanan #% berhasil dibuat'
    BEGIN
      SELECT RAISE(ABORT,'forced loyalty pre-commit failure');
    END;
  `);
  await assert.rejects(
    createOrder(customerA, orderInput({ loyaltyRewardId: fixedRule.id })),
    /forced loyalty pre-commit failure/,
  );
  database.exec("DROP TRIGGER reject_loyalty_order_notification");
  assert.equal(balance(), 15);
});

test("voucher + loyalty tidak stacking dan foundation voucher tetap berlaku", async () => {
  setBalance(10, 100);
  database
    .prepare(
      "INSERT INTO promotions(id,title,description,badge,terms,cta_label,starts_at,ends_at,active,voucher_type,discount_value,minimum_order,created_by,updated_by) VALUES(900,'Voucher 10%','Voucher test','VOUCHER','Syarat test','Klaim',datetime('now','-1 hour'),datetime('now','+1 hour'),1,'PERCENT',10,0,1,1)",
    )
    .run();
  await claimVoucher(customerA, 900);
  await assert.rejects(
    createOrder(
      customerA,
      orderInput({
        promotionId: 900,
        loyaltyRewardId: fixedRule.id,
      }),
    ),
    /tidak dapat digunakan bersamaan/,
  );
});

test("earn setelah redeem memakai merchandise net dan tidak memasukkan shipping", async () => {
  setBalance(10, 15);
  const order = await createOrder(
    customerA,
    orderInput({
      addressId: 12,
      loyaltyRewardId: fixedRule.id,
    }),
  );
  assert.equal(balance(), 0);
  assert.equal(order.total, 42500);
  await complete(order.id);
  assert.equal(balance(), 4);
  const ledger = database
    .prepare(
      "SELECT kind,amount FROM loyalty_transactions WHERE order_id=? ORDER BY id",
    )
    .all(order.id);
  assert.deepEqual(
    ledger.map((entry) => ({ ...entry })),
    [
      { kind: "REDEEM", amount: -15 },
      { kind: "EARN", amount: 4 },
    ],
  );
});

test("customer reward list memakai balance server", async () => {
  setBalance(11, 0);
  const rewards = await listCustomerRewards(customerB);
  assert.equal(
    rewards.some((reward) => reward.eligible_balance),
    false,
  );
  assert.ok(rewards.every((reward) => /Butuh/.test(reward.ineligible_reason)));
});
