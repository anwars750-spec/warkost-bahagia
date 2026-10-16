import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-realtime-safety-"));
process.env.DATABASE_PATH = path.join(temp, "data.db");
process.env.SESSION_SECRET = "realtime-safety-session-secret-32-bytes";

const {
  publishActionRealtime,
  publishRealtimeEvent,
  resetRealtimeForTests,
  subscribeRealtime,
} = await import("../lib/realtime.mjs");
const { shouldPlayRealtimeSound } = await import("../lib/realtime-client.mjs");
const { db } = await import("../lib/db.mjs");

const database = db();
const ids = {};
for (const [key, role] of [
  ["customerA", "CUSTOMER"],
  ["customerB", "CUSTOMER"],
  ["admin", "ADMIN"],
  ["kitchen", "KITCHEN"],
  ["driverA", "DRIVER"],
  ["driverB", "DRIVER"],
  ["manager", "MANAGER"],
  ["managerB", "MANAGER"],
  ["owner", "OWNER"],
]) {
  ids[key] = Number(
    database
      .prepare(
        "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)",
      )
      .run(key, `${key}@realtime-safety.test`, "x", role).lastInsertRowid,
  );
}
const categoryId = Number(
  database.prepare("INSERT INTO categories(name) VALUES(?)").run("Routing Test").lastInsertRowid,
);
const foodId = Number(
  database
    .prepare(
      "INSERT INTO products(category_id,name,price,prep_station) VALUES(?,?,?,?)",
    )
    .run(categoryId, "Food", 10000, "KITCHEN").lastInsertRowid,
);
const drinkId = Number(
  database
    .prepare(
      "INSERT INTO products(category_id,name,price,prep_station) VALUES(?,?,?,?)",
    )
    .run(categoryId, "Drink", 8000, "CASHIER").lastInsertRowid,
);
const rawMaterialId = Number(
  database
    .prepare(
      "INSERT INTO products(category_id,name,price,prep_station) VALUES(?,?,?,?)",
    )
    .run(categoryId, "Bahan Baku", 6000, "CASHIER").lastInsertRowid,
);
const addressId = Number(
  database
    .prepare("INSERT INTO addresses(user_id,label,detail,is_default) VALUES(?,?,?,1)")
    .run(ids.customerA, "Rumah", "Alamat realtime").lastInsertRowid,
);
const addressBId = Number(
  database
    .prepare("INSERT INTO addresses(user_id,label,detail,is_default) VALUES(?,?,?,1)")
    .run(ids.customerB, "Rumah", "Alamat realtime B").lastInsertRowid,
);

function createOrder(
  productIds,
  status = "PENDING",
  {
    customerId = ids.customerA,
    customerAddressId = addressId,
    driverId = null,
  } = {},
) {
  const orderId = Number(
    database
      .prepare(
        "INSERT INTO orders(customer_id,address_id,status,subtotal,total) VALUES(?,?,?,?,?)",
      )
      .run(customerId, customerAddressId, status, 20000, 20000).lastInsertRowid,
  );
  database
    .prepare("INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,?,?)")
    .run(orderId, "CASH", "UNPAID", 20000);
  for (const productId of productIds) {
    const product = database
      .prepare("SELECT name,price,prep_station FROM products WHERE id=?")
      .get(productId);
    database
      .prepare(
        "INSERT INTO order_items(order_id,product_id,name,price,quantity,prep_station) VALUES(?,?,?,?,?,?)",
      )
      .run(orderId, productId, product.name, product.price, 1, product.prep_station);
  }
  if (driverId)
    database
      .prepare("INSERT INTO deliveries(order_id,driver_id) VALUES(?,?)")
      .run(orderId, driverId);
  return orderId;
}

function collect(subscribers) {
  resetRealtimeForTests();
  const events = {};
  for (const [name, user] of Object.entries(subscribers)) {
    events[name] = [];
    subscribeRealtime(user, (event) => events[name].push(event));
  }
  return events;
}

