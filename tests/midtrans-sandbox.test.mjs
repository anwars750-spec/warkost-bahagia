import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  fixtureMerchant,
  midtransFixture,
  signedMidtrans,
} from "./helpers/midtrans-fixture.mjs";

const key = "SB-Mid-server-" + crypto.randomUUID();
Object.assign(process.env, {
  DATABASE_URL: "",
  DATABASE_PATH: path.join(
    mkdtempSync(path.join(tmpdir(), "midtrans-sandbox-test-")),
    "data.db",
  ),
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "isolated-uat",
  PAYMENT_PROVIDER_MODE: "midtrans-sandbox",
  MIDTRANS_SANDBOX_SERVER_KEY: key,
  MIDTRANS_SANDBOX_MERCHANT_ID: fixtureMerchant,
});
const { db } = await import("../lib/db.mjs");
const {
  createOrder,
  updateStationStatus,
  sweepPaidQrisAutoConfirm,
  completePickupOrder,
} = await import("../lib/domain.mjs");
const { ensurePickupAddress } = await import("../lib/pickup.mjs");
const {
  handleMidtransNotification,
  runMidtransReconciliation,
  readMidtransQr,
  getMidtransOperations,
  updateMidtransOperations,
} = await import("../lib/midtrans-reconciliation.mjs");
const { processTrustedProviderEvent, getPaymentStatus } =
  await import("../lib/payments.mjs");
const { midtransSandboxConfig, MIDTRANS_SANDBOX } =
  await import("../lib/midtrans-sandbox.mjs");
const { paymentProviderConfiguration } =
  await import("../lib/payment-provider.mjs");
const database = db();
database.exec(`
 INSERT INTO users(id,name,email,password_hash,role) VALUES
  (1,'Owner','owner@example.test','x','OWNER'), (2,'Admin','admin@example.test','x','ADMIN'),
  (3,'Customer','customer@example.test','x','CUSTOMER'), (4,'Other','other@example.test','x','CUSTOMER'),
  (5,'Kitchen','kitchen@example.test','x','KITCHEN');
 INSERT INTO categories(id,name) VALUES(1,'Food');
 INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station)
 VALUES(1,1,'Menu fixture',50000,100,'KITCHEN');
 INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,3,'Rumah','Alamat fixture',0,0);
 INSERT INTO settings(key,value) VALUES('business_latitude','0'),('business_longitude','0'),('printer_simulation','true');
`);
const owner = { id: 1, role: "OWNER" };
const admin = { id: 2, role: "ADMIN" };
const customer = { id: 3, role: "CUSTOMER" };
const other = { id: 4, role: "CUSTOMER" };
const pickup = await ensurePickupAddress(customer.id);
const input = (extra = {}) => ({
  addressId: 1,
  method: "QRIS",
  idempotencyKey: crypto.randomUUID(),
  items: [{ productId: 1, quantity: 1 }],
  ...extra,
});
const openStoreAt = Date.parse("2026-10-23T12:00:00+07:00");
const createFixtureOrder = (payload) =>
  createOrder(customer, payload, { nowMs: openStoreAt });
const reference = (order) => order.payment.transaction_reference;
const payment = (order) =>
  database.prepare("SELECT * FROM payments WHERE order_id=?").get(order.id);
const caseFor = (order) =>
  database
    .prepare(
      "SELECT * FROM midtrans_qris_attention WHERE payment_id=? ORDER BY id DESC",
    )
    .get(order.payment.id);
const due = (order) =>
  database
    .prepare(
      "UPDATE midtrans_qris_tracking SET next_check_at=CURRENT_TIMESTAMP WHERE payment_id=?",
    )
    .run(order.payment.id);
const counts = (order) => ({
  stock: database
    .prepare(
      "SELECT COUNT(*) n FROM stock_movements WHERE order_id=? AND kind='SALE'",
    )
    .get(order.id).n,
  loyalty: database
    .prepare(
      "SELECT COUNT(*) n FROM loyalty_transactions WHERE order_id=? AND kind='EARN'",
    )
    .get(order.id).n,
  print: database
    .prepare("SELECT COUNT(*) n FROM print_jobs WHERE order_id=?")
    .get(order.id).n,
  fulfillment: database
    .prepare(
      "SELECT COUNT(*) n FROM audit_logs WHERE action='ORDER_AUTO_CONFIRMED' AND json_extract(details,'$.orderId')=?",
    )
    .get(order.id).n,
});
const empty = { stock: 0, loyalty: 0, print: 0, fulfillment: 0 };
const switchNew = (enabled) =>
  updateMidtransOperations(owner, { action: "set-new-payments", enabled });
