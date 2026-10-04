import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "qris-payment-test-")),
  "data.db",
);
process.env.PAYMENT_PROVIDER_MODE = "simulation";
process.env.PAYMENT_WEBHOOK_SECRET =
  "qris-payment-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus } = await import("../lib/domain.mjs");
const {
  expirePendingPayments,
  getPaymentStatus,
  processPaymentWebhook,
  processTrustedProviderEvent,
  verifyPayment,
} = await import("../lib/payments.mjs");
const { signLocalWebhook, LOCAL_QRIS_PROVIDER } =
  await import("../lib/payment-provider.mjs");
const { claimVoucher } = await import("../lib/vouchers.mjs");
const { saveRewardRule } = await import("../lib/loyalty.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Owner','owner@qris.test','x','OWNER'),
    (2,'Admin','admin@qris.test','x','ADMIN'),
    (3,'Customer A','a@qris.test','x','CUSTOMER'),
    (4,'Customer B','b@qris.test','x','CUSTOMER');
  INSERT INTO loyalty_accounts(user_id,balance) VALUES(3,30),(4,0);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity) VALUES
    (1,1,'Nasi QRIS',50000,20),
    (2,1,'Kopi QRIS',20000,20),
    (3,1,'Stok Terbatas QRIS',30000,1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES
    (1,3,'Rumah','Alamat gratis ongkir',0,0),
    (2,3,'Kantor','Alamat ongkir tambahan',0.049462,0),
    (3,4,'Rumah B','Alamat customer lain',0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('payment_expiry_minutes','12'),
    ('printer_simulation','true');
`);

const owner = { id: 1, role: "OWNER" };
const admin = { id: 2, role: "ADMIN" };
const customer = { id: 3, role: "CUSTOMER" };
const otherCustomer = { id: 4, role: "CUSTOMER" };

function input(extra = {}) {
  return {
    addressId: 1,
    method: "QRIS",
    items: [{ productId: 1, quantity: 1 }],
    ...extra,
  };
}

function webhook(payment, status, eventId, overrides = {}) {
  const raw = JSON.stringify({
    event_id: eventId,
    transaction_reference: payment.transaction_reference,
    provider_reference: payment.provider_reference,
    status,
    ...overrides,
  });
  return processPaymentWebhook(raw, signLocalWebhook(raw));
}

test("QRIS memakai final_total server, mulai PENDING, expiry server, dan checkout replay aman", async () => {
  const key = "44444444-4444-4444-8444-444444444444";
  const created = await createOrder(
    customer,
    input({ amount: 1, total: 1, deliveryFee: 1, idempotencyKey: key }),
  );
  assert.equal(created.total, 50000);
  assert.equal(created.payment.amount, 50000);
  assert.equal(created.payment.status, "PENDING");
  assert.equal(created.payment.method, "QRIS");
  assert.ok(created.payment.qr_payload);
  assert.ok(created.payment.expires_at);
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=1").get()
      .stock_quantity,
    20,
  );
  assert.equal(
    database
      .prepare("SELECT status FROM stock_reservations WHERE order_id=?")
      .get(created.id).status,
    "RESERVED",
  );
  const replay = await createOrder(
    customer,
    input({ amount: 999999, idempotencyKey: key }),
  );
  assert.equal(replay.id, created.id);
  assert.equal(replay.replayed, true);
  assert.equal(
    replay.payment.transaction_reference,
    created.payment.transaction_reference,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    1,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM payments").get().count,
    1,
  );
  const status = await getPaymentStatus(customer, created.id);
  assert.equal(status.status, "PENDING");
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    1,
  );
  await assert.rejects(getPaymentStatus(otherCustomer, created.id), /Akses/);
});

test("provider PAID commit stock/fulfillment/notifikasi tepat sekali", async () => {
  const created = await createOrder(
    customer,
    input({ items: [{ productId: 2, quantity: 1 }] }),
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?")
      .get(created.id).count,
    0,
  );
  const first = await webhook(created.payment, "PAID", "evt-paid-1");
  assert.equal(first.payment.status, "PAID");
  assert.equal(first.replayed, false);
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=2").get()
      .stock_quantity,
    19,
  );
  assert.equal(
    database
      .prepare("SELECT status FROM stock_reservations WHERE order_id=?")
      .get(created.id).status,
    "COMMITTED",
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM stock_movements WHERE order_id=? AND kind='SALE'",
      )
      .get(created.id).count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM order_stations WHERE order_id=?")
      .get(created.id).count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?")
      .get(created.id).count,
    2,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=3 AND message LIKE '%Pembayaran%berhasil%'",
      )
      .get().count,
    1,
  );

  const duplicate = await webhook(created.payment, "PAID", "evt-paid-1");
  assert.equal(duplicate.replayed, true);
  const secondEvent = await webhook(created.payment, "PAID", "evt-paid-2");
  assert.equal(secondEvent.replayed, true);
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=2").get()
      .stock_quantity,
    19,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?")
      .get(created.id).count,
    2,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=3 AND message LIKE '%Pembayaran%berhasil%'",
      )
      .get().count,
    1,
  );
  await changeStatus(admin, created.id, "CONFIRMED");
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=2").get()
      .stock_quantity,
    19,
  );
});

test("FAILED melepaskan reservasi dan mengembalikan voucher tepat sekali", async () => {
  database.exec(`
    INSERT INTO promotions(id,title,description,badge,terms,cta_label,starts_at,ends_at,voucher_type,discount_value,minimum_order,created_by,updated_by)
    VALUES(20,'Voucher QRIS','Diskon test','QRIS','Sekali pakai','Klaim',datetime('now','-1 day'),datetime('now','+1 day'),'FIXED',10000,10000,1,1);
  `);
  await claimVoucher(customer, 20);
  const created = await createOrder(customer, input({ promotionId: 20 }));
  assert.equal(created.total, 40000);
  assert.equal(created.payment.amount, 40000);
  await webhook(created.payment, "FAILED", "evt-failed-1");
  assert.equal(
    database
      .prepare("SELECT status FROM stock_reservations WHERE order_id=?")
      .get(created.id).status,
    "RELEASED",
  );
  const restoredClaim = database
    .prepare(
      "SELECT state,order_id FROM promo_claims WHERE promotion_id=20 AND customer_id=3",
    )
    .get();
  assert.equal(restoredClaim.state, "CLAIMED");
  assert.equal(restoredClaim.order_id, null);
  assert.equal(
    database.prepare("SELECT used_count FROM promotions WHERE id=20").get()
      .used_count,
    0,
  );
  const duplicate = await webhook(created.payment, "FAILED", "evt-failed-1");
  assert.equal(duplicate.replayed, true);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=3 AND message LIKE '%Pembayaran%gagal%'",
      )
      .get().count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(created.id).count,
    0,
  );
  await assert.rejects(
    changeStatus(admin, created.id, "CONFIRMED"),
    /terverifikasi/,
  );
});

test("EXPIRED idempotent, late PAID ditolak, dan reward dikembalikan", async () => {
  const reward = await saveRewardRule(owner, {
    name: "Reward QRIS",
    pointsRequired: 15,
    rewardType: "FIXED",
    rewardValue: 10000,
    minimumOrder: 20000,
    active: true,
  });
  const created = await createOrder(
    customer,
    input({ loyaltyRewardId: reward.id }),
  );
  assert.equal(created.payment.amount, 40000);
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=3")
      .get().balance,
    15,
  );
  database
    .prepare(
      "UPDATE payments SET expires_at=datetime('now','-1 minute') WHERE order_id=?",
    )
    .run(created.id);
  assert.equal(await expirePendingPayments(), 1);
  assert.equal(await expirePendingPayments(), 0);
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(created.id).status,
    "EXPIRED",
  );
  assert.equal(
    database
      .prepare("SELECT status FROM stock_reservations WHERE order_id=?")
      .get(created.id).status,
    "RELEASED",
  );
  assert.equal(
    database
      .prepare("SELECT balance FROM loyalty_accounts WHERE user_id=3")
      .get().balance,
    30,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='RESTORE'",
      )
      .get(created.id).count,
    1,
  );
  await assert.rejects(
    webhook(created.payment, "PAID", "evt-late-paid"),
    /kedaluwarsa/,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
      )
      .get(created.id).count,
    0,
  );
});

test("webhook tidak tepercaya, customer self-PAID, dan provider reference palsu ditolak", async () => {
  const created = await createOrder(customer, input());
  await assert.rejects(verifyPayment(customer, created.id, "PAID"), /Akses/);
  await assert.rejects(
    verifyPayment(admin, created.id, "PAID"),
    /provider tepercaya/,
  );
  await assert.rejects(
    processTrustedProviderEvent({
      trusted: false,
      provider: LOCAL_QRIS_PROVIDER,
      eventId: "evt-untrusted",
      transactionReference: created.payment.transaction_reference,
      providerReference: created.payment.provider_reference,
      status: "PAID",
      payloadHash: "x".repeat(64),
    }),
    /belum terverifikasi/,
  );
  const raw = JSON.stringify({
    event_id: "evt-bad-signature",
    transaction_reference: created.payment.transaction_reference,
    provider_reference: created.payment.provider_reference,
    status: "PAID",
  });
  await assert.rejects(processPaymentWebhook(raw, "0".repeat(64)), /Signature/);
  await assert.rejects(
    webhook(created.payment, "PAID", "evt-bad-reference", {
      provider_reference: "REFERENCE-PALSU",
    }),
    /tidak cocok/,
  );
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(created.id).status,
    "PENDING",
  );
});

test("QRIS memasukkan ongkir, menjaga non-stacking, dan status bertahan saat refresh", async () => {
  const shipping = await createOrder(customer, input({ addressId: 2 }));
  assert.equal(shipping.deliveryFee, 2500);
  assert.equal(shipping.total, 52500);
  assert.equal(shipping.payment.amount, 52500);
  const refreshed = await getPaymentStatus(customer, shipping.id);
  assert.equal(
    refreshed.transaction_reference,
    shipping.payment.transaction_reference,
  );
  assert.equal(refreshed.amount, 52500);
  await assert.rejects(
    createOrder(customer, input({ promotionId: 20, loyaltyRewardId: 1 })),
    /tidak dapat digunakan bersamaan/,
  );
});

test("reservasi QRIS melindungi stok dan PAID yang melewati expires_at ditolak", async () => {
  const reserved = await createOrder(
    customer,
    input({ items: [{ productId: 3, quantity: 1 }] }),
  );
  const cashOrder = await createOrder(otherCustomer, {
    addressId: 3,
    method: "CASH",
    items: [{ productId: 3, quantity: 1 }],
  });
  await assert.rejects(
    changeStatus(admin, cashOrder.id, "CONFIRMED"),
    /tidak mencukupi/,
  );
  await webhook(reserved.payment, "PAID", "evt-limited-stock-paid");
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=3").get()
      .stock_quantity,
    0,
  );

  const stale = await createOrder(customer, input());
  database
    .prepare(
      "UPDATE payments SET expires_at=datetime('now','-1 minute') WHERE order_id=?",
    )
    .run(stale.id);
  await assert.rejects(
    webhook(stale.payment, "PAID", "evt-stale-paid"),
    /melewati batas waktu/,
  );
  assert.equal((await getPaymentStatus(customer, stale.id)).status, "EXPIRED");
});
