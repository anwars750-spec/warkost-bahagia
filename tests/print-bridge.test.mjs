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
  bridgeAction: rawBridgeAction,
  confirmPaper,
  bridgeState,
  parsePrintPayload,
} = await import("../lib/print-bridge.mjs");
const bridgeAction = (token, action, body = {}, now) =>
  rawBridgeAction(
    token,
    action,
    action === "claim"
      ? {
          protocol: 2,
          profileVersion: 1,
          adapters: ["ESC_POS_NETWORK"],
          ...body,
        }
      : body,
    now,
  );

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
      host: station === "admin" ? "192.168.10.21" : "192.168.10.22",
      port: "9100",
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
  assert.equal(j.printerHost, "192.168.10.21");
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
      )._bridge.state,
      "QUEUED",
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
  assert.equal(b.subarray(5, -3).includes(27), false);
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
        body: JSON.stringify(
          action === "claim"
            ? {
                protocol: 2,
                profileVersion: 1,
                adapters: ["ESC_POS_NETWORK"],
                ...body,
              }
            : body,
        ),
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

test("invalid public printer configuration refuses claim without touching job", async () => {
  await jobs();
  const d = await device();
  database
    .prepare(
      "UPDATE settings SET value='8.8.8.8' WHERE key='printer_admin_host'",
    )
    .run();
  await assert.rejects(
    bridgeAction(d.token, "claim", {}, 1000000),
    (e) => e.status === 409,
  );
  const job = database
    .prepare("SELECT * FROM print_jobs WHERE station='ADMIN'")
    .get();
  assert.equal(bridgeState(job), "QUEUED");
  assert.equal(job.attempts, 0);
});

test("MySQL JSON objects and SQLite JSON strings preserve the same protected state", () => {
  const payload = {
    station: "ADMIN",
    items: [{ name: "Fixture" }],
    _bridge: { state: "SENT" },
  };
  assert.deepEqual(parsePrintPayload(JSON.stringify(payload)), payload);
  assert.deepEqual(parsePrintPayload(payload), payload);
  assert.equal(
    bridgeState({ status: "QUEUED", payload_json: payload }),
    "SENT",
  );
  const clone = parsePrintPayload(payload);
  clone._bridge.state = "UNKNOWN";
  assert.equal(payload._bridge.state, "SENT");
  assert.throws(() => parsePrintPayload(null));
  assert.throws(() => parsePrintPayload([]));
});

test("pre-bridge queued tickets are quarantined until explicit operator reconciliation", async () => {
  await jobs();
  const d = await device();
  const row = database
    .prepare("SELECT * FROM print_jobs WHERE station='ADMIN'")
    .get();
  const p = JSON.parse(row.payload_json);
  delete p._bridge;
  database
    .prepare("UPDATE print_jobs SET payload_json=? WHERE id=?")
    .run(JSON.stringify(p), row.id);
  assert.equal((await bridgeAction(d.token, "claim", {}, 1000000)).job, null);
  assert.equal((await listPrintJobs(admin))[0].status, "UNVERIFIED");
  await assert.rejects(retryPrintJob(admin, row.id), (e) => e.status === 409);
  await retryPrintJob(admin, row.id, { acknowledgeDuplicateRisk: true });
  assert.ok((await bridgeAction(d.token, "claim", {}, 1001000)).job);
});

for (const port of [515, 9200, 65535])
  test(`Owner port ${port} and 58mm/copies profile reach station claim`, async () => {
    await jobs();
    const d = await device();
    database
      .prepare("UPDATE settings SET value=? WHERE key='printer_admin_port'")
      .run(String(port));
    database
      .prepare(
        "UPDATE settings SET value='58' WHERE key='printer_admin_paper_width'",
      )
      .run();
    database
      .prepare("UPDATE settings SET value='2' WHERE key='printer_admin_copies'")
      .run();
    database
      .prepare(
        "INSERT INTO settings(key,value) VALUES('printer_admin_profile',?)",
      )
      .run(JSON.stringify({ columns: 32, cutMode: "NONE" }));
    const j = (await bridgeAction(d.token, "claim", {}, 1000000)).job;
    assert.equal(j.connection.port, port);
    assert.equal(j.connection.host, "192.168.10.21");
    assert.equal(j.protocol, 2);
    assert.equal(j.profile.paperWidth, 58);
    assert.equal(j.profile.copies, 2);
    assert.equal(j.profile.cutMode, "NONE");
    const bytes = Buffer.from(j.bytes, "base64");
    assert.equal(bytes.includes(Buffer.from([29, 86])), false);
    assert.match(bytes.toString(), /SALINAN 2\/2/);
    await bridgeAction(d.token, "begin", j, 1000001);
    await bridgeAction(d.token, "ack", { ...j, outcome: "SENT" }, 1000002);
    assert.equal((await bridgeAction(d.token, "claim", {}, 1001000)).job, null);
  });
