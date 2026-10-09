import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "communications-test-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const {
  CONVERSATION_STATUSES,
  CONVERSATION_TYPES,
  getConversation,
  listAdminConversations,
  openConversation,
  sendConversationMessage,
  updateConversationStatus,
} = await import("../lib/communications.mjs");
const {
  orderStatusLabel,
  paymentGuidance,
  paymentMethodLabel,
  paymentStatusLabel,
} = await import("../app/conversationDisplay.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin Satu','admin1@chat.test','x','ADMIN',1),
    (2,'Admin Dua','admin2@chat.test','x','ADMIN',1),
    (3,'Customer Satu','customer1@chat.test','x','CUSTOMER',1),
    (4,'Customer Dua','customer2@chat.test','x','CUSTOMER',1),
    (5,'Driver Satu','driver1@chat.test','x','DRIVER',1),
    (6,'Driver Dua','driver2@chat.test','x','DRIVER',1),
    (7,'Kitchen','kitchen@chat.test','x','KITCHEN',1),
    (8,'Manager','manager@chat.test','x','MANAGER',1);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (1,3,'Rumah','Jl. Chat Customer Satu'),
    (2,4,'Rumah','Jl. Chat Customer Dua');
`);

const admin = { id: 1, role: "ADMIN" };
const secondAdmin = { id: 2, role: "ADMIN" };
const customer = { id: 3, role: "CUSTOMER" };
const otherCustomer = { id: 4, role: "CUSTOMER" };
const assignedDriver = { id: 5, role: "DRIVER" };
const unrelatedDriver = { id: 6, role: "DRIVER" };
const kitchen = { id: 7, role: "KITCHEN" };
const manager = { id: 8, role: "MANAGER" };

function createOrder({
  customerId = 3,
  status = "PENDING",
  driverId = null,
  method = "CASH",
  paymentStatus = "UNPAID",
  total = 42000,
} = {}) {
  const result = database
    .prepare(
      "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(?,?,?,?,?)",
    )
    .run(customerId, customerId === 3 ? 1 : 2, status, total, total);
  const orderId = Number(result.lastInsertRowid);
  database
    .prepare(
      "INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,?,?)",
    )
    .run(orderId, method, paymentStatus, total);
  if (driverId)
    database
      .prepare(
        "INSERT INTO deliveries(order_id,driver_id,accepted_at) VALUES(?,?,CURRENT_TIMESTAMP)",
      )
      .run(orderId, driverId);
  return orderId;
}

const adminOrderId = createOrder({ status: "PREPARING" });
let adminConversationId;

test("Customer membuka satu thread Admin per order dan mengirim pesan persisten", async () => {
  const opened = await openConversation(customer, {
    type: CONVERSATION_TYPES.ADMIN,
    orderId: adminOrderId,
  });
  const duplicate = await openConversation(customer, {
    type: CONVERSATION_TYPES.ADMIN,
    orderId: adminOrderId,
  });
  adminConversationId = opened.id;
  assert.equal(duplicate.id, opened.id);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM conversations WHERE order_id=?")
      .get(adminOrderId).count,
    1,
  );

  await sendConversationMessage(customer, {
    conversationId: opened.id,
    message: "Pesanan saya sudah diproses sampai mana?",
  });
  const persisted = database
    .prepare(
      "SELECT message,sender_role FROM conversation_messages WHERE conversation_id=?",
    )
    .get(opened.id);
  assert.equal(persisted.message, "Pesanan saya sudah diproses sampai mana?");
  assert.equal(persisted.sender_role, "CUSTOMER");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id IN (1,2) AND message LIKE '%Customer Service%'",
      )
      .get().count,
    2,
  );
});

test("Admin inbox menerima unread, membaca konteks order, lalu membalas Customer", async () => {
  let inbox = await listAdminConversations(admin, { filter: "unread" });
  assert.equal(inbox.conversations.length, 1);
  assert.equal(inbox.conversations[0].unread_count, 1);
  assert.equal(inbox.conversations[0].order_id, adminOrderId);
  assert.equal(inbox.conversations[0].customer_name, "Customer Satu");

  const detail = await getConversation(admin, adminConversationId);
  assert.equal(
    detail.order.display_number,
    `WB${String(adminOrderId).padStart(6, "0")}`,
  );
  assert.equal(detail.order.status, "PREPARING");
  assert.equal(detail.order.payment_status, "UNPAID");
  assert.equal(detail.order.total, 42000);
  assert.equal(detail.order.address, "Jl. Chat Customer Satu");
  assert.equal(detail.messages.length, 1);

  inbox = await listAdminConversations(admin, { filter: "unread" });
  assert.equal(inbox.conversations.length, 0);
  await sendConversationMessage(admin, {
    conversationId: adminConversationId,
    message: "Pesanan sedang kami proses.",
  });
  const customerDetail = await getConversation(customer, adminConversationId);
  assert.equal(customerDetail.messages.length, 2);
  assert.equal(customerDetail.messages.at(-1).sender_role, "ADMIN");
  assert.equal(
    customerDetail.messages.at(-1).message,
    "Pesanan sedang kami proses.",
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=3 AND message LIKE 'Admin membalas%'",
      )
      .get().count,
    1,
  );
});

test("unread tidak diduplikasi polling dan status ditangani/selesai/buka kembali bekerja", async () => {
  const before = database
    .prepare("SELECT COUNT(*) count FROM notifications")
    .get().count;
  await getConversation(customer, adminConversationId);
  await getConversation(customer, adminConversationId);
  await listAdminConversations(admin);
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM notifications").get().count,
    before,
  );

  let updated = await updateConversationStatus(
    admin,
    adminConversationId,
    CONVERSATION_STATUSES.HANDLED,
  );
  assert.equal(updated.status, "HANDLED");
  updated = await updateConversationStatus(
    admin,
    adminConversationId,
    CONVERSATION_STATUSES.CLOSED,
  );
  assert.equal(updated.status, "CLOSED");
  assert.ok(updated.closed_at);
  await assert.rejects(
    sendConversationMessage(customer, {
      conversationId: adminConversationId,
      message: "Pesan sesudah selesai",
    }),
    (error) => error.status === 409,
  );
  updated = await updateConversationStatus(
    admin,
    adminConversationId,
    CONVERSATION_STATUSES.OPEN,
  );
  assert.equal(updated.status, "OPEN");
  assert.equal(updated.closed_at, null);
});

test("Customer lain dan role di luar percakapan ditolak server-side", async () => {
  await assert.rejects(
    getConversation(otherCustomer, adminConversationId),
    (error) => error.status === 404,
  );
  for (const actor of [assignedDriver, unrelatedDriver, kitchen, manager])
    await assert.rejects(
      getConversation(actor, adminConversationId),
      (error) => error.status === 403,
    );
  await assert.rejects(
    getConversation(null, adminConversationId),
    (error) => error.status === 401,
  );
  await assert.rejects(
    listAdminConversations(secondAdmin, { filter: "invalid" }),
    /Filter percakapan tidak valid/,
  );
});

test("Customer tidak dapat membuka chat Driver sebelum assignment", async () => {
  const orderId = createOrder({ status: "READY" });
  await assert.rejects(
    openConversation(customer, {
      type: CONVERSATION_TYPES.DRIVER,
      orderId,
    }),
    (error) => error.status === 409 && /belum ditugaskan/.test(error.message),
  );
});

test("assigned Driver dan Customer berbagi satu thread delivery, Driver lain ditolak", async () => {
  const orderId = createOrder({ status: "ASSIGNED", driverId: 5 });
  const customerThread = await openConversation(customer, {
    type: CONVERSATION_TYPES.DRIVER,
    orderId,
  });
  const driverThread = await openConversation(assignedDriver, {
    type: CONVERSATION_TYPES.DRIVER,
    orderId,
  });
  assert.equal(customerThread.id, driverThread.id);
  await sendConversationMessage(customer, {
    conversationId: customerThread.id,
    message: "Patokan rumah saya dekat minimarket.",
  });
  const driverDetail = await getConversation(assignedDriver, customerThread.id);
  assert.equal(
    driverDetail.messages.at(-1).message,
    "Patokan rumah saya dekat minimarket.",
  );
  await sendConversationMessage(assignedDriver, {
    conversationId: customerThread.id,
    message: "Baik, saya menuju lokasi.",
  });
  const customerDetail = await getConversation(customer, customerThread.id);
  assert.equal(
    customerDetail.messages.at(-1).message,
    "Baik, saya menuju lokasi.",
  );

  await assert.rejects(
    getConversation(unrelatedDriver, customerThread.id),
    (error) => error.status === 403,
  );
  await assert.rejects(
    openConversation(unrelatedDriver, {
      type: CONVERSATION_TYPES.DRIVER,
      orderId,
    }),
    (error) => error.status === 403,
  );

  database
    .prepare("UPDATE orders SET status='DELIVERED' WHERE id=?")
    .run(orderId);
  const history = await getConversation(assignedDriver, customerThread.id);
  assert.equal(history.can_send, false);
  assert.equal(history.messages.length, 2);
  await assert.rejects(
    sendConversationMessage(assignedDriver, {
      conversationId: customerThread.id,
      message: "Pesan terlambat",
    }),
    (error) => error.status === 409 && /hanya dapat dibaca/.test(error.message),
  );
});

test("Admin tidak dapat membaca chat Driver dan API contract terhubung", async () => {
  const driverConversation = database
    .prepare(
      "SELECT id FROM conversations WHERE type='CUSTOMER_DRIVER' LIMIT 1",
    )
    .get();
  await assert.rejects(
    getConversation(admin, Number(driverConversation.id)),
    (error) => error.status === 403,
  );
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/[action]/route.js"),
    "utf8",
  );
  for (const action of [
    "chat-open",
    "chat-message",
    "chat-status",
    "chat-inbox",
  ])
    assert.match(route, new RegExp(action));
});

test("UI menghubungkan Customer, Admin, dan Driver ke chat React nyata", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "app/page.js"), "utf8");
  const customerChat = fs.readFileSync(
    path.join(process.cwd(), "app/ConversationChat.js"),
    "utf8",
  );
  const adminChat = fs.readFileSync(
    path.join(process.cwd(), "app/AdminCustomerService.js"),
    "utf8",
  );
  const enhancer = fs.readFileSync(
    path.join(process.cwd(), "app/AdminCustomersEnhancer.js"),
    "utf8",
  );
  assert.match(page, /Chat dengan Admin/);
  assert.match(page, /Chat dengan Driver/);
  assert.match(page, /Chat Customer/);
  assert.match(page, /<ConversationChat/);
  assert.match(page, /<AdminCustomerService/);
  assert.doesNotMatch(page, /<AdminCustomerServiceMobileEnhancer/);
  assert.match(customerChat, /chat-open/);
  assert.match(customerChat, /chat-message/);
  assert.match(customerChat, /setInterval/);
  assert.doesNotMatch(customerChat, /MutationObserver/);
  assert.match(adminChat, /Semua/);
  assert.match(adminChat, /Belum dibaca/);
  assert.match(adminChat, /Tandai ditangani/);
  assert.match(adminChat, /Selesaikan percakapan/);
  assert.match(adminChat, /Buka kembali/);
  assert.doesNotMatch(adminChat, /MutationObserver/);
  assert.match(enhancer, /warkost:open-admin-customer-service/);
});

test("Customer Chat memetakan metode dan status pembayaran ke label operasional", () => {
  for (const method of ["cash", "COD", "cash_on_delivery"])
    assert.equal(paymentMethodLabel(method), "COD");
  assert.equal(paymentMethodLabel("qris"), "QRIS");
  for (const method of ["transfer", "bank_transfer", "transfer_bank"])
    assert.equal(paymentMethodLabel(method), "TRANSFER BANK");

  assert.equal(paymentStatusLabel("PAID"), "LUNAS");
  assert.equal(paymentStatusLabel("UNPAID"), "BELUM DIBAYAR");
  assert.equal(paymentStatusLabel("PENDING"), "MENUNGGU PEMBAYARAN");
  assert.equal(orderStatusLabel("ON_DELIVERY"), "DALAM PENGANTARAN");

  assert.equal(paymentGuidance("CASH", "UNPAID"), "Driver menagih tunai");
  assert.equal(
    paymentGuidance("QRIS", "PAID"),
    "Tidak perlu menagih tunai",
  );
  assert.equal(
    paymentGuidance("BANK_TRANSFER", "PAID"),
    "Tidak perlu menagih tunai",
  );
});

test("Customer Chat memakai ikon SVG dan sumber ASCII-safe tanpa mojibake", () => {
  const customerChat = fs.readFileSync(
    path.join(process.cwd(), "app/ConversationChat.js"),
    "utf8",
  );
  const customerStyles = fs.readFileSync(
    path.join(process.cwd(), "app/communication.css"),
    "utf8",
  );
  const displayMapping = fs.readFileSync(
    path.join(process.cwd(), "app/conversationDisplay.mjs"),
    "utf8",
  );
  const combined = `${customerChat}\n${customerStyles}\n${displayMapping}`;

  assert.match(customerChat, /const BackIcon/);
  assert.match(customerChat, /const CloseIcon/);
  assert.match(customerChat, /const ChatIcon/);
  assert.match(customerChat, /METODE BAYAR/);
  assert.match(
    customerStyles,
    /grid-template-columns: 42px 46px minmax\(0, 1fr\) 42px/,
  );
  assert.match(customerStyles, /@media \(max-width: 760px\)/);
  assert.match(
    customerStyles,
    /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.doesNotMatch(
    customerStyles,
    /\.conversation-header > button,\s*\.admin-service-global-head/,
  );
  assert.doesNotMatch(combined, /[^\x00-\x7F]/);
  assert.doesNotMatch(combined, /(?:Ã|Â|â|ð|�)/);
});
