import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qris-auto-confirm-v1-"));
process.env.DATABASE_PATH = path.join(temp, "data.db");
process.env.PAYMENT_PROVIDER_MODE = "simulation";
process.env.PAYMENT_WEBHOOK_SECRET =
  "qris-auto-confirm-test-secret-with-more-than-32-characters";
process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED = "true";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus, sweepPaidQrisAutoConfirm } =
  await import("../lib/domain.mjs");
const { processTrustedProviderEvent } = await import("../lib/payments.mjs");
const { LOCAL_QRIS_PROVIDER } = await import("../lib/payment-provider.mjs");
const { resetRealtimeForTests, subscribeRealtime } =
  await import("../lib/realtime.mjs");
const {
  runQrisAutoConfirmSweep,
  startQrisAutoConfirmWorker,
  stopQrisAutoConfirmWorker,
} = await import("../lib/qris-auto-confirm-worker.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Owner Auto','owner@auto.test','x','OWNER',1),
    (2,'Admin Auto','admin@auto.test','x','ADMIN',1),
    (3,'Kitchen Auto','kitchen@auto.test','x','KITCHEN',1),
    (4,'Customer Auto','customer@auto.test','x','CUSTOMER',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station)
  VALUES(1,1,'Nasi Auto Confirm',18000,100,'KITCHEN');
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default) VALUES
    (1,4,'Rumah','Alamat delivery auto confirm',0,0,1),
    (2,4,'Ambil di Warkost','Warkost Bahagia · Ambil di tempat',0,0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','3'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','10'),
    ('payment_expiry_minutes','12'),
    ('printer_simulation','true');
`);

const customer = { id: 4, role: "CUSTOMER" };
const admin = { id: 2, role: "ADMIN" };
let sequence = 0;

async function createQrisOrder({ fulfillmentType = "DELIVERY" } = {}) {
  return createOrder(customer, {
    addressId: fulfillmentType === "PICKUP" ? 2 : 1,
    fulfillmentType,
    method: "QRIS",
    items: [{ productId: 1, quantity: 1 }],
  });
}

async function markPaid(created, ageSeconds = 0) {
  sequence += 1;
  const result = await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: `evt-auto-confirm-${sequence}`,
    transactionReference: created.payment.transaction_reference,
    providerReference: created.payment.provider_reference,
    status: "PAID",
    payloadHash: `hash-${sequence}`,
  });
  if (ageSeconds)
    database
      .prepare("UPDATE payments SET paid_at=datetime('now',?) WHERE order_id=?")
      .run(`-${ageSeconds} seconds`, created.id);
  return result;
}

function orderState(orderId) {
  return database
    .prepare(
      "SELECT o.status,o.fulfillment_type,p.status payment_status,p.paid_at FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=?",
    )
    .get(orderId);
}

test.after(() => {
  stopQrisAutoConfirmWorker();
  try {
    database.close();
  } catch {}
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

test("worker server-side memakai timer unref dan dapat dihentikan", () => {
  const instrumentation = fs.readFileSync(
    new URL("../instrumentation.js", import.meta.url),
    "utf8",
  );
  assert.match(instrumentation, /NEXT_RUNTIME\s*!==\s*["']nodejs["']/);
  assert.match(instrumentation, /startQrisAutoConfirmWorker/);
  delete process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED;
  const timer = startQrisAutoConfirmWorker({
    intervalMs: 60_000,
    runImmediately: false,
  });
  assert.ok(timer);
  assert.equal(timer.hasRef?.(), false);
  stopQrisAutoConfirmWorker();
  process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED = "true";
});

test("QRIS PAID kurang dari 60 detik tetap PENDING", async () => {
  const order = await createQrisOrder();
  await markPaid(order, 30);
  const result = await sweepPaidQrisAutoConfirm();
  assert.equal(result.count, 0);
  assert.equal(orderState(order.id).status, "PENDING");
});

test("QRIS PAID 60 detik auto-confirm dan realtime menjangkau role relevan", async () => {
  const order = await createQrisOrder();
  await markPaid(order);
  const paidAt = "2026-10-23 10:00:00";
  database
    .prepare("UPDATE payments SET paid_at=? WHERE order_id=?")
    .run(paidAt, order.id);
  resetRealtimeForTests();
  const received = { customer: [], admin: [], kitchen: [] };
  subscribeRealtime(customer, (event) => received.customer.push(event));
  subscribeRealtime(admin, (event) => received.admin.push(event));
  subscribeRealtime({ id: 3, role: "KITCHEN" }, (event) =>
    received.kitchen.push(event),
  );

  const result = await runQrisAutoConfirmSweep({
    nowMs: Date.parse("2026-10-23T10:01:00Z"),
  });
  assert.equal(result.count, 1);
  assert.equal(result.confirmed[0].id, order.id);
  assert.equal(orderState(order.id).status, "CONFIRMED");
  for (const events of Object.values(received)) {
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "ORDER_STATUS_CHANGED");
    assert.equal(events[0].payload.orderId, order.id);
    assert.equal(events[0].payload.status, "CONFIRMED");
  }
});

test("manual confirm sebelum jatuh tempo membuat sweep NO-OP", async () => {
  const order = await createQrisOrder();
  await markPaid(order, 30);
  await changeStatus(admin, order.id, "CONFIRMED");
  database
    .prepare(
      "UPDATE payments SET paid_at=datetime('now','-2 minutes') WHERE order_id=?",
    )
    .run(order.id);
  const result = await sweepPaidQrisAutoConfirm();
  assert.equal(result.count, 0);
  assert.equal(orderState(order.id).status, "CONFIRMED");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='ORDER_AUTO_CONFIRMED' AND details LIKE ?",
      )
      .get(`%\"orderId\":${order.id}%`).count,
    0,
  );
});

