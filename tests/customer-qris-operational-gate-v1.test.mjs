import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "qris-order-gate-test-")),
  "test.db",
);
process.env.SESSION_SECRET = "qris-order-gate-session-secret-over-32-characters";
process.env.DEPLOYMENT_ENV = "demo";
process.env.PAYMENT_PROVIDER_MODE = "simulation";

const { db } = await import("../lib/db.mjs");
const { createOrder } = await import("../lib/domain.mjs");
const { processTrustedProviderEvent } = await import("../lib/payments.mjs");
const { LOCAL_QRIS_PROVIDER } = await import("../lib/payment-provider.mjs");

const database = db();
const customer = { id: 2, role: "CUSTOMER" };

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active)
  VALUES
    (1,'Admin QRIS','admin-qris@test.local','x','ADMIN',1),
    (2,'Customer QRIS','customer-qris@test.local','x','CUSTOMER',1),
    (3,'Kitchen QRIS','kitchen-qris@test.local','x','KITCHEN',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station)
  VALUES(1,1,'Menu QRIS Gate',20000,10,'KITCHEN');
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude)
  VALUES(1,2,'Rumah','Alamat QRIS gate',0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('printer_simulation','true');
`);

test("QRIS pending tercatat tetapi belum masuk operasional sampai PAID", async () => {
  const order = await createOrder(customer, {
    addressId: 1,
    method: "QRIS",
    items: [{ productId: 1, quantity: 1 }],
  });

  assert.equal(order.payment.status, "PENDING");
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id=?").get(order.id).status,
    "PENDING",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM stock_movements WHERE order_id=?").get(order.id).count,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM order_stations WHERE order_id=?").get(order.id).count,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?").get(order.id).count,
    0,
  );
  assert.equal(
    database.prepare("SELECT status FROM stock_reservations WHERE order_id=?").get(order.id).status,
    "RESERVED",
  );

  await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: "qris-order-gate-paid-1",
    transactionReference: order.payment.transaction_reference,
    providerReference: order.payment.provider_reference,
    status: "PAID",
    payloadHash: "qris-order-gate-paid-payload",
  });

  assert.equal(
    database.prepare("SELECT status FROM payments WHERE order_id=?").get(order.id).status,
    "PAID",
  );
  assert.ok(
    database.prepare("SELECT COUNT(*) count FROM stock_movements WHERE order_id=?").get(order.id).count > 0,
  );
  assert.ok(
    database.prepare("SELECT COUNT(*) count FROM order_stations WHERE order_id=?").get(order.id).count > 0,
  );
  assert.ok(
    database.prepare("SELECT COUNT(*) count FROM print_jobs WHERE order_id=?").get(order.id).count > 0,
  );
  assert.equal(
    database.prepare("SELECT status FROM stock_reservations WHERE order_id=?").get(order.id).status,
    "COMMITTED",
  );
});

test("endpoint operasional memfilter QRIS belum PAID tanpa menyembunyikannya dari customer", () => {
  const ordersRoute = fs.readFileSync(
    fileURLToPath(new URL("../app/api/orders/route.js", import.meta.url)),
    "utf8",
  );
  const dashboardRoute = fs.readFileSync(
    fileURLToPath(new URL("../app/api/dashboard/route.js", import.meta.url)),
    "utf8",
  );
  const notificationsRoute = fs.readFileSync(
    fileURLToPath(new URL("../app/api/notifications/route.js", import.meta.url)),
    "utf8",
  );

  assert.match(ordersRoute, /WHERE \(p\.method!='QRIS' OR p\.status='PAID'\)/);
  assert.match(ordersRoute, /WHERE o\.customer_id=\?/);
  assert.match(dashboardRoute, /\(p\.method!='QRIS' OR p\.status='PAID'\)/);
  assert.match(notificationsRoute, /payment\?\.method === "QRIS" && payment\.status !== "PAID"/);
});
