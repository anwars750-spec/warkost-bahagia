import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "checkout-rules-v2-test-")),
  "test.db",
);
process.env.SESSION_SECRET =
  "checkout-rules-v2-session-secret-over-32-characters";
process.env.PAYMENT_PROVIDER_MODE = "simulation";

const { db } = await import("../lib/db.mjs");
const { createOrder, quoteDelivery } = await import("../lib/domain.mjs");
const { createGuestCustomer } = await import("../lib/guest.mjs");
const { currentUser, issueSession } = await import("../lib/auth.mjs");
const { awardOrderPoints, quoteLoyaltyReward } =
  await import("../lib/loyalty.mjs");
const { claimVoucher, listCustomerVouchers, quoteVoucher } =
  await import("../lib/vouchers.mjs");
const { paymentMethodLabel } = await import("../app/conversationDisplay.mjs");
const store = await import("../lib/store.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Owner','owner@rules.test','x','OWNER'),
    (2,'Admin','admin@rules.test','x','ADMIN'),
    (3,'Kitchen','kitchen@rules.test','x','KITCHEN'),
    (10,'Member','member@rules.test','x','CUSTOMER'),
    (20,'Guest','guest-test@guest.warkost.invalid','x','CUSTOMER');
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price) VALUES
    (1,1,'Menu 50K',50000),
    (2,1,'Menu 20K',20000);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_fee_per_km','2500'),
    ('printer_simulation','true');
  INSERT INTO loyalty_accounts(user_id,balance) VALUES(10,50);
  INSERT INTO loyalty_reward_rules(
    id,name,points_required,reward_type,reward_value,minimum_order,
    maximum_discount,active,created_by,updated_by
  ) VALUES(1,'Reward 10K',10,'FIXED',10000,0,NULL,1,1,1);
  INSERT INTO promotions(
    id,title,description,badge,terms,cta_label,starts_at,ends_at,active,
    voucher_type,voucher_category,discount_value,minimum_order,created_by,updated_by
  ) VALUES
    (100,'Voucher Reguler','Voucher member','VOUCHER','Syarat','Klaim',datetime('now','-1 hour'),datetime('now','+1 day'),1,'FIXED','REGULAR',5000,0,1,1),
    (101,'Voucher Ulang Tahun','Voucher birthday','BIRTHDAY','Syarat','Klaim',datetime('now','-1 hour'),datetime('now','+1 day'),1,'FIXED','BIRTHDAY',7000,0,1,1),
    (102,'Voucher Non Tunai','Voucher QRIS transfer','VOUCHER','Syarat','Klaim',datetime('now','-1 hour'),datetime('now','+1 day'),1,'PERCENT','REGULAR',10,0,1,1);
