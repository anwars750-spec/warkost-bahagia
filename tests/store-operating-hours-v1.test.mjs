import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "store-hours-v1-"));
process.env.DATABASE_PATH = path.join(temp, "data.db");
process.env.PAYMENT_PROVIDER_MODE = "simulation";
process.env.PAYMENT_WEBHOOK_SECRET =
  "store-hours-payment-test-secret-more-than-32-characters";
process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED = "true";

const { db } = await import("../lib/db.mjs");
const { createOrder, changeStatus, sweepPaidQrisAutoConfirm } =
  await import("../lib/domain.mjs");
const {
  evaluateStoreOperatingHours,
  getStoreOperatingStatus,
  saveStoreOperatingHours,
  STORE_TIME_ZONE,
} = await import("../lib/store-operating-hours.mjs");
const { processTrustedProviderEvent } = await import("../lib/payments.mjs");
const { LOCAL_QRIS_PROVIDER } = await import("../lib/payment-provider.mjs");
const { CAPABILITIES, hasCapability } = await import("../lib/rbac.mjs");
const { publishActionRealtime, resetRealtimeForTests, subscribeRealtime } =
  await import("../lib/realtime.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Owner Hours','owner@hours.test','x','OWNER',1),
    (2,'Manager Hours','manager@hours.test','x','MANAGER',1),
    (3,'Admin Hours','admin@hours.test','x','ADMIN',1),
    (4,'Kitchen Hours','kitchen@hours.test','x','KITCHEN',1),
    (5,'Driver Hours','driver@hours.test','x','DRIVER',1),
    (6,'Customer Hours','customer@hours.test','x','CUSTOMER',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station)
  VALUES(1,1,'Menu Jam Operasional',18000,50,'KITCHEN');
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default)
  VALUES(1,6,'Rumah','Alamat pengujian jam operasional',0,0,1);
  INSERT OR REPLACE INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('delivery_free_km','3'),
    ('delivery_fee_per_km','2500'),
    ('delivery_max_km','10'),
    ('payment_expiry_minutes','15'),
    ('printer_simulation','true');