test("payment PENDING, FAILED, dan EXPIRED tidak pernah auto-confirm", async () => {
  const pending = await createQrisOrder();
  database
    .prepare(
      "UPDATE payments SET paid_at=datetime('now','-2 minutes') WHERE order_id=?",
    )
    .run(pending.id);

  const failed = await createQrisOrder();
  sequence += 1;
  await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: `evt-auto-confirm-${sequence}`,
    transactionReference: failed.payment.transaction_reference,
    providerReference: failed.payment.provider_reference,
    status: "FAILED",
    payloadHash: `hash-${sequence}`,
  });
  database
    .prepare(
      "UPDATE payments SET paid_at=datetime('now','-2 minutes') WHERE order_id=?",
    )
    .run(failed.id);

  const expired = await createQrisOrder();
  sequence += 1;
  await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: `evt-auto-confirm-${sequence}`,
    transactionReference: expired.payment.transaction_reference,
    providerReference: expired.payment.provider_reference,
    status: "EXPIRED",
    payloadHash: `hash-${sequence}`,
  });
  database
    .prepare(
      "UPDATE payments SET paid_at=datetime('now','-2 minutes') WHERE order_id=?",
    )
    .run(expired.id);

  const result = await sweepPaidQrisAutoConfirm();
  assert.equal(result.count, 0);
  assert.equal(orderState(pending.id).status, "PENDING");
  assert.equal(orderState(failed.id).status, "PENDING");
  assert.equal(orderState(expired.id).status, "PENDING");
});

test("sweep overlap tidak menggandakan stok, print job, notifikasi, atau audit", async () => {
  const order = await createQrisOrder();
  await markPaid(order, 61);
  const before = {
    stock: database
      .prepare(
        "SELECT COUNT(*) count FROM stock_movements WHERE order_id=? AND kind='SALE'",
      )
      .get(order.id).count,
    print: database
      .prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?")
      .get(order.id).count,
  };
  assert.equal(before.stock, 1);
  assert.equal(before.print, 1);

  const overlapping = await Promise.all([
    sweepPaidQrisAutoConfirm(),
    sweepPaidQrisAutoConfirm(),
  ]);
  assert.equal(
    overlapping.reduce((total, result) => total + result.count, 0),
    1,
  );
  assert.equal((await sweepPaidQrisAutoConfirm()).count, 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM stock_movements WHERE order_id=? AND kind='SALE'",
      )
      .get(order.id).count,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?")
      .get(order.id).count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='ORDER_AUTO_CONFIRMED' AND details LIKE ?",
      )
      .get(`%\"orderId\":${order.id}%`).count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND message=?",
      )
      .get(customer.id, `Pesanan #${order.id} dikonfirmasi`).count,
    1,
  );
});

test("auto-confirm berlaku untuk PICKUP dan DELIVERY tanpa membuat delivery", async () => {
  const pickup = await createQrisOrder({ fulfillmentType: "PICKUP" });
  const delivery = await createQrisOrder({ fulfillmentType: "DELIVERY" });
  await markPaid(pickup, 61);
  await markPaid(delivery, 61);
  const result = await sweepPaidQrisAutoConfirm();
  assert.equal(result.count, 2);
  assert.equal(orderState(pickup.id).status, "CONFIRMED");
  assert.equal(orderState(pickup.id).fulfillment_type, "PICKUP");
  assert.equal(orderState(delivery.id).status, "CONFIRMED");
  assert.equal(orderState(delivery.id).fulfillment_type, "DELIVERY");
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM deliveries WHERE order_id IN (?,?)")
      .get(pickup.id, delivery.id).count,
    0,
  );
});
