import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "delivery-communications-test-")),
  "test.db",
);
process.env.SESSION_SECRET =
  "delivery-communications-secret-with-over-32-characters";

const { db } = await import("../lib/db.mjs");
const {
  calculateDelivery,
  driverContactIsVisible,
  normalizeWhatsApp,
  validateDeliveryRules,
} = await import("../lib/delivery.mjs");
const { createOrder, quoteDelivery } = await import("../lib/domain.mjs");
const { expirePendingPayments } = await import("../lib/payments.mjs");
const { retryPrintJob } = await import("../lib/printer.mjs");
const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,phone) VALUES
    (1,'Admin','admin@test.local','x','ADMIN',NULL),
    (2,'Kitchen','kitchen@test.local','x','KITCHEN',NULL),
    (3,'Owner','owner@test.local','x','OWNER',NULL),
    (4,'Driver','driver@test.local','x','DRIVER','6281546407856'),
    (5,'Customer','customer@test.local','x','CUSTOMER',NULL);
  INSERT INTO categories(id,name) VALUES(1,'Makanan'),(2,'Minuman');
  INSERT INTO products(id,category_id,name,price,prep_station) VALUES
    (1,1,'Nasi',20000,'KITCHEN'),
    (2,2,'Kopi',10000,'CASHIER');
  INSERT INTO settings(key,value) VALUES
    ('business_whatsapp','6281546407856'),
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','5'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','15'),
    ('printer_simulation','false');