`);

const owner = { id: 1, role: "OWNER" };
const manager = { id: 2, role: "MANAGER" };
const admin = { id: 3, role: "ADMIN" };
const kitchen = { id: 4, role: "KITCHEN" };
const driver = { id: 5, role: "DRIVER" };
const customer = { id: 6, role: "CUSTOMER" };
const NOON_JAKARTA = Date.parse("2026-10-23T05:00:00Z");
const LATE_JAKARTA = Date.parse("2026-10-23T15:30:00Z");

async function configure(user, values = {}, nowMs = NOON_JAKARTA) {
  return saveStoreOperatingHours(
    user,
    {
      openTime: "08:00",
      closeTime: "22:00",
      manualStatus: "OPEN",
      closedReason: "",
      ...values,
    },
    { nowMs },
  );
}

async function order(method = "CASH", options = {}) {
  return createOrder(
    customer,
    {
      addressId: 1,
      method,
      items: [{ productId: 1, quantity: 1 }],
      ...(options.idempotencyKey
        ? { idempotencyKey: options.idempotencyKey }
        : {}),
    },
    { nowMs: options.nowMs ?? NOON_JAKARTA },
  );
}

test.after(() => {
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

test("Asia/Jakarta menentukan effective OPEN/CLOSED dari waktu server", async () => {
  assert.equal(STORE_TIME_ZONE, "Asia/Jakarta");
  const open = evaluateStoreOperatingHours(
    {
      openTime: "08:00",
      closeTime: "22:00",
      manualStatus: "OPEN",
      closedReason: "",
    },
    { nowMs: NOON_JAKARTA },
  );
  assert.equal(open.isOpen, true);
  assert.equal(open.effectiveStatus, "OPEN");

  const closed = evaluateStoreOperatingHours(open, {
    nowMs: LATE_JAKARTA,
  });
  assert.equal(closed.isOpen, false);
  assert.equal(closed.effectiveStatus, "CLOSED");
  assert.equal(closed.nextOpenTime, "08:00");

  await configure(owner);
  const endpoint = await getStoreOperatingStatus({ nowMs: NOON_JAKARTA });
  assert.equal(endpoint.isOpen, true);
  assert.equal(endpoint.timeZone, "Asia/Jakarta");
  assert.equal(endpoint.openTime, "08:00");
  assert.equal(endpoint.closeTime, "22:00");
});

test("Owner dan Manager dapat update; role lain ditolak dan audit tercatat", async () => {
  const auditBefore = database
    .prepare(
      "SELECT COUNT(*) count FROM audit_logs WHERE action='STORE_OPERATING_HOURS_UPDATED'",
    )
    .get().count;
  assert.equal(hasCapability("OWNER", CAPABILITIES.STORE_HOURS_WRITE), true);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.STORE_HOURS_WRITE), true);
  for (const role of ["ADMIN", "KITCHEN", "DRIVER", "CUSTOMER"])
    assert.equal(hasCapability(role, CAPABILITIES.STORE_HOURS_WRITE), false);

  await configure(owner, { openTime: "07:30", closeTime: "21:30" });
  await configure(manager, { openTime: "08:00", closeTime: "22:00" });
  for (const user of [admin, kitchen, driver, customer])
    await assert.rejects(
      configure(user),
      (error) => error.status === 403 && /Akses ditolak/.test(error.message),
    );
  await assert.rejects(
    configure(null),
    (error) => error.status === 401 && /masuk/.test(error.message),
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action='STORE_OPERATING_HOURS_UPDATED'",
      )
      .get().count,
    auditBefore + 2,
  );
});

test("konfigurasi waktu/status invalid ditolak", async () => {
  for (const invalid of [
    { openTime: "8:00" },
    { closeTime: "24:00" },
    { openTime: "08:00", closeTime: "08:00" },
    { manualStatus: "FORCED_OPEN" },
    { closedReason: "x".repeat(121) },
  ])
    await assert.rejects(
      configure(owner, invalid),
      (error) => error.status === 422 && /tidak valid/.test(error.message),
    );
});

test("dalam jam buka + OPEN createOrder berhasil; luar jam dan manual CLOSED ditolak", async () => {
  await configure(owner);
  const created = await order("CASH");
  assert.ok(created.id > 0);

  await assert.rejects(
    order("CASH", { nowMs: LATE_JAKARTA }),
    (error) =>
      error.status === 409 &&
      /sedang tutup/.test(error.message) &&
      /08:00/.test(error.message),
  );

  await configure(owner, {
    manualStatus: "CLOSED",
    closedReason: "Persiapan operasional",
  });
  await assert.rejects(
    order("CASH"),
    (error) =>
      error.status === 409 && /Persiapan operasional/.test(error.message),
  );
});

test("retry idempotent dan order existing tetap diproses setelah toko CLOSED", async () => {
  await configure(owner);
  const idempotencyKey = crypto.randomUUID();
  const created = await order("CASH", { idempotencyKey });
  await configure(manager, {
    manualStatus: "CLOSED",
    closedReason: "Tutup sementara",
  });

  const replay = await order("CASH", { idempotencyKey });
  assert.equal(replay.id, created.id);
  assert.equal(replay.replayed, true);
  const confirmed = await changeStatus(admin, created.id, "CONFIRMED");
  assert.equal(confirmed.status, "CONFIRMED");
});

test("QRIS PAID existing tetap auto-confirm setelah toko CLOSED", async () => {
  await configure(owner);
  const created = await order("QRIS");
  await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: "evt-store-hours-paid-1",
    transactionReference: created.payment.transaction_reference,
    providerReference: created.payment.provider_reference,
    status: "PAID",
    payloadHash: "store-hours-paid-hash-1",
  });
  database
    .prepare("UPDATE payments SET paid_at=? WHERE order_id=?")
    .run("2026-10-23 04:58:00", created.id);
  await configure(owner, { manualStatus: "CLOSED" });

  const result = await sweepPaidQrisAutoConfirm({ nowMs: NOON_JAKARTA });
  assert.equal(result.count, 1);
  assert.equal(result.confirmed[0].id, created.id);
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id=?").get(created.id)
      .status,
    "CONFIRMED",
  );
  assert.equal(
    database
      .prepare("SELECT status FROM payments WHERE order_id=?")
      .get(created.id).status,
    "PAID",
  );
});

test("perubahan status memakai realtime existing untuk seluruh role", async () => {
  resetRealtimeForTests();
  const received = new Map();
  for (const user of [owner, manager, admin, kitchen, driver, customer]) {
    received.set(user.role, []);
    subscribeRealtime(user, (event) => received.get(user.role).push(event));
  }
  const status = await configure(manager);
  await publishActionRealtime("store-hours", manager, {}, status);
  for (const events of received.values()) {
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "STORE_STATUS_CHANGED");
    assert.equal(events[0].payload.effectiveStatus, "OPEN");
  }
});

test("route, Customer UI, Owner/Manager UI, dan migration terhubung", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = fs.readFileSync(
    path.join(root, "app/api/[action]/route.js"),
    "utf8",
  );
  const page = fs.readFileSync(path.join(root, "app/page.js"), "utf8");
  const managerUi = fs.readFileSync(
    path.join(root, "app/ManagerControlCenter.js"),
    "utf8",
  );
  const ownerUi = fs.readFileSync(
    path.join(root, "app/OwnerSettingsCenter.js"),
    "utf8",
  );
  const migration = fs.readFileSync(
    path.join(root, "migrations/030_store_operating_hours_v1.sql"),
    "utf8",
  );
  assert.match(route, /action === "store-hours"[\s\S]*getStoreOperatingStatus/);
  assert.match(route, /action === "store-hours"[\s\S]*saveStoreOperatingHours/);
  assert.match(page, /customer-store-status/);
  assert.match(page, /storeStatus\?\.isOpen !== true/);
  assert.match(managerUi, /StoreOperatingHoursPanel/);
  assert.match(ownerUi, /StoreOperatingHoursPanel/);
  assert.match(migration, /store_open_time/);
  assert.match(migration, /store_manual_status/);
});
