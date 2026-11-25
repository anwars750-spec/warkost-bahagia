import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-chat-ringtone-"));
process.env.DATABASE_PATH = path.join(temp, "data.db");
process.env.SESSION_SECRET = "chat-ringtone-test-session-secret-32-bytes";

const {
  publishActionRealtime,
  resetRealtimeForTests,
  subscribeRealtime,
} = await import("../lib/realtime.mjs");
const { db } = await import("../lib/db.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (101,'Admin Chat Satu','admin-chat-1@test.local','x','ADMIN',1),
    (102,'Admin Chat Dua','admin-chat-2@test.local','x','ADMIN',1),
    (103,'Customer Chat','customer-chat@test.local','x','CUSTOMER',1),
    (104,'Driver Chat','driver-chat@test.local','x','DRIVER',1),
    (105,'Admin Nonaktif','admin-chat-off@test.local','x','ADMIN',0);
  INSERT INTO addresses(id,user_id,label,detail) VALUES
    (201,103,'Rumah','Jl. Chat Realtime');
  INSERT INTO orders(id,customer_id,address_id,status,subtotal,total) VALUES
    (301,103,201,'ON_DELIVERY',50000,50000);
  INSERT INTO deliveries(id,order_id,driver_id,accepted_at) VALUES
    (302,301,104,CURRENT_TIMESTAMP);
  INSERT INTO conversations(id,thread_key,type,customer_id,order_id,driver_id,status) VALUES
    (401,'support-order-301','CUSTOMER_ADMIN',103,301,NULL,'OPEN'),
    (402,'driver-order-301','CUSTOMER_DRIVER',103,301,104,'OPEN');
`);

const adminOne = { id: 101, role: "ADMIN" };
const adminTwo = { id: 102, role: "ADMIN" };
const customer = { id: 103, role: "CUSTOMER" };
const driver = { id: 104, role: "DRIVER" };
const inactiveAdmin = { id: 105, role: "ADMIN" };

function setupSubscribers() {
  resetRealtimeForTests();
  const received = {
    adminOne: [],
    adminTwo: [],
    customer: [],
    driver: [],
    inactiveAdmin: [],
  };
  subscribeRealtime(adminOne, (event) => received.adminOne.push(event));
  subscribeRealtime(adminTwo, (event) => received.adminTwo.push(event));
  subscribeRealtime(customer, (event) => received.customer.push(event));
  subscribeRealtime(driver, (event) => received.driver.push(event));
  subscribeRealtime(inactiveAdmin, (event) => received.inactiveAdmin.push(event));
  return received;
}

function onlyEvent(events) {
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "CONVERSATION_CHANGED");
  return events[0];
}

test.after(() => {
  try {
    database.close();
  } catch {}
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("Customer -> Admin: hanya Admin aktif menerima ringtone chat", async () => {
  const received = setupSubscribers();
  await publishActionRealtime(
    "chat-message",
    customer,
    { conversationId: 401 },
    {},
  );

  assert.equal(onlyEvent(received.adminOne).audible, true);
  assert.equal(onlyEvent(received.adminTwo).audible, true);
  assert.equal(onlyEvent(received.customer).audible, false);
  assert.equal(received.driver.length, 0);
  assert.equal(received.inactiveAdmin.length, 0);
});

test("Admin -> Customer: Customer menerima ringtone, Admin lain tidak ikut berbunyi", async () => {
  const received = setupSubscribers();
  await publishActionRealtime(
    "chat-message",
    adminOne,
    { conversationId: 401 },
    {},
  );

  assert.equal(onlyEvent(received.customer).audible, true);
  assert.equal(onlyEvent(received.adminOne).audible, false);
  assert.equal(onlyEvent(received.adminTwo).audible, false);
  assert.equal(received.driver.length, 0);
});

test("Customer -> Driver: hanya Driver penerima yang mendapat ringtone chat", async () => {
  const received = setupSubscribers();
  await publishActionRealtime(
    "chat-message",
    customer,
    { conversationId: 402 },
    {},
  );

  assert.equal(onlyEvent(received.driver).audible, true);
  assert.equal(onlyEvent(received.customer).audible, false);
  assert.equal(received.adminOne.length, 0);
  assert.equal(received.adminTwo.length, 0);
});

test("Driver -> Customer: hanya Customer penerima yang mendapat ringtone chat", async () => {
  const received = setupSubscribers();
  await publishActionRealtime(
    "chat-message",
    driver,
    { conversationId: 402 },
    {},
  );

  assert.equal(onlyEvent(received.customer).audible, true);
  assert.equal(onlyEvent(received.driver).audible, false);
  assert.equal(received.adminOne.length, 0);
  assert.equal(received.adminTwo.length, 0);
});

test("Replay chat tidak membunyikan ringtone kedua", async () => {
  const received = setupSubscribers();
  await publishActionRealtime(
    "chat-message",
    customer,
    { conversationId: 401 },
    { replayed: true },
  );

  assert.equal(onlyEvent(received.adminOne).replayed, true);
  assert.equal(received.adminOne[0].audible, false);
  assert.equal(onlyEvent(received.adminTwo).audible, false);
});

test("chat-open dan chat-status tetap silent", async () => {
  for (const action of ["chat-open", "chat-status"]) {
    const received = setupSubscribers();
    await publishActionRealtime(action, customer, { conversationId: 401 }, {});
    assert.equal(onlyEvent(received.adminOne).actionable, false);
    assert.equal(received.adminOne[0].audible, false);
    assert.equal(onlyEvent(received.customer).audible, false);
  }
});

test("Runtime memakai chime chat khusus, bukan suara order per-role", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "app/RealtimeOperationsRuntime.js"),
    "utf8",
  );
  assert.match(source, /event\?\.type === "CONVERSATION_CHANGED"/);
  assert.match(source, /oscillator\.type = "triangle"/);
  assert.match(source, /frequency: 784/);
  assert.match(source, /frequency: 988/);
  assert.match(source, /frequency: 1175/);
});