`);

const customer = { id: 5, role: "CUSTOMER" };
const latitudeAtMeters = (meters) => (meters / 6371000) * (180 / Math.PI);

test("ongkir memiliki boundary 3/10 km dan nomor WhatsApp dinormalisasi", () => {
  assert.deepEqual(calculateDelivery(0), {
    distanceMeters: 0,
    deliveryFee: 0,
    freeDelivery: true,
  });
  assert.deepEqual(calculateDelivery(3000), {
    distanceMeters: 3000,
    deliveryFee: 0,
    freeDelivery: true,
  });
  assert.equal(calculateDelivery(3001).deliveryFee, 2500);
  assert.equal(calculateDelivery(10000).deliveryFee, 17500);
  assert.throws(() => calculateDelivery(10001), /di luar radius/);
  assert.throws(() => calculateDelivery(-1), /Jarak pengantaran/);
  assert.throws(
    () => validateDeliveryRules({ freeKm: 16, feePerKm: 2500, maxKm: 15 }),
    /Konfigurasi ongkir/,
  );
  assert.throws(
    () => validateDeliveryRules({ freeKm: 5, feePerKm: -1, maxKm: 15 }),
    /Konfigurasi ongkir/,
  );
  assert.equal(normalizeWhatsApp("0815-4640-7856"), "6281546407856");
});

test("quote ongkir memakai koordinat tersimpan, config terbaru, dan boundary yang stabil", async () => {
  for (const [id, meters] of [
    [10, 0],
    [11, 3000],
    [12, 3001],
    [13, 10000],
    [14, 10001],
  ])
    database
      .prepare(
        "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(?,5,?,?,?,0)",
      )
      .run(id, `Boundary ${meters}`, `Alamat boundary ${meters} meter`, latitudeAtMeters(meters));
  database
    .prepare(
      "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(15,5,'Invalid latitude','Alamat latitude tidak valid',91,0)",
    )
    .run();
  database
    .prepare(
      "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(16,5,'Invalid longitude','Alamat longitude tidak valid',0,181)",
    )
    .run();

  assert.deepEqual(
    {
      available: (await quoteDelivery(customer, 10)).available,
      fee: (await quoteDelivery(customer, 10)).delivery_fee,
    },
    { available: true, fee: 0 },
  );
  assert.equal((await quoteDelivery(customer, 11)).delivery_fee, 0);
  assert.equal((await quoteDelivery(customer, 12)).delivery_fee, 2500);
  assert.equal((await quoteDelivery(customer, 13)).delivery_fee, 17500);
  const outside = await quoteDelivery(customer, 14);
  assert.equal(outside.available, false);
  assert.equal(outside.delivery_fee, null);
  assert.match(outside.message, /di luar radius delivery maksimal 10 km/);

  database
    .prepare("UPDATE settings SET value='3000' WHERE key='delivery_fee_per_km'")
    .run();
  assert.equal((await quoteDelivery(customer, 12)).delivery_fee, 3000);
  database
    .prepare("UPDATE settings SET value='2500' WHERE key='delivery_fee_per_km'")
    .run();

  await assert.rejects(quoteDelivery(customer, 15), /Latitude tidak valid/);
  await assert.rejects(quoteDelivery(customer, 16), /Longitude tidak valid/);
  const before = database.prepare("SELECT COUNT(*) count FROM orders").get().count;
  await assert.rejects(
    createOrder(customer, {
      addressId: 14,
      method: "CASH",
      items: [{ productId: 1, quantity: 1 }],
    }),
    /di luar radius/,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    before,
  );
});

test("checkout menghitung ongkir di server dan print job idempotent per station", async () => {
  database
    .prepare(
      "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,5,'Rumah','Alamat pin enam kilometer',?,0)",
    )
    .run(latitudeAtMeters(5500));
  const input = {
    addressId: 1,
    method: "CASH",
    deliveryFee: 1,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ],
  };
  const created = await createOrder(customer, input);
  assert.equal(created.subtotal, 30000);
  assert.equal(created.deliveryFee, 7500);
  assert.equal(created.total, 37500);
  assert.equal(
    database
      .prepare("SELECT delivery_fee,distance_meters,total FROM orders WHERE id=?")
      .get(created.id).distance_meters,
    5500,
  );
  const storedDelivery = database
    .prepare("SELECT delivery_fee,total FROM orders WHERE id=?")
    .get(created.id);
  assert.equal(storedDelivery.delivery_fee, 7500);
  assert.equal(storedDelivery.total, 37500);
  assert.equal(
    database.prepare("SELECT COUNT(*) n FROM print_jobs").get().n,
    2,
  );
  const kitchenPayload = JSON.parse(
    database
      .prepare("SELECT payload_json FROM print_jobs WHERE station='KITCHEN'")
      .get().payload_json,
  );
  assert.deepEqual(
    kitchenPayload.items.map((item) => item.name),
    ["Nasi"],
  );
  const replay = await createOrder(customer, input);
  assert.equal(replay.replayed, true);
  assert.equal(
    database.prepare("SELECT COUNT(*) n FROM print_jobs").get().n,
    2,
  );

  const adminJob = database
    .prepare("SELECT id FROM print_jobs WHERE station='ADMIN'")
    .get();
  database
    .prepare("UPDATE print_jobs SET status='FAILED' WHERE id=?")
    .run(adminJob.id);
  assert.deepEqual(await retryPrintJob({ id: 1, role: "ADMIN" }, adminJob.id), {
    id: adminJob.id,
    status: "REPRINTED",
  });
  await assert.rejects(
    retryPrintJob({ id: 2, role: "KITCHEN" }, adminJob.id),
    /Akses ditolak/,
  );
});

test("transfer kedaluwarsa tercatat dan contact driver mengikuti privacy window", async () => {
  database
    .prepare(
      "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(2,5,'Kantor','Alamat kantor customer',0,0)",
    )
    .run();
  const order = await createOrder(customer, {
    addressId: 2,
    method: "BANK_TRANSFER",
    items: [{ productId: 1, quantity: 1 }],
  });
  database
    .prepare(
      "UPDATE payments SET expires_at=datetime('now','-1 minute') WHERE order_id=?",
    )
    .run(order.id);
  assert.equal(await expirePendingPayments(), 1);
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(order.id).status,
    "EXPIRED",
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM audit_logs WHERE action='PAYMENT_EXPIRED'",
      )
      .get().n,
    1,
  );

  const now = Date.UTC(2026, 8, 28, 12, 0, 0);
  assert.equal(driverContactIsVisible(null, null, now), false);
  assert.equal(driverContactIsVisible("2026-09-28 10:00:00", null, now), true);
  assert.equal(
    driverContactIsVisible("2026-09-28 09:00:00", "2026-09-28 10:30:00", now),
    true,
  );
  assert.equal(
    driverContactIsVisible("2026-09-28 08:00:00", "2026-09-28 09:59:59", now),
    false,
  );
});

test("checkout memberi peringatan saat semua driver mencapai 5 tugas", async () => {
  for (let id = 100; id < 105; id += 1) {
    database
      .prepare(
        "INSERT INTO orders(id,customer_id,address_id,status,subtotal,total) VALUES(?,5,2,'ASSIGNED',1000,1000)",
      )
      .run(id);
    database
      .prepare("INSERT INTO deliveries(order_id,driver_id) VALUES(?,4)")
      .run(id);
  }
  const order = await createOrder(customer, {
    addressId: 2,
    method: "CASH",
    items: [{ productId: 2, quantity: 1 }],
  });
  assert.equal(order.driverDelayNotice, true);
  assert.equal(
    database
      .prepare("SELECT driver_delay_notice FROM orders WHERE id=?")
      .get(order.id).driver_delay_notice,
    1,
  );
});