const fixture = midtransFixture(key);
const sweep = (source = fixture) =>
  runMidtransReconciliation({ fetcher: source.fetcher });
const notify = (data, overrides, source = fixture) =>
  handleMidtransNotification(signedMidtrans(data, key, overrides), {
    fetcher: source.fetcher,
  });

async function charged(extra = {}, source = fixture) {
  const order = await createFixtureOrder(input(extra));
  await sweep(source);
  assert.ok(source.pending(reference(order)));
  return order;
}

test("sandbox transport is restricted to isolated SQLite and a sandbox key", () => {
  assert.equal(paymentProviderConfiguration().provider, MIDTRANS_SANDBOX);
  for (const environment of [
    { DEPLOYMENT_ENV: "production" },
    { DATABASE_PATH: "" },
    { DEPLOYMENT_ENV: "staging" },
    { DATABASE_URL: "mysql://fixture.invalid" },
    { MIDTRANS_SANDBOX_SERVER_KEY: "live-key-placeholder" },
    { PAYMENT_PROVIDER_MODE: "midtrans" },
  ])
    assert.equal(
      midtransSandboxConfig({ ...process.env, ...environment }),
      null,
    );
});

test("Owner switch defaults OFF, blocks new orders, and leaves webhook/reconciliation active", async () => {
  assert.equal((await getMidtransOperations(owner)).enabled, false);
  await assert.rejects(createFixtureOrder(input()), { status: 503 });
  await assert.rejects(
    updateMidtransOperations(admin, {
      action: "set-new-payments",
      enabled: true,
    }),
    { status: 403 },
  );
  assert.equal(database.prepare("SELECT COUNT(*) n FROM orders").get().n, 0);
  await switchNew(true);
  const payload = input();
  const order = await createFixtureOrder(payload);
  await sweep();
  assert.ok(payment(order).provider_reference);
  await switchNew(false);
  assert.equal((await createFixtureOrder(payload)).id, order.id);
  await assert.rejects(createFixtureOrder(input()), { status: 503 });
  await notify(fixture.setStatus(reference(order), "settlement"));
  assert.equal(payment(order).status, "PAID");
  await switchNew(true);
});

