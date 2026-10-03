import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "voucher-test-")),
  "test.db",
);
process.env.SESSION_SECRET = "voucher-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const {
  calculateVoucherDiscount,
  claimVoucher,
  listCustomerVouchers,
  quoteVoucher,
} = await import("../lib/vouchers.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES
    (1,'Admin','admin@voucher.test','x','ADMIN'),
    (10,'Customer A','a@voucher.test','x','CUSTOMER'),
    (11,'Customer B','b@voucher.test','x','CUSTOMER');
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price) VALUES
    (1,1,'Menu 20K',20000),
    (2,1,'Menu 50K',50000);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES
    (10,10,'Rumah A','Alamat Customer A',0.049462,0),
    (11,11,'Rumah B','Alamat Customer B',0.049462,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('printer_simulation','true');
`);

const customerA = { id: 10, role: "CUSTOMER" };
const customerB = { id: 11, role: "CUSTOMER" };
let nextPromotionId = 100;

function addVoucher({
  type = "PERCENT",
  value = 10,
  minimum = 0,
  max = null,
  quota = null,
  active = 1,
  starts = "datetime('now','-1 hour')",
  ends = "datetime('now','+1 hour')",
} = {}) {
  const id = nextPromotionId++;
  database
    .prepare(
      `INSERT INTO promotions(
        id,title,description,badge,terms,cta_label,starts_at,ends_at,active,
        voucher_type,discount_value,minimum_order,max_discount,quota,created_by,updated_by
      ) VALUES(?,?,?,?,?,?,${starts},${ends},?,?,?,?,?,?,1,1)`,
    )
    .run(
      id,
      `Voucher ${id}`,
      "Voucher test customer",
      "VOUCHER",
      "Syarat voucher test",
      "Klaim",
      active,
      type,
      value,
      minimum,
      max,
      quota,
    );
  return id;
}

function orderInput(customer, promotionId, overrides = {}) {
  return {
    addressId: customer.id,
    method: "CASH",
    promotionId,
    items: [{ productId: 2, quantity: 1 }],
    ...overrides,
  };
}

test("customer claim berhasil dan duplicate claim idempotent", async () => {
  const promotionId = addVoucher();
  const first = await claimVoucher(customerA, promotionId);
  const duplicate = await claimVoucher(customerA, promotionId);
  assert.equal(first.state, "CLAIMED");
  assert.equal(first.replayed, false);
  assert.equal(duplicate.claimId, first.claimId);
  assert.equal(duplicate.replayed, true);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM promo_claims WHERE promotion_id=? AND customer_id=10",
      )
      .get(promotionId).count,
    1,
  );
  assert.equal(
    (await listCustomerVouchers(customerA)).find(
      (item) => item.id === promotionId,
    ).state,
    "CLAIMED",
  );
});

test("claim customer lain dan voucher belum diklaim tidak dapat dipakai", async () => {
  const claimedByB = addVoucher();
  await claimVoucher(customerB, claimedByB);
  await assert.rejects(
    createOrder(customerA, orderInput(customerA, claimedByB)),
    /belum diklaim oleh akun ini/,
  );
  const unclaimed = addVoucher();
  await assert.rejects(
    createOrder(customerA, orderInput(customerA, unclaimed)),
    /belum diklaim oleh akun ini/,
  );
});

test("claimed voucher eligible menghitung persen, cap, ongkir, dan mengabaikan discount client", async () => {
  const promotionId = addVoucher({ value: 50, max: 12000 });
  await claimVoucher(customerA, promotionId);
  const quote = await quoteVoucher(customerA, {
    promotionId,
    items: [{ productId: 2, quantity: 1 }],
  });
  assert.equal(quote.subtotal, 50000);
  assert.equal(quote.voucher_discount, 12000);
  const order = await createOrder(
    customerA,
    orderInput(customerA, promotionId, { voucherDiscount: 49999 }),
  );
  assert.equal(order.voucherDiscount, 12000);
  assert.equal(order.deliveryFee, 2500);
  assert.equal(order.total, 40500);
  const stored = database
    .prepare(
      "SELECT subtotal,voucher_discount,delivery_fee,total FROM orders WHERE id=?",
    )
    .get(order.id);
  assert.deepEqual(
    { ...stored },
    {
      subtotal: 50000,
      voucher_discount: 12000,
      delivery_fee: 2500,
      total: 40500,
    },
  );
});

test("minimum order, expired, dan inactive voucher ditolak", async () => {
  const minimum = addVoucher({ minimum: 30000 });
  await claimVoucher(customerA, minimum);
  await assert.rejects(
    createOrder(
      customerA,
      orderInput(customerA, minimum, {
        items: [{ productId: 1, quantity: 1 }],
      }),
    ),
    /Minimum belanja/,
  );

  const expired = addVoucher({ ends: "datetime('now','-1 minute')" });
  await assert.rejects(claimVoucher(customerA, expired), /kedaluwarsa/);
  const inactive = addVoucher({ active: 0 });
  await assert.rejects(claimVoucher(customerA, inactive), /tidak tersedia/);
});

test("perhitungan fixed, percent, dan max discount benar", () => {
  assert.equal(
    calculateVoucherDiscount(
      { voucher_type: "FIXED", discount_value: 7000, max_discount: null },
      50000,
    ),
    7000,
  );
  assert.equal(
    calculateVoucherDiscount(
      { voucher_type: "PERCENT", discount_value: 10, max_discount: null },
      50000,
    ),
    5000,
  );
  assert.equal(
    calculateVoucherDiscount(
      { voucher_type: "PERCENT", discount_value: 50, max_discount: 12000 },
      50000,
    ),
    12000,
  );
});

test("voucher used tidak dapat dipakai ulang dan used_count konsisten", async () => {
  const promotionId = addVoucher({ type: "FIXED", value: 5000 });
  await claimVoucher(customerA, promotionId);
  await createOrder(customerA, orderInput(customerA, promotionId));
  await assert.rejects(
    createOrder(customerA, orderInput(customerA, promotionId)),
    /sudah digunakan/,
  );
  const promotion = database
    .prepare("SELECT used_count FROM promotions WHERE id=?")
    .get(promotionId);
  const claim = database
    .prepare(
      "SELECT state,order_id,used_at FROM promo_claims WHERE promotion_id=? AND customer_id=10",
    )
    .get(promotionId);
  assert.equal(promotion.used_count, 1);
  assert.equal(claim.state, "USED");
  assert.ok(claim.order_id);
  assert.ok(claim.used_at);
});

test("double submit dengan checkout key sama tidak double redeem", async () => {
  const promotionId = addVoucher();
  await claimVoucher(customerA, promotionId);
  const input = orderInput(customerA, promotionId, {
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
  });
  const first = await createOrder(customerA, input);
  const replay = await createOrder(customerA, input);
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  assert.equal(
    database
      .prepare("SELECT used_count FROM promotions WHERE id=?")
      .get(promotionId).used_count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM orders WHERE promotion_id=?")
      .get(promotionId).count,
    1,
  );
});

test("quota global membatasi redemption dan tetap konsisten", async () => {
  const promotionId = addVoucher({ quota: 1 });
  await claimVoucher(customerA, promotionId);
  await claimVoucher(customerB, promotionId);
  await createOrder(customerA, orderInput(customerA, promotionId));
  await assert.rejects(
    createOrder(customerB, orderInput(customerB, promotionId)),
    /tidak tersedia|Kuota voucher sudah habis/,
  );
  assert.equal(
    database
      .prepare("SELECT used_count FROM promotions WHERE id=?")
      .get(promotionId).used_count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT state FROM promo_claims WHERE promotion_id=? AND customer_id=11",
      )
      .get(promotionId).state,
    "CLAIMED",
  );
});

test("voucher dan Loyalty Reward diblokir oleh contract v1.0", async () => {
  const promotionId = addVoucher();
  await claimVoucher(customerA, promotionId);
  await assert.rejects(
    createOrder(
      customerA,
      orderInput(customerA, promotionId, { loyaltyPoints: 10 }),
    ),
    /tidak dapat digunakan bersamaan/,
  );
  assert.equal(
    database
      .prepare(
        "SELECT state FROM promo_claims WHERE promotion_id=? AND customer_id=10",
      )
      .get(promotionId).state,
    "CLAIMED",
  );
});

test("kegagalan sebelum commit tidak menghabiskan voucher", async () => {
  const promotionId = addVoucher();
  await claimVoucher(customerA, promotionId);
  const ordersBefore = database.prepare("SELECT COUNT(*) count FROM orders").get().count;
  database.exec(`
    CREATE TRIGGER reject_customer_order_notification
    BEFORE INSERT ON notifications
    WHEN NEW.user_id=10 AND NEW.message LIKE 'Pesanan #% berhasil dibuat'
    BEGIN
      SELECT RAISE(ABORT,'forced pre-commit failure');
    END;
  `);
  await assert.rejects(
    createOrder(customerA, orderInput(customerA, promotionId)),
    /forced pre-commit failure/,
  );
  database.exec("DROP TRIGGER reject_customer_order_notification");
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    ordersBefore,
  );
  assert.deepEqual(
    {
      ...database
        .prepare("SELECT state,order_id FROM promo_claims WHERE promotion_id=? AND customer_id=10")
        .get(promotionId),
    },
    { state: "CLAIMED", order_id: null },
  );
  assert.equal(
    database.prepare("SELECT used_count FROM promotions WHERE id=?").get(promotionId)
      .used_count,
    0,
  );
});
