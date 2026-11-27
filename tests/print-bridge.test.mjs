import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-")),
  "bridge.db",
);
process.env.SESSION_SECRET =
  "isolated-print-test-secret-over-thirty-two-characters";
const { db } = await import("../lib/db.mjs");
const store = await import("../lib/store.mjs");
const {
  enrollment,
  enroll,
  revokeDevice,
  bridgeAction,
  confirmPaper,
  bridgeState,
} = await import("../lib/print-bridge.mjs");
const { enqueueOrderPrintJobs } = await import("../lib/print-queue.mjs");
const { listPrintJobs, retryPrintJob } = await import("../lib/printer.mjs");
const { renderEscPos } = await import("../lib/print-escpos.mjs");
const database = db();
const owner = { id: 1, role: "OWNER" },
  admin = { id: 2, role: "ADMIN" },
  kitchen = { id: 3, role: "KITCHEN" };
database.exec(`INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Owner','owner@bridge.test','x','OWNER'),(2,'Admin','admin@bridge.test','x','ADMIN'),(3,'Kitchen','kitchen@bridge.test','x','KITCHEN'),(4,'Customer','customer@bridge.test','x','CUSTOMER');
INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,4,'Rumah','Alamat sintetis',0,0);
INSERT INTO categories(id,name) VALUES(1,'Food');
INSERT INTO products(id,category_id,name,price,prep_station) VALUES(1,1,'Nasi',20000,'KITCHEN'),(2,1,'Kopi',5000,'CASHIER');`);
beforeEach(() => {
  database.exec(
    "DELETE FROM audit_logs; DELETE FROM print_jobs; DELETE FROM order_items; DELETE FROM orders; DELETE FROM settings;",
  );
  for (const station of ["admin", "kitchen"])
    for (const [k, v] of Object.entries({
      enabled: "true",
      auto_print: "true",
      paper_width: "80",
      copies: "1",
      transport: "NETWORK_AGENT",
    }))
      database
        .prepare("INSERT INTO settings(key,value) VALUES(?,?)")
        .run(`printer_${station}_${k}`, v);
});
async function device(station = "ADMIN", now = 1000000) {
  const code = await enrollment(owner, { station }, now);
  return enroll(code, now);
}
async function jobs(type = "PICKUP", simulate = false, foodOnly = false) {
  database
    .prepare(
      "INSERT INTO orders(id,customer_id,address_id,fulfillment_type,subtotal,total) VALUES(1,4,1,?,25000,25000)",
    )
    .run(type);
  database.exec(
    "INSERT INTO order_items(order_id,product_id,name,price,quantity,prep_station,note) VALUES(1,1,'Nasi',20000,1,'KITCHEN','Tanpa sambal')",
  );
  if (!foodOnly)
    database.exec(
      "INSERT INTO order_items(order_id,product_id,name,price,quantity,prep_station) VALUES(1,2,'Kopi',5000,1,'CASHIER')",
    );
  for (let n = 0; n < 2; n++)
    await store.transaction((tx) => enqueueOrderPrintJobs(tx, 1, 2, simulate));
  return database.prepare("SELECT * FROM print_jobs ORDER BY station").all();
}
test("enrollment is Owner-only, single-use, expiring, hashed and revocable", async () => {
  await assert.rejects(
    enrollment(admin, { station: "ADMIN" }),
    (e) => e.status === 403,
  );
  const c = await enrollment(owner, { station: "ADMIN" }, 1000);
  await assert.rejects(enroll(c, 301001), (e) => e.status === 401);
  const grant = await enroll(c, 2000);
  await assert.rejects(enroll(c, 2000), (e) => e.status === 401);
  assert.equal(
    JSON.stringify(database.prepare("SELECT * FROM settings").all()).includes(
      grant.token,
    ),
    false,
  );
  await revokeDevice(owner, { deviceId: grant.deviceId });
  await assert.rejects(
    bridgeAction(grant.token, "claim", {}, 3000),
    (e) => e.status === 401,
  );
});
for (const type of ["PICKUP", "DELIVERY"])
  test(`${type}: Admin full receipt, Kitchen food-only, replay unique`, async () => {
    const rows = await jobs(type);
    assert.equal(rows.length, 2);
    const a = JSON.parse(rows[0].payload_json),
      k = JSON.parse(rows[1].payload_json);
    assert.deepEqual(
      a.items.map((x) => x.name),
      ["Nasi", "Kopi"],
    );
    assert.deepEqual(
      k.items.map((x) => x.name),
      ["Nasi"],
    );
    const ka = renderEscPos(k, "KITCHEN").toString("ascii");
    assert.match(ka, new RegExp(type));
    assert.match(ka, /Tanpa sambal/);
    assert.doesNotMatch(ka, /Kopi|Subtotal|Ongkir|Total|Alamat/);
    assert.deepEqual([...renderEscPos(a, "ADMIN").subarray(-3)], [29, 86, 0]);
  });