test.after(() => {
  try {
    database.close();
  } catch {}
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("ORDER_CREATED updates Manager/Owner silently and is audible to Admin", () => {
  const events = collect({
    admin: { id: ids.admin, role: "ADMIN" },
    manager: { id: ids.manager, role: "MANAGER" },
    owner: { id: ids.owner, role: "OWNER" },
  });
  publishRealtimeEvent("ORDER_CREATED", {
    roles: ["ADMIN", "MANAGER", "OWNER"],
    soundRoles: ["ADMIN"],
    actionable: true,
  });
  assert.equal(events.admin[0].audible, true);
  assert.equal(events.manager[0].audible, false);
  assert.equal(events.owner[0].audible, false);
});

test("stock-out audible untuk Manager dan Owner", () => {
  const events = collect({
    manager: { id: ids.manager, role: "MANAGER" },
    owner: { id: ids.owner, role: "OWNER" },
  });
  publishRealtimeEvent("PRODUCT_OUT_OF_STOCK", {
    roles: ["MANAGER", "OWNER"],
    soundRoles: ["MANAGER", "OWNER"],
    actionable: true,
  });
  assert.equal(events.manager[0].audible, true);
  assert.equal(events.owner[0].audible, true);
});

test("sound audience tidak bocor antar customer dan driver", () => {
  const events = collect({
    customerA: { id: ids.customerA, role: "CUSTOMER" },
    customerB: { id: ids.customerB, role: "CUSTOMER" },
    driverA: { id: ids.driverA, role: "DRIVER" },
    driverB: { id: ids.driverB, role: "DRIVER" },
  });
  publishRealtimeEvent("DELIVERY_STATUS_CHANGED", {
    userIds: [ids.customerA, ids.customerB, ids.driverA, ids.driverB],
    soundUserIds: [ids.customerA, ids.driverA],
    actionable: true,
  });
  assert.equal(events.customerA[0].audible, true);
  assert.equal(events.customerB[0].audible, false);
  assert.equal(events.driverA[0].audible, true);
  assert.equal(events.driverB[0].audible, false);
});

test("fase settlement memiliki sound audience yang tepat", async () => {
  const events = collect({
    admin: { id: ids.admin, role: "ADMIN" },
    manager: { id: ids.manager, role: "MANAGER" },
    managerB: { id: ids.managerB, role: "MANAGER" },
    owner: { id: ids.owner, role: "OWNER" },
  });

  await publishActionRealtime(
    "admin-shift-settlement",
    { id: ids.admin, role: "ADMIN" },
    {},
    { settlement: { id: 1 }, replayed: false },
  );
  assert.equal(events.manager.at(-1).audible, true);

  await publishActionRealtime(
    "admin-settlement-verified",
    { id: ids.manager, role: "MANAGER" },
    {},
    { settlement: { id: 1 }, replayed: false },
  );
  assert.equal(events.manager.at(-1).audible, false);

  await publishActionRealtime(
    "manager-settlement-submit",
    { id: ids.manager, role: "MANAGER" },
    {},
    { settlement: { id: 2, manager_id: ids.manager }, replayed: false },
  );
  assert.equal(events.owner.at(-1).audible, true);
  assert.equal(events.admin.at(-1).audible, false);

  await publishActionRealtime(
    "manager-settlement-verify",
    { id: ids.owner, role: "OWNER" },
    {},
    { settlement: { id: 2, manager_id: ids.manager }, replayed: false },
  );
  assert.equal(events.owner.at(-1).audible, false);
  assert.equal(events.manager.at(-1).audible, false);

  await publishActionRealtime(
    "manager-settlement-reject",
    { id: ids.owner, role: "OWNER" },
    {},
    { settlement: { id: 2, manager_id: ids.manager }, replayed: false },
  );
  assert.equal(events.owner.at(-1).audible, false);
  assert.equal(events.manager.at(-1).audible, true);
  assert.equal(events.managerB.at(-1).audible, false);
  assert.equal(events.admin.at(-1).audible, false);
});

test("START_SHIFT tidak menerbitkan false settlement alert", () => {
  const route = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/admin-cash-control/route.js"),
    "utf8",
  );
  assert.doesNotMatch(route, /publishActionRealtime\(["']shift-settlement/);
});

test("replayed mutation tetap terkirim untuk sync tetapi selalu silent", async () => {
  const events = collect({ owner: { id: ids.owner, role: "OWNER" } });
  const result = { settlement: { id: 7, manager_id: ids.manager } };
  await publishActionRealtime(
    "manager-settlement-submit",
    { id: ids.manager, role: "MANAGER" },
    {},
    { ...result, replayed: false },
  );
  await publishActionRealtime(
    "manager-settlement-submit",
    { id: ids.manager, role: "MANAGER" },
    {},
    { ...result, replayed: true },
  );
  await publishActionRealtime(
    "manager-settlement-submit",
    { id: ids.manager, role: "MANAGER" },
    {},
    { settlement: { id: 8, manager_id: ids.manager }, replayed: false },
  );
  assert.equal(events.owner.length, 3);
  assert.deepEqual(
    events.owner.map((event) => ({ replayed: event.replayed, audible: event.audible })),
    [
      { replayed: false, audible: true },
      { replayed: true, audible: false },
      { replayed: false, audible: true },
    ],
  );
  assert.equal(new Set(events.owner.map((event) => event.id)).size, 3);
});

test("COD batch memakai daftar order batch dan tidak membocorkan order dengan ID sama", async () => {
  const unrelatedOrderId = createOrder([foodId], "DELIVERED", {
    customerId: ids.customerA,
    customerAddressId: addressId,
    driverId: ids.driverA,
  });
  const batchOrderId = createOrder([foodId], "DELIVERED", {
    customerId: ids.customerB,
    customerAddressId: addressBId,
    driverId: ids.driverB,
  });
  const events = collect({
    unrelatedCustomer: { id: ids.customerA, role: "CUSTOMER" },
    batchCustomer: { id: ids.customerB, role: "CUSTOMER" },
    unrelatedDriver: { id: ids.driverA, role: "DRIVER" },
    batchDriver: { id: ids.driverB, role: "DRIVER" },
  });

  await publishActionRealtime(
    "cod-batch-verify",
    { id: ids.admin, role: "ADMIN" },
    { batchId: unrelatedOrderId },
    {
      id: unrelatedOrderId,
      orders: [{ order_id: batchOrderId }],
      replayed: false,
    },
  );

  assert.equal(events.unrelatedCustomer.length, 0);
  assert.equal(events.unrelatedDriver.length, 0);
  assert.equal(events.batchCustomer.length, 1);
  assert.equal(events.batchDriver.length, 1);
  assert.deepEqual(events.batchCustomer[0].payload.orderIds, [batchOrderId]);
  assert.equal("orderId" in events.batchCustomer[0].payload, false);
  assert.equal(events.batchCustomer[0].payload.batchId, unrelatedOrderId);
});

for (const [label, productIds, expected] of [
  ["food only", [foodId], 1],
  ["food and drink", [foodId, drinkId], 1],
  ["drink only", [drinkId], 0],
  ["bahan baku only", [rawMaterialId], 0],
]) {
  test(`Kitchen routing checkout ${label}`, async () => {
    const orderId = createOrder(productIds);
    const events = collect({ kitchen: { id: ids.kitchen, role: "KITCHEN" } });
    await publishActionRealtime(
      "checkout",
      { id: ids.customerA, role: "CUSTOMER" },
      { items: [] },
      { order: { id: orderId } },
    );
    assert.equal(
      events.kitchen.filter((event) => event.type === "KITCHEN_ORDER_CREATED").length,
      expected,
    );
  });
}

test("drink-only cancellation tidak memberi Kitchen event/sound", async () => {
  const orderId = createOrder([drinkId]);
  database.prepare("UPDATE orders SET status='CANCELLED' WHERE id=?").run(orderId);
  const events = collect({ kitchen: { id: ids.kitchen, role: "KITCHEN" } });
  await publishActionRealtime(
    "status",
    { id: ids.admin, role: "ADMIN" },
    { orderId, status: "CANCELLED" },
    {},
  );
  assert.equal(
    events.kitchen.filter((event) => event.type === "ORDER_CANCELLED").length,
    0,
  );
  assert.equal(events.kitchen.some((event) => event.audible), false);
});

test("sound membutuhkan audible dan tidak replay/duplikat", () => {
  const seen = new Set();
  const base = { id: "event-1", actionable: true, audible: true, replayed: false };
  assert.equal(
    shouldPlayRealtimeSound({ event: base, unlocked: true, enabled: true, seen }),
    true,
  );
  seen.add(base.id);
  assert.equal(
    shouldPlayRealtimeSound({ event: base, unlocked: true, enabled: true, seen }),
    false,
  );
  assert.equal(
    shouldPlayRealtimeSound({
      event: { ...base, id: "event-2", replayed: true },
      unlocked: true,
      enabled: true,
      seen,
    }),
    false,
  );
  assert.equal(
    shouldPlayRealtimeSound({
      event: { ...base, id: "event-3", audible: false },
      unlocked: true,
      enabled: true,
      seen,
    }),
    false,
  );
});

test("main UI fail-closed dan duplicate refresh bridges terpasang", () => {
  const page = fs.readFileSync(path.resolve(process.cwd(), "app/page.js"), "utf8");
  const runtime = fs.readFileSync(
    path.resolve(process.cwd(), "app/RealtimeOperationsRuntime.js"),
    "utf8",
  );
  const adminEnhancer = fs.readFileSync(
    path.resolve(process.cwd(), "app/AdminOrderCardEnhancer.js"),
    "utf8",
  );
  const ownerBridge = fs.readFileSync(
    path.resolve(process.cwd(), "app/OwnerControlDirectBridge.js"),
    "utf8",
  );
  assert.match(runtime, /warkost:session-invalidated/);
  assert.match(runtime, /warkost:session-rotated/);
  assert.match(runtime, /warkost:session-rotation-started/);
  assert.match(runtime, /warkost:realtime-recovered/);
  assert.match(page, /recoveryRefreshGroupsForRole\(user\.role\)/);
  assert.match(page, /warkost:session-rotation-cancelled/);
  assert.match(page, /setUser\(null\)[\s\S]*setView\("auth"\)/);
  assert.match(page, /warkost:orders-refreshed/);
  assert.match(adminEnhancer, /warkost:orders-refreshed/);
  assert.doesNotMatch(adminEnhancer, /addEventListener\("warkost:realtime"/);
  assert.doesNotMatch(ownerBridge, /<OwnerOperationalHealth/);
});

test("recovery signal memuat ulang state otoritatif untuk seluruh role tanpa reload halaman", () => {
  const sources = [
    "app/page.js",
    "app/DriverControlCenter.js",
    "app/KitchenDashboardFast.js",
    "app/ManagerControlCenter.js",
    "app/OwnerDashboardRuntime.js",
    "app/OwnerOperationalHealth.js",
    "app/AdminCashControlCenter.js",
    "app/AdminShiftSettlementRuntime.js",
    "app/CodBatchSettlementCenter.js",
    "app/ManagerCashSettlementCenter.js",
    "app/ManagerOwnerSettlementCenter.js",
    "app/AdminPrinterController.js",
    "app/OwnerStockOverview.js",
    "app/OwnerBusinessReport.js",
  ].map((file) => [
    file,
    fs.readFileSync(path.resolve(process.cwd(), file), "utf8"),
  ]);
  for (const [file, source] of sources)
    assert.match(
      source,
      /addEventListener\("warkost:realtime-recovered"/,
      `${file} wajib menangani recovery`,
    );
  assert.doesNotMatch(
    sources.map(([, source]) => source).join("\n"),
    /warkost:realtime-recovered[\s\S]{0,160}location\.reload/,
  );
});

test("normal logout hanya mencabut sesi aktif sementara remote revocation tetap user-wide", async () => {
  const { currentUser, issueSession, revokeSession } = await import("../lib/auth.mjs");
  const { disconnectRealtimeUser } = await import("../lib/realtime.mjs");
  const route = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/[action]/route.js"),
    "utf8",
  );
  const logoutBranch = route.match(
    /if \(action === "logout"\) \{([\s\S]*?)\n    \}/,
  )?.[1] || "";
  assert.match(logoutBranch, /revokeSession\(request\)/);
  assert.doesNotMatch(logoutBranch, /disconnectRealtimeUser/);

  const tokenA = await issueSession({ id: ids.managerB, role: "MANAGER" });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const tokenB = await issueSession({ id: ids.managerB, role: "MANAGER" });
  const requestFor = (token) => ({
    cookies: { get: () => ({ value: token }) },
  });
  const closed = [];
  resetRealtimeForTests();
  subscribeRealtime(
    { id: ids.managerB, role: "MANAGER" },
    () => {},
    (reason) => closed.push(`A:${reason}`),
  );
  subscribeRealtime(
    { id: ids.managerB, role: "MANAGER" },
    () => {},
    (reason) => closed.push(`B:${reason}`),
  );

  await revokeSession(requestFor(tokenA));
  assert.equal(await currentUser(requestFor(tokenA)), null);
  assert.equal((await currentUser(requestFor(tokenB))).id, ids.managerB);
  assert.deepEqual(closed, []);

  database
    .prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(ids.managerB);
  disconnectRealtimeUser(ids.managerB, "session-revoked");
  assert.equal(await currentUser(requestFor(tokenB)), null);
  assert.deepEqual(closed, ["A:session-revoked", "B:session-revoked"]);
});

test("self password rotation menjaga sesi baru dan remote revocation fail-closed", async () => {
  const { hashPassword, issueSession, currentUser } = await import("../lib/auth.mjs");
  const { updateProfile } = await import("../lib/account.mjs");
  const { disconnectRealtimeUser } = await import("../lib/realtime.mjs");
  database
    .prepare("UPDATE users SET password_hash=?,phone=?,birth_date=? WHERE id=?")
    .run(hashPassword("password-awal-yang-panjang"), "628111111111", "1995-05-10", ids.customerA);

  const oldToken = await issueSession({ id: ids.customerA, role: "CUSTOMER" });
  const oldRequest = { cookies: { get: () => ({ value: oldToken }) } };
  const closed = [];
  resetRealtimeForTests();
  subscribeRealtime(
    { id: ids.customerA, role: "CUSTOMER" },
    () => {},
    (reason) => closed.push(reason),
  );
  const changed = await updateProfile(
    { id: ids.customerA, role: "CUSTOMER" },
    {
      name: "Customer A",
      email: "customer-a-rotated@realtime-safety.test",
      phone: "0811-1111-1111",
      birthDate: "1995-05-10",
      currentPassword: "password-awal-yang-panjang",
      newPassword: "password-baru-yang-panjang",
    },
  );
  const nextToken = await issueSession(changed.user);
  disconnectRealtimeUser(ids.customerA, "session-rotated");
  const nextRequest = { cookies: { get: () => ({ value: nextToken }) } };
  assert.equal(await currentUser(oldRequest), null);
  assert.equal((await currentUser(nextRequest)).id, ids.customerA);
  assert.deepEqual(closed, ["session-rotated"]);

  const remoteToken = await issueSession({ id: ids.customerB, role: "CUSTOMER" });
  const remoteRequest = { cookies: { get: () => ({ value: remoteToken }) } };
  const remoteClosed = [];
  resetRealtimeForTests();
  subscribeRealtime(
    { id: ids.customerB, role: "CUSTOMER" },
    () => {},
    (reason) => remoteClosed.push(reason),
  );
  database
    .prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(ids.customerB);
  disconnectRealtimeUser(ids.customerB, "session-revoked");
  assert.equal(await currentUser(remoteRequest), null);
  assert.deepEqual(remoteClosed, ["session-revoked"]);
});