test("obsolete agent handshake and unimplemented adapter cannot consume a lease", async () => {
  await jobs();
  const d = await device();
  await assert.rejects(
    rawBridgeAction(d.token, "claim", {}, 1000000),
    (e) => e.status === 409,
  );
  database
    .prepare(
      "UPDATE settings SET value='USB_AGENT' WHERE key='printer_admin_transport'",
    )
    .run();
  await assert.rejects(
    bridgeAction(d.token, "claim", {}, 1000000),
    (e) => e.status === 409,
  );
  assert.equal(
    database
      .prepare("SELECT attempts FROM print_jobs WHERE station='ADMIN'")
      .get().attempts,
    0,
  );
});
test("Owner config changes after claim fence begin without printing or weakening journal ACK", async () => {
  await jobs();
  const d = await device();
  const j = (await bridgeAction(d.token, "claim", {}, 1000000)).job;
  database
    .prepare("UPDATE settings SET value='9201' WHERE key='printer_admin_port'")
    .run();
  await assert.rejects(
    bridgeAction(d.token, "begin", j, 1000001),
    (e) => e.status === 409,
  );
  assert.equal(
    database
      .prepare("SELECT attempts FROM print_jobs WHERE station='ADMIN'")
      .get().attempts,
    0,
  );
});
test("Owner capability profiles persist per station through existing settings API", async () => {
  const { saveOwnerDeviceSettings, getPrinterRuntimeConfig } =
    await import("../lib/owner-device-settings.mjs");
  const saved = await saveOwnerDeviceSettings(owner, {
    admin: {
      host: "192.168.10.21",
      port: 515,
      paperWidth: 58,
      copies: 2,
      profile: {
        columns: 32,
        cutMode: "NONE",
        characterSet: "CP437",
        codePage: 0,
      },
    },
    kitchen: {
      host: "192.168.10.22",
      port: 9200,
      profile: {
        font: "B",
        columns: 64,
        characterSet: "CP858",
        codePage: 19,
        cutMode: "PARTIAL",
      },
    },
  });
  assert.equal(saved.admin.profile.copies, 2);
  assert.equal(saved.admin.profile.paperWidth, 58);
  assert.equal(saved.kitchen.profile.columns, 64);
  const runtime = await getPrinterRuntimeConfig(kitchen);
  assert.equal(runtime.devices.length, 1);
  assert.equal(runtime.devices[0].port, 9200);
  assert.equal(runtime.devices[0].profile.characterSet, "CP858");
  await assert.rejects(
    saveOwnerDeviceSettings(admin, {}),
    (e) => e.status === 403,
  );
});

test("unrepresentable text refuses claim without reserving or printing job", async () => {
  await jobs();
  const d = await device();
  const row = database
    .prepare("SELECT * FROM print_jobs WHERE station='ADMIN'")
    .get();
  const p = JSON.parse(row.payload_json);
  p.items[0].name = "\u6f22";
  database
    .prepare("UPDATE print_jobs SET payload_json=? WHERE id=?")
    .run(JSON.stringify(p), row.id);
  database
    .prepare(
      "INSERT INTO settings(key,value) VALUES('printer_admin_profile',?)",
    )
    .run(JSON.stringify({ characterSet: "CP437", codePage: 0 }));
  await assert.rejects(
    bridgeAction(d.token, "claim", {}, 1000000),
    (e) => e.status === 400,
  );
  const result = database
    .prepare("SELECT * FROM print_jobs WHERE id=?")
    .get(row.id);
  assert.equal(bridgeState(result), "QUEUED");
  assert.equal(result.attempts, 0);
});

test("network profiles allow one private host with distinct ports but refuse identical station endpoints", async () => {
  const { saveOwnerDeviceSettings } =
    await import("../lib/owner-device-settings.mjs");
  const input = {
    admin: { host: "192.168.10.50", port: 9200 },
    kitchen: { host: "192.168.10.50", port: 9201 },
  };
  const saved = await saveOwnerDeviceSettings(owner, input);
  assert.equal(saved.admin.host, saved.kitchen.host);
  assert.notEqual(saved.admin.port, saved.kitchen.port);
  await assert.rejects(
    saveOwnerDeviceSettings(owner, {
      ...input,
      kitchen: { ...input.kitchen, port: 9200 },
    }),
  );
});