test("food-only still creates Admin transaction receipt", async () => {
  const rows = await jobs("PICKUP", false, true);
  assert.deepEqual(
    rows.map((j) => j.station),
    ["ADMIN", "KITCHEN"],
  );
});
test("simulation and historical printed states never prove physical paper", async () => {
  const rows = await jobs("PICKUP", true);
  assert.ok(
    rows.every(
      (j) => j.status === "QUEUED" && j.printed_at === null && j.attempts === 0,
    ),
  );
  const d = await device();
  assert.equal((await bridgeAction(d.token, "claim", {}, 1000000)).job, null);
  assert.equal((await listPrintJobs(admin))[0].status, "SIMULATED");
  assert.equal(
    bridgeState({ status: "PRINTED", payload_json: "{}" }),
    "UNVERIFIED",
  );
});
test("concurrent devices atomically claim once; stations cannot begin or ack other station", async () => {
  await jobs();
  const a = await device(),
    a2 = await device(),
    k = await device("KITCHEN");
  const claimed = await Promise.all(
    [a, a2].map((d) => bridgeAction(d.token, "claim", {}, 1000000)),
  );
  assert.equal(claimed.filter((c) => c.job).length, 1);
  const j = claimed.find((c) => c.job).job;
  await assert.rejects(
    bridgeAction(k.token, "begin", j, 1000001),
    (e) => e.status === 404,
  );
  await assert.rejects(
    bridgeAction(a2.token, "ack", { ...j, outcome: "SENT" }, 1000001),
  );
  assert.equal(j.station, "ADMIN");
});
test("expired pre-send lease recovers; old authorization is fenced", async () => {
  await jobs();
  const a = await device(),
    b = await device();
  const old = (await bridgeAction(a.token, "claim", {}, 1000000)).job;
  const newer = (await bridgeAction(b.token, "claim", {}, 1030001)).job;
  assert.equal(newer.id, old.id);
  assert.notEqual(newer.lease, old.lease);
  await assert.rejects(
    bridgeAction(a.token, "begin", old, 1030002),
    (e) => e.status === 409,
  );
  await bridgeAction(b.token, "begin", newer, 1030002);
  await assert.rejects(
    bridgeAction(b.token, "begin", newer, 1030003),
    (e) => e.status === 409,
  );
});
test("offline has bounded backoff; three failures require manual retry and never stamp paper", async () => {
  await jobs();
  const d = await device();
  let now = 1000000;
  for (let n = 0; n < 3; n++) {
    const j = (await bridgeAction(d.token, "claim", {}, now)).job;
    assert.ok(j);
    await bridgeAction(d.token, "ack", { ...j, outcome: "OFFLINE" }, now + 1);
    assert.equal(
      (await bridgeAction(d.token, "claim", {}, now + 1000)).job,
      null,
    );
    now += 70000;
  }
  assert.equal((await bridgeAction(d.token, "claim", {}, now)).job, null);
  const job = database
    .prepare("SELECT * FROM print_jobs WHERE station='ADMIN'")
    .get();
  assert.equal(job.attempts, 0);
  assert.equal(job.printed_at, null);
  await retryPrintJob(admin, job.id);
  assert.ok((await bridgeAction(d.token, "claim", {}, now + 1000)).job);
});
test("begin followed by restart/lost response is UNKNOWN, never automatically replayed", async () => {
  await jobs();
  const d = await device();
  const j = (await bridgeAction(d.token, "claim", {}, 1000000)).job;
  await bridgeAction(d.token, "begin", j, 1000001);
  assert.equal((await bridgeAction(d.token, "claim", {}, 1070002)).job, null);
  const record = database
    .prepare("SELECT * FROM print_jobs WHERE id=?")
    .get(j.id);
  assert.equal(bridgeState(record), "UNKNOWN");
  assert.equal(record.printed_at, null);
  await assert.rejects(retryPrintJob(admin, j.id), (e) => e.status === 409);
  await retryPrintJob(admin, j.id, { acknowledgeDuplicateRisk: true });
  await assert.rejects(
    bridgeAction(d.token, "ack", { ...j, outcome: "SENT" }, 1070003),
    (e) => e.status === 409,
  );
});
test("fake ESC/POS socket receives one dispatch; ACK replay not physical confirmation", async () => {
  await jobs();
  const d = await device();
  const j = (await bridgeAction(d.token, "claim", {}, 1000000)).job;
  const bytes = Buffer.from(j.bytes, "base64");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), j.sha256);
  let received = Buffer.alloc(0);
  const server = net.createServer((s) =>
    s.on("data", (b) => (received = Buffer.concat([received, b]))),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await bridgeAction(d.token, "begin", j, 1000001);
    const socket = net.connect(server.address().port, "127.0.0.1");
    await once(socket, "connect");
    socket.end(bytes);
    await once(socket, "close");
    for (let n = 0; n < 2; n++)
      assert.equal(
        (await bridgeAction(d.token, "ack", { ...j, outcome: "SENT" }, 1000002))
          .state,
        "SENT",
      );
    assert.deepEqual(received, bytes);
    assert.equal((await listPrintJobs(admin))[0].status, "SENT");
    assert.equal(
      database.prepare("SELECT printed_at FROM print_jobs WHERE id=?").get(j.id)
        .printed_at,
      null,
    );
    await assert.rejects(
      confirmPaper(kitchen, { id: j.id, paperVerified: true }),
      (e) => e.status === 404,
    );
    await assert.rejects(
      confirmPaper(admin, { id: j.id, paperVerified: false }),
      (e) => e.status === 403,
    );
    await confirmPaper(admin, { id: j.id, paperVerified: true });
    assert.equal((await listPrintJobs(admin))[0].status, "CONFIRMED");
    assert.equal((await bridgeAction(d.token, "claim", {}, 1001000)).job, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("database failure rolls claim back; no consumed job or dispatch token", async () => {
  await jobs();
  const d = await device();
  database.exec(
    "CREATE TRIGGER reject_bridge_audit BEFORE INSERT ON audit_logs WHEN NEW.action='PRINT_BRIDGE_CLAIMED' BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  try {
    await assert.rejects(bridgeAction(d.token, "claim", {}, 1000000));
    assert.equal(
      JSON.parse(
        database
          .prepare("SELECT payload_json FROM print_jobs WHERE station='ADMIN'")
          .get().payload_json,
      )._bridge,
      undefined,
    );
  } finally {
    database.exec("DROP TRIGGER reject_bridge_audit");
  }
  assert.ok((await bridgeAction(d.token, "claim", {}, 1000000)).job);
});
test("ESC/POS strips command injection and wraps text to 48 columns", () => {
  const p = {
    orderId: 1,
    station: "KITCHEN",
    serviceType: "DELIVERY",
    items: [
      { name: "A".repeat(80) + "\x1b\x40", quantity: 1, note: "tanpa gula" },
    ],
  };
  const b = renderEscPos(p, "KITCHEN");
  assert.equal(b.subarray(2, -3).includes(27), false);
  assert.ok(
    b
      .subarray(2, -3)
      .toString()
      .split("\n")
      .every((x) => x.length <= 48),
  );
});
test("real route enforces HTTPS, Owner session, Origin, bounded JSON and station bearer", async () => {
  const { POST } = await import("../app/api/print-bridge/[action]/route.js");
  const { issueSession } = await import("../lib/auth.mjs");
  const session = await issueSession(owner);
  async function call(
    action,
    body,
    {
      scheme = "https",
      token = null,
      cookie = null,
      origin = null,
      type = "application/json",
    } = {},
  ) {
    const req = new Request(
      `${scheme}://bridge.test/api/print-bridge/${action}`,
      {
        method: "POST",
        headers: {
          host: "bridge.test",
          "content-type": type,
          ...(token ? { authorization: "Bearer " + token } : {}),
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    req.cookies = { get: () => (cookie ? { value: cookie } : undefined) };
    return POST(req, { params: Promise.resolve({ action }) });
  }
  assert.equal(
    (
      await call(
        "enrollment",
        { station: "ADMIN" },
        { scheme: "http", cookie: session },
      )
    ).status,
    403,
  );
  assert.equal((await call("enrollment", { station: "ADMIN" })).status, 403);
  assert.equal(
    (
      await call(
        "enrollment",
        { station: "ADMIN" },
        { cookie: session, origin: "https://attacker.test" },
      )
    ).status,
    403,
  );
  assert.equal((await call("claim", {}, { token: "bogus" })).status, 401);
  assert.equal((await call("claim", {}, { type: "text/plain" })).status, 415);
  const c = await call(
    "enrollment",
    { station: "KITCHEN" },
    { cookie: session, origin: "https://bridge.test" },
  );
  assert.equal(c.status, 200);
  assert.equal(c.headers.get("cache-control"), "no-store");
  const en = await call("enroll", await c.json());
  assert.equal(en.status, 200);
  const d = await en.json();
  await jobs();
  const claimed = await call("claim", {}, { token: d.token });
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).job.station, "KITCHEN");
});
