import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "driver-contact-final-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const { listDriverOrders } = await import("../lib/domain.mjs");
const { customerWhatsAppUrl, normalizeCustomerWhatsApp } =
  await import("../lib/customer-contact.mjs");

const database = db();
const driverA = { id: 1, role: "DRIVER" };
const driverB = { id: 2, role: "DRIVER" };

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,phone,active) VALUES
    (1,'Driver A','driver-a@contact.test','x','DRIVER','08110000001',1),
    (2,'Driver B','driver-b@contact.test','x','DRIVER','08110000002',1),
    (3,'Customer A','customer-a@contact.test','x','CUSTOMER','08123456789',1),
    (4,'Customer B','customer-b@contact.test','x','CUSTOMER','+628777777777',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,3,'Rumah A','Alamat customer A untuk pengantaran'),
    (2,4,'Rumah B','Alamat customer B untuk pengantaran');
  INSERT INTO orders(id,customer_id,address_id,status,subtotal,total) VALUES
    (1,3,1,'ASSIGNED',20000,20000),
    (2,4,2,'ASSIGNED',25000,25000),
    (3,4,2,'READY',15000,15000);
  INSERT INTO payments(order_id,method,status,amount) VALUES
    (1,'CASH','UNPAID',20000),
    (2,'QRIS','PAID',25000),
    (3,'CASH','UNPAID',15000);
  INSERT INTO deliveries(order_id,driver_id,accepted_at) VALUES
    (1,1,CURRENT_TIMESTAMP),(2,2,CURRENT_TIMESTAMP);
`);

test("nomor WhatsApp Indonesia dinormalisasi dan pesan membawa konteks order", () => {
  assert.equal(normalizeCustomerWhatsApp("08123456789"), "628123456789");
  assert.equal(normalizeCustomerWhatsApp("+628123456789"), "628123456789");
  assert.equal(normalizeCustomerWhatsApp("nomor tidak ada"), "");
  const url = customerWhatsAppUrl("08123456789", 7);
  assert.match(url, /^https:\/\/wa\.me\/628123456789\?text=/);
  assert.match(decodeURIComponent(url), /WB000007/);
  assert.equal(customerWhatsAppUrl("", 7), "");
});

test("nomor customer hanya tampil pada order aktif milik Driver terkait", async () => {
  const ordersA = await listDriverOrders(driverA);
  const assignedA = ordersA.find((order) => order.id === 1);
  const ready = ordersA.find((order) => order.id === 3);
  assert.equal(assignedA.customer_phone, "08123456789");
  assert.equal(ready.customer_phone, null);
  assert.equal(
    ordersA.some((order) => order.id === 2),
    false,
  );

  const ordersB = await listDriverOrders(driverB);
  assert.equal(
    ordersB.find((order) => order.id === 2).customer_phone,
    "+628777777777",
  );

  database.prepare("UPDATE orders SET status='DELIVERED' WHERE id=1").run();
  assert.equal(
    (await listDriverOrders(driverA)).find((order) => order.id === 1)
      .customer_phone,
    null,
  );
});

test("UI Driver memakai logo valid, chat existing, dan aksi delivery tetap ada", () => {
  const page = fs.readFileSync(path.resolve("app/page.js"), "utf8");
  const driver = fs.readFileSync(
    path.resolve("app/DriverControlCenter.js"),
    "utf8",
  );
  const chat = fs.readFileSync(path.resolve("app/ConversationChat.js"), "utf8");
  const css = fs.readFileSync(
    path.resolve("app/driver-communication.css"),
    "utf8",
  );
  assert.match(page, /src="\/warkost-bahagia-logo-clean\.png"/);
  assert.doesNotMatch(page, /\/logo-warkost\.png/);
  assert.match(page, /type: "CUSTOMER_DRIVER", orderId/);
  assert.match(page, /viewerRole=\{role\}/);
  assert.match(page, /KOMUNIKASI PENGANTARAN/);
  assert.match(page, /KOMUNIKASI CUSTOMER/);
  assert.match(chat, /driverViewer[\s\S]*conversation\?\.customer\?\.name/);
  assert.match(chat, /chat-open/);
  assert.match(chat, /chat-message/);
  assert.match(page, /Terima tugas/);
  assert.match(page, /Sudah diambil · Pickup/);
  assert.match(page, /Mulai pengantaran/);
  assert.match(page, /Selesaikan pengantaran/);
  assert.match(driver, /onClick=\{\(\) => onChat\?\.\(order\.id\)\}/);
  assert.match(driver, /\{whatsappUrl \? \(/);
  assert.match(driver, /href=\{whatsappUrl\}/);
  assert.doesNotMatch(driver, /Hubungi customer lebih cepat/);
  assert.doesNotMatch(
    driver,
    /\{whatsapp \? \([\s\S]*href=\{whatsapp\}[\s\S]*driver-v2-order-actions/,
  );
  assert.match(
    driver,
    /\["home", "home", "Beranda"\][\s\S]*\["deliveries", "delivery", "Antar"\][\s\S]*\["cod", "wallet", "COD"\][\s\S]*\["history", "history", "Riwayat"\][\s\S]*\["account", "user", "Akun"\]/,
  );
  assert.match(css, /object-fit: contain/);
  assert.match(
    css,
    /\.driver-v2-order-communication-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.doesNotMatch(css, /object-position:\s*-/);
});