test("checkout and worker retries keep one order and one provider charge after a lost response", async () => {
  let dropped = false;
  const fault = midtransFixture(key, {
    onCharge() {
      dropped = true;
      throw new Error("response lost");
    },
    statusFor() {
      if (dropped) {
        dropped = false;
        throw new Error("status temporarily unavailable");
      }
    },
  });
  const payload = input();
  const [a, b] = await Promise.all([
    createFixtureOrder(payload),
    createFixtureOrder(payload),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(reference(a), reference(b));
  assert.equal(payment(a).provider_reference, null);
  await Promise.all([sweep(fault), sweep(fault)]);
  assert.equal(payment(a).provider_reference, null);
  due(a);
  await sweep(fault);
  assert.equal(
    payment(a).provider_reference,
    fault.pending(reference(a)).transaction_id,
  );
  assert.equal(
    fault.requests.filter(({ method }) => method === "POST").length,
    1,
  );
  assert.equal(payment(a).status, "PENDING");
  assert.deepEqual(counts(a), empty);
});

test("only authenticated, matching QRIS observations can activate payment", async () => {
  const order = await charged();
  const pending = fixture.pending(reference(order));
  const requestCount = fixture.requests.length;
  await assert.rejects(
    handleMidtransNotification(
      {
        ...signedMidtrans(pending, key),
        signature_key: "0".repeat(128),
      },
      { fetcher: fixture.fetcher },
    ),
    { status: 401 },
  );
  for (const overrides of [
    { gross_amount: "1.00" },
    { merchant_id: "WRONG" },
    { currency: "USD" },
    { payment_type: "gopay" },
    { transaction_id: crypto.randomUUID() },
    { order_id: "WB-SB-" + crypto.randomUUID() },
    { transaction_status: "settlement", status_code: "201" },
  ]) {
    await assert.rejects(notify(pending, overrides), (error) =>
      [404, 422].includes(error.status),
    );
  }
  assert.equal(fixture.requests.length, requestCount);
  await assert.rejects(
    notify(pending, { transaction_status: "settlement", status_code: "200" }),
    { status: 503 },
  );
  await notify(pending);
  await assert.rejects(
    processTrustedProviderEvent({ trusted: true, provider: MIDTRANS_SANDBOX }),
    { status: 422 },
  );
  assert.equal(payment(order).status, "PENDING");
  assert.deepEqual(counts(order), empty);
  assert.ok(
    (await readMidtransQr(customer, order.id, { fetcher: fixture.fetcher }))
      .length > 8,
  );
  await assert.rejects(
    readMidtransQr(other, order.id, { fetcher: fixture.fetcher }),
    { status: 403 },
  );
  const wrongStatus = fixture.setStatus(reference(order), "settlement", {
    gross_amount: "1.00",
  });
  assert.equal((await notify(pending)).attention, true);
  assert.equal(caseFor(order).observed_amount, 1);
  assert.equal(payment(order).status, "PENDING");
  assert.equal(wrongStatus.status_code, "200");
});

test("signed QRIS notifications preserve the exact spelling of whole-rupiah amounts", async () => {
  const order = await charged();
  const pending = fixture.pending(reference(order));
  const callback = signedMidtrans(pending, key, {
    gross_amount: order.total + ".0",
  });
  const requestCount = fixture.requests.length;
  await assert.rejects(
    handleMidtransNotification(
      { ...callback, gross_amount: pending.gross_amount },
      { fetcher: fixture.fetcher },
    ),
    { status: 401 },
  );
  assert.equal(fixture.requests.length, requestCount);
  assert.equal(
    (await handleMidtransNotification(callback, { fetcher: fixture.fetcher }))
      .received,
    true,
  );
  assert.equal(payment(order).status, "PENDING");
  assert.deepEqual(counts(order), empty);

  const settled = fixture.setStatus(reference(order), "settlement");
  const overrides = { gross_amount: order.total + ".0000" };
  assert.equal((await notify(settled, overrides)).received, true);
  assert.equal((await notify(settled, overrides)).replayed, true);
  assert.equal(payment(order).status, "PAID");
  assert.deepEqual(counts(order), { ...empty, stock: 1, print: 1 });
  const evidence = database
    .prepare(
      "SELECT reported_status,observed_amount FROM midtrans_qris_callback_evidence WHERE payment_id=? ORDER BY reported_status",
    )
    .all(order.payment.id);
  assert.deepEqual(
    evidence.map(({ reported_status, observed_amount }) => [
      reported_status,
      observed_amount,
    ]),
    [
      ["pending", order.total],
      ["settlement", order.total],
    ],
  );
});

test("a valid signature does not make fractional rupiah or an unrelated reference valid", async () => {
  const order = await charged();
  const pending = fixture.pending(reference(order));
  const requestCount = fixture.requests.length;
  for (const overrides of [
    { gross_amount: order.total + ".0001" },
    { gross_amount: "1e4" },
    { order_id: "another-merchant-order" },
  ]) {
    await assert.rejects(notify(pending, overrides), { status: 422 });
  }
  assert.equal(fixture.requests.length, requestCount);
  assert.equal(payment(order).status, "PENDING");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM midtrans_qris_callback_evidence WHERE payment_id=?",
      )
      .get(order.payment.id).n,
    0,
  );
});

