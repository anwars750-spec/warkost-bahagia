import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-realtime-"));
process.env.DATABASE_PATH = path.join(temp, "data.db");
process.env.SESSION_SECRET = "realtime-test-session-secret-32-bytes-minimum";

const {
  disconnectRealtimeUser,
  publishActionRealtime,
  publishRealtimeEvent,
  requireRealtimeUser,
  resetRealtimeForTests,
  subscribeRealtime,
} = await import("../lib/realtime.mjs");
const {
  nextRealtimeBackoff,
  readSoundPreference,
  recoveryRefreshGroupsForRole,
  refreshGroupsForEvent,
  isRealtimeRecoveryConnection,
  rememberRealtimeId,
  shouldPlayRealtimeSound,
  writeSoundPreference,
} = await import("../lib/realtime-client.mjs");
const { db } = await import("../lib/db.mjs");
const { issueSession } = await import("../lib/auth.mjs");

test.after(() => {
  try {
    db().close();
  } catch {}
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("SSE menolak request tanpa sesi dan menerima cookie sesi existing", async () => {
  await assert.rejects(
    requireRealtimeUser({ cookies: { get: () => undefined } }),
    (error) => error.status === 401,
  );

  const database = db();
  const inserted = database
    .prepare(
      "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)",
    )
    .run("Admin Realtime", "admin@realtime.test", "x", "ADMIN");
  const user = { id: Number(inserted.lastInsertRowid), role: "ADMIN" };
  const token = await issueSession(user);
  const authenticated = await requireRealtimeUser({
    cookies: { get: (name) => (name === "wb_session" ? { value: token } : undefined) },
  });
  assert.equal(authenticated.id, user.id);
  assert.equal(authenticated.role, "ADMIN");
});

test("hub memfilter event di server tanpa kebocoran lintas role/customer", () => {
  resetRealtimeForTests();
  const received = { customerA: [], customerB: [], admin: [], driver: [] };
  subscribeRealtime({ id: 10, role: "CUSTOMER" }, (event) => received.customerA.push(event));
  subscribeRealtime({ id: 11, role: "CUSTOMER" }, (event) => received.customerB.push(event));
  subscribeRealtime({ id: 20, role: "ADMIN" }, (event) => received.admin.push(event));
  subscribeRealtime({ id: 30, role: "DRIVER" }, (event) => received.driver.push(event));
  publishRealtimeEvent("ORDER_STATUS_CHANGED", {
    roles: ["ADMIN"],
    userIds: [10],
    payload: { orderId: 77, status: "PREPARING" },
  });
  assert.equal(received.customerA.length, 1);
  assert.equal(received.admin.length, 1);
  assert.equal(received.customerB.length, 0);
  assert.equal(received.driver.length, 0);
});

test("logout/revocation menutup seluruh koneksi user segera", () => {
  resetRealtimeForTests();
  const closed = [];
  subscribeRealtime({ id: 44, role: "DRIVER" }, () => {}, (reason) => closed.push(reason));
  subscribeRealtime({ id: 44, role: "DRIVER" }, () => {}, (reason) => closed.push(reason));
  disconnectRealtimeUser(44, "session-revoked");
  assert.deepEqual(closed, ["session-revoked", "session-revoked"]);
});

test("stock warning actionable hanya diterima Manager dan Owner", async () => {
  resetRealtimeForTests();
  const database = db();
  database.prepare("INSERT INTO categories(name) VALUES(?)").run("Realtime Stock");
  const categoryId = Number(
    database.prepare("SELECT id FROM categories WHERE name=?").get("Realtime Stock").id,
  );
  const productId = Number(
    database
      .prepare(
        "INSERT INTO products(category_id,name,price,stock_quantity,low_stock_threshold) VALUES(?,?,?,?,?)",
      )
      .run(categoryId, "Produk Realtime", 10000, 0, 2).lastInsertRowid,
  );
  const events = { manager: [], owner: [], customer: [] };
  subscribeRealtime({ id: 51, role: "MANAGER" }, (event) => events.manager.push(event.type));
  subscribeRealtime({ id: 52, role: "OWNER" }, (event) => events.owner.push(event.type));
  subscribeRealtime({ id: 53, role: "CUSTOMER" }, (event) => events.customer.push(event.type));
  await publishActionRealtime(
    "stock",
    { id: 51, role: "MANAGER" },
    { productId },
    { available_quantity: 0 },
  );
  assert.deepEqual(events.manager, ["STOCK_CHANGED", "PRODUCT_OUT_OF_STOCK"]);
  assert.deepEqual(events.owner, ["STOCK_CHANGED", "PRODUCT_OUT_OF_STOCK"]);
  assert.deepEqual(events.customer, ["STOCK_CHANGED"]);
});

test("deduplikasi event, backoff terbatas, dan refresh map deterministik", () => {
  const seen = new Set();
  assert.equal(rememberRealtimeId(seen, "event-1"), true);
  assert.equal(rememberRealtimeId(seen, "event-1"), false);
  assert.equal(nextRealtimeBackoff(0, 0), 1000);
  assert.equal(nextRealtimeBackoff(99, 1), 30000);
  assert.deepEqual(refreshGroupsForEvent("STOCK_CHANGED"), [
    "catalog",
    "stock",
    "dashboard",
  ]);
  assert.deepEqual(refreshGroupsForEvent("UNKNOWN"), []);
  assert.deepEqual(recoveryRefreshGroupsForRole("CUSTOMER"), [
    "orders",
    "notifications",
    "account",
    "catalog",
    "store-status",
  ]);
  assert.deepEqual(recoveryRefreshGroupsForRole("ADMIN"), [
    "orders",
    "notifications",
    "dashboard",
    "stock",
    "printer",
    "store-status",
  ]);
  assert.equal(
    isRealtimeRecoveryConnection({
      connectedBefore: false,
      recoveryPending: true,
    }),
    false,
  );
  assert.equal(
    isRealtimeRecoveryConnection({
      connectedBefore: true,
      recoveryPending: true,
    }),
    true,
  );
});

test("recovery reconnect hanya memberi satu refresh signal tanpa event suara", () => {
  const firstConnection = isRealtimeRecoveryConnection({
    connectedBefore: false,
    recoveryPending: false,
  });
  const recoveredConnection = isRealtimeRecoveryConnection({
    connectedBefore: true,
    recoveryPending: true,
  });
  const duplicateHandshake = isRealtimeRecoveryConnection({
    connectedBefore: true,
    recoveryPending: false,
  });
  assert.deepEqual(
    [firstConnection, recoveredConnection, duplicateHandshake],
    [false, true, false],
  );
  assert.equal(
    shouldPlayRealtimeSound({
      event: {
        id: "recovery-signal",
        actionable: false,
        audible: false,
        replayed: false,
      },
      unlocked: true,
      enabled: true,
      seen: new Set(),
    }),
    false,
  );
});

test("suara terkunci sebelum gesture, deduplikat, dan preferensi persisten", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  assert.equal(readSoundPreference(adapter), true);
  writeSoundPreference(adapter, false);
  assert.equal(readSoundPreference(adapter), false);
  const event = {
    id: "sound-1",
    actionable: true,
    audible: true,
    replayed: false,
  };
  const sounded = new Set();
  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: false, enabled: true, seen: sounded }),
    false,
  );
  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: true, enabled: true, seen: sounded }),
    true,
  );
  sounded.add(event.id);
  assert.equal(
    shouldPlayRealtimeSound({ event, unlocked: true, enabled: true, seen: sounded }),
    false,
  );
  assert.equal(
    shouldPlayRealtimeSound({
      event: { ...event, id: "old", replayed: true },
      unlocked: true,
      enabled: true,
      seen: sounded,
    }),
    false,
  );
});

test("endpoint tidak menerima token atau secret melalui URL", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/realtime/route.js"),
    "utf8",
  );
  assert.match(source, /requireRealtimeUser\(request\)/);
  assert.doesNotMatch(source, /searchParams|get\(["']token|sessionToken/);
  assert.match(source, /X-Accel-Buffering/);
});
