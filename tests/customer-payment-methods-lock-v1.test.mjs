import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "payment-method-lock-test-")),
  "test.db",
);
process.env.SESSION_SECRET =
  "payment-method-lock-session-secret-over-32-characters";
process.env.PAYMENT_PROVIDER_MODE = "simulation";

const { db } = await import("../lib/db.mjs");
const { createOrder } = await import("../lib/domain.mjs");

const database = db();
const customer = { id: 2, role: "CUSTOMER" };

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active)
  VALUES(2,'Customer Payment','customer-payment@test.local','x','CUSTOMER',1);
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,stock_quantity)
  VALUES(1,1,'Menu Payment',20000,10);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude)
  VALUES(1,2,'Rumah','Alamat payment test',0,0);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','0'),
    ('business_longitude','0'),
    ('printer_simulation','true');
`);

const input = (method) => ({
  addressId: 1,
  method,
  items: [{ productId: 1, quantity: 1 }],
});

test("CASH tetap diterima dan menjadi COD belum dibayar", async () => {
  const order = await createOrder(customer, input("CASH"));
  assert.equal(order.payment.method, "CASH");
  assert.equal(order.payment.status, "UNPAID");
});

test("QRIS tetap mengikuti validasi provider existing", async () => {
  delete process.env.PAYMENT_PROVIDER_MODE;
  await assert.rejects(
    createOrder(customer, input("QRIS")),
    (error) =>
      error.status === 503 && /Provider QRIS/.test(error.message),
  );

  process.env.PAYMENT_PROVIDER_MODE = "simulation";
  const order = await createOrder(customer, input("QRIS"));
  assert.equal(order.payment.method, "QRIS");
  assert.equal(order.payment.status, "PENDING");
  assert.match(order.payment.qr_payload, /^WARKOST-LOCAL-QRIS\|/);
});

test("BANK_TRANSFER dan metode arbitrary ditolak server sebelum order dibuat", async () => {
  const before = database.prepare("SELECT COUNT(*) count FROM orders").get()
    .count;

  await assert.rejects(
    createOrder(customer, input("BANK_TRANSFER")),
    (error) =>
      error.status === 422 &&
      error.message === "Metode Transfer Bank belum tersedia",
  );
  await assert.rejects(
    createOrder(customer, input("CRYPTO")),
    (error) =>
      error.status === 400 && error.message === "Metode pembayaran tidak valid",
  );

  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM orders").get().count,
    before,
  );
});

test("UI mempertahankan COD dan QRIS selectable serta menonaktifkan Transfer Bank", () => {
  const page = fs.readFileSync(
    fileURLToPath(new URL("../app/page.js", import.meta.url)),
    "utf8",
  );
  const styles = fs.readFileSync(
    fileURLToPath(new URL("../app/style.css", import.meta.url)),
    "utf8",
  );

  assert.match(page, /useState\("CASH"\)/);
  assert.match(page, /value: "CASH",\s+label: "COD"/);
  assert.match(page, /value: "QRIS",\s+label: "QRIS"/);
  assert.match(
    page,
    /value: "BANK_TRANSFER",[\s\S]*?availability: "Segera hadir",\s+disabled: true/,
  );
  assert.match(page, /disabled=\{method\.disabled\}/);
  assert.match(styles, /\.payment-method-option\.disabled\s*\{/);
});