test("missing webhook and later out-of-order/replayed callbacks yield one set of effects", async () => {
  const order = await charged({
    addressId: pickup.id,
    fulfillmentType: "PICKUP",
  });
  const pending = fixture.pending(reference(order));
  const settled = fixture.setStatus(reference(order), "settlement");
  due(order);
  await sweep();
  assert.equal((await getPaymentStatus(customer, order.id)).status, "PAID");
  await notify(pending);
  await notify(settled);
  await notify(settled);
  database
    .prepare(
      "UPDATE payments SET paid_at=datetime('now','-2 minutes') WHERE order_id=?",
    )
    .run(order.id);
  await sweepPaidQrisAutoConfirm();
  await sweepPaidQrisAutoConfirm();
  const kitchen = { id: 5, role: "KITCHEN" };
  await updateStationStatus(kitchen, order.id, "PREPARING");
  await updateStationStatus(kitchen, order.id, "READY");
  await completePickupOrder(admin, order.id);
  await completePickupOrder(admin, order.id);
  assert.deepEqual(counts(order), {
    stock: 1,
    loyalty: 1,
    print: 1,
    fulfillment: 1,
  });
  assert.equal(
    database
      .prepare("SELECT COUNT(*) n FROM deliveries WHERE order_id=?")
      .get(order.id).n,
    0,
  );
  await assert.rejects(
    readMidtransQr(customer, order.id, { fetcher: fixture.fetcher }),
    { status: 404 },
  );
});

test("callback evidence survives a DB side-effect failure and independent retry repairs it once", async () => {
  const order = await charged();
  const settled = fixture.setStatus(reference(order), "settlement");
  database.exec(
    `CREATE TEMP TRIGGER fixture_db_fault BEFORE INSERT ON print_jobs WHEN NEW.order_id=${order.id} BEGIN SELECT RAISE(ABORT,'fixture write failure'); END;`,
  );
  try {
    await assert.rejects(notify(settled), /fixture write failure/);
    assert.equal(payment(order).status, "PENDING");
    assert.deepEqual(counts(order), empty);
    const evidence = database.prepare(
      "SELECT transaction_reference,observed_amount,settled_at,evidence_hash FROM midtrans_qris_callback_evidence WHERE payment_id=? AND reported_status='settlement'",
    ).get(order.payment.id);
    assert.equal(evidence.transaction_reference, settled.transaction_id);
    assert.equal(evidence.observed_amount, order.total);
    assert.ok(evidence.settled_at && evidence.evidence_hash.length === 64);
  } finally {
    database.exec("DROP TRIGGER fixture_db_fault");
  }
  due(order);
  await sweep();
  await notify(settled);
  assert.equal(payment(order).status, "PAID");
  assert.deepEqual(counts(order), { ...empty, stock: 1, print: 1 });
});

test("late verified settlement creates a durable Owner/Admin case without operational effects", async () => {
  const order = await charged();
  database
    .prepare(
      "UPDATE payments SET expires_at=datetime('now','-1 minute') WHERE order_id=?",
    )
    .run(order.id);
  const settled = fixture.setStatus(reference(order), "settlement");
  due(order);
  await sweep();
  await notify(settled);
  assert.equal(payment(order).status, "EXPIRED");
  assert.deepEqual(counts(order), empty);
  const attention = caseFor(order);
  assert.equal(attention.reason, "LATE_SETTLEMENT");
  assert.equal(attention.transaction_reference, settled.transaction_id);
  assert.equal(attention.observed_amount, order.total);
  assert.ok(attention.settled_at && attention.evidence_hash.length === 64);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) n FROM midtrans_qris_attention WHERE payment_id=?",
      )
      .get(order.payment.id).n,
    1,
  );
  await assert.rejects(getMidtransOperations(customer), { status: 403 });
  assert.ok(
    (await getMidtransOperations(admin)).cases.some(
      ({ id }) => id === attention.id,
    ),
  );
  await updateMidtransOperations(admin, {
    action: "review",
    caseId: attention.id,
  });
  await notify(settled);
  assert.equal(caseFor(order).reviewed_by, admin.id);
  assert.equal(
    (await getMidtransOperations(owner)).cases.some(
      ({ id }) => id === attention.id,
    ),
    false,
  );
});

test("provider expiry releases reservations and delayed pending cannot reopen payment", async () => {
  const order = await charged();
  const pending = fixture.pending(reference(order));
  await notify(fixture.setStatus(reference(order), "expire"));
  await notify(pending);
  assert.equal(payment(order).status, "EXPIRED");
  assert.deepEqual(counts(order), empty);
  assert.equal(
    database
      .prepare("SELECT status FROM stock_reservations WHERE order_id=?")
      .get(order.id).status,
    "RELEASED",
  );
});