`);

const member = { id: 10, role: "CUSTOMER", email: "member@rules.test" };
const guest = {
  id: 20,
  role: "CUSTOMER",
  email: "guest-test@guest.warkost.invalid",
  isGuest: true,
};
const latitudeAtMeters = (meters) => (meters / 6371000) * (180 / Math.PI);

for (const [id, userId, meters] of [
  [10, 10, 0],
  [11, 10, 3000],
  [12, 10, 3001],
  [13, 10, 10000],
  [14, 10, 10001],
  [20, 20, 0],
])
  database
    .prepare(
      "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(?,?,?,?,?,0)",
    )
    .run(
      id,
      userId,
      `Alamat ${meters}`,
      `Alamat boundary ${meters} meter`,
      latitudeAtMeters(meters),
    );

test("guest session membuat identitas unik dan tidak memakai akun bersama", async () => {
  const first = await createGuestCustomer({ name: "Guest Pertama" });
  const second = await createGuestCustomer({ name: "Guest Kedua" });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.email, second.email);
  assert.match(first.email, /@guest\.warkost\.invalid$/);
  const stored = database
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(first.id);
  assert.match(stored.password_hash, /^[0-9a-f]+:[0-9a-f]+$/);

  const token = await issueSession(first);
  const sessionUser = await currentUser({
    cookies: { get: () => ({ value: token }) },
  });
  assert.equal(sessionUser.isGuest, true);
  assert.equal(sessionUser.id, first.id);
});

test("shipping V2 memakai boundary 3/10 km dan fee existing", async () => {
  assert.equal((await quoteDelivery(member, 10)).delivery_fee, 0);
  assert.equal((await quoteDelivery(member, 11)).delivery_fee, 0);
  assert.equal((await quoteDelivery(member, 12)).delivery_fee, 2500);
  assert.equal((await quoteDelivery(member, 13)).delivery_fee, 17500);
  const outside = await quoteDelivery(member, 14);
  assert.equal(outside.available, false);
  assert.equal(outside.delivery_fee, null);
  assert.equal(outside.free_radius_km, 3);
  assert.equal(outside.max_radius_km, 10);
});

test("guest checkout berhasil dengan ongkir tetapi seluruh benefit member ditolak", async () => {
  const created = await createOrder(guest, {
    addressId: 20,
    method: "CASH",
    items: [{ productId: 2, quantity: 1 }],
  });
  assert.equal(created.deliveryFee, 0);
  assert.equal(created.voucherDiscount, 0);
  assert.equal(created.loyaltyDiscount, 0);

  await assert.rejects(
    listCustomerVouchers(guest),
    /hanya tersedia untuk member/,
  );
  await assert.rejects(claimVoucher(guest, 101), /hanya tersedia untuk member/);
  await assert.rejects(
    quoteLoyaltyReward(guest, {
      rewardRuleId: 1,
      items: [{ productId: 2, quantity: 1 }],
    }),
    /hanya tersedia untuk member/,
  );
  await assert.rejects(
    createOrder(guest, {
      addressId: 20,
      method: "CASH",
      promotionId: 101,
      items: [{ productId: 2, quantity: 1 }],
    }),
    /Guest tidak dapat menggunakan/,
  );

  database
    .prepare("UPDATE orders SET status='DELIVERED' WHERE id=?")
    .run(created.id);
  database
    .prepare("UPDATE payments SET status='PAID' WHERE order_id=?")
    .run(created.id);
  const order = database
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(created.id);
  const earn = await store.transaction((tx, mysql) =>
    awardOrderPoints(tx, mysql, order),
  );
  assert.equal(earn.awarded, false);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE user_id=20",
      )
      .get().count,
    0,
  );
});

test("member COD menolak voucher reguler tetapi menerima birthday dan loyalty", async () => {
  await claimVoucher(member, 100);
  await assert.rejects(
    quoteVoucher(member, {
      promotionId: 100,
      paymentMethod: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Voucher reguler tidak berlaku untuk pembayaran COD/,
  );
  await assert.rejects(
    createOrder(member, {
      addressId: 10,
      method: "CASH",
      promotionId: 100,
      items: [{ productId: 1, quantity: 1 }],
    }),
    /Voucher reguler tidak berlaku untuk pembayaran COD/,
  );

  await claimVoucher(member, 101);
  const birthday = await createOrder(member, {
    addressId: 10,
    method: "CASH",
    promotionId: 101,
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(birthday.voucherDiscount, 7000);

  const loyalty = await createOrder(member, {
    addressId: 10,
    method: "CASH",
    loyaltyRewardId: 1,
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(loyalty.loyaltyDiscount, 10000);
});

test("member non-cash tetap dapat voucher dan loyalty yang eligible", async () => {
  await claimVoucher(member, 102);
  const transfer = await createOrder(member, {
    addressId: 10,
    method: "BANK_TRANSFER",
    promotionId: 102,
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(transfer.voucherDiscount, 5000);

  const qris = await createOrder(member, {
    addressId: 10,
    method: "QRIS",
    loyaltyRewardId: 1,
    items: [{ productId: 1, quantity: 1 }],
  });
  assert.equal(qris.loyaltyDiscount, 10000);
  assert.equal(qris.payment.method, "QRIS");
});

test("customer payment labels dan UI contract memakai istilah final", () => {
  for (const method of ["CASH", "COD", "CASH_ON_DELIVERY"])
    assert.equal(paymentMethodLabel(method), "COD");
  assert.equal(paymentMethodLabel("QRIS"), "QRIS");
  for (const method of ["TRANSFER", "BANK_TRANSFER", "TRANSFER_BANK"])
    assert.equal(paymentMethodLabel(method), "TRANSFER BANK");

  const page = fs.readFileSync(
    fileURLToPath(new URL("../app/page.js", import.meta.url)),
    "utf8",
  );
  assert.match(page, /Masuk[\s\S]*Daftar[\s\S]*Guest/);
  assert.match(page, /Lanjut sebagai Guest/);
  assert.match(page, /payment-method-options/);
  assert.match(page, /Voucher reguler tidak berlaku/);
  assert.doesNotMatch(page, /Tunai saat diterima/);
  assert.match(page, /Gratis Ongkir[\s\S]*3 KM/);
});
