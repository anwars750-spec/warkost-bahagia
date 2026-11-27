// Disposable CI instance only. Never accepts the operational DATABASE_URL.
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
const url = process.env.PRINT_BRIDGE_MYSQL_URL;
const u = new URL(url || "https://invalid");
assert.equal(process.env.CI, "true");
assert.equal(u.protocol, "mysql:");
assert.equal(u.hostname, "127.0.0.1");
assert.equal(u.pathname, "/warkost_print_bridge_ci");
process.env.DATABASE_URL = url;
const db = await mysql.createConnection({
  uri: url,
  multipleStatements: false,
});
const store = await import("../lib/store.mjs");
try {
  const [existing] = await db.query("SHOW TABLES");
  assert.equal(existing.length, 0, "Disposable CI schema must be EMPTY");
  for (const ddl of [
    "CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB",
    "CREATE TABLE settings(`key` VARCHAR(120) PRIMARY KEY,value TEXT NOT NULL) ENGINE=InnoDB",
    "CREATE TABLE audit_logs(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id BIGINT UNSIGNED NULL,action VARCHAR(100),details TEXT) ENGINE=InnoDB",
    // Only print fixture tables, same JSON/enum/uniqueness as migration 011; no migrator or 037.
    "CREATE TABLE print_jobs(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,station ENUM('ADMIN','KITCHEN') NOT NULL,status ENUM('QUEUED','PRINTED','FAILED','REPRINTED') NOT NULL DEFAULT 'QUEUED',printer_key VARCHAR(50),payload_json JSON NOT NULL,attempts INT UNSIGNED DEFAULT 0,reprint_count INT UNSIGNED DEFAULT 0,error_message VARCHAR(500),printed_at TIMESTAMP NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(order_id,station)) ENGINE=InnoDB",
  ])
    await db.query(ddl);
  await db.query("INSERT INTO users(id) VALUES(1),(2),(3)");
  for (const station of ["admin", "kitchen"])
    for (const [key, value] of Object.entries({
      host: station === "admin" ? "192.168.10.21" : "192.168.10.22",
      port: station === "admin" ? "515" : "9200",
      enabled: "true",
      auto_print: "true",
      transport: "NETWORK_AGENT",
      paper_width: station === "admin" ? "58" : "80",
      copies: station === "admin" ? "2" : "1",
    })) {
      await db.execute("INSERT INTO settings(`key`,value) VALUES(?,?)", [
        `printer_${station}_${key}`,
        value,
      ]);
    }
  for (const station of ["ADMIN", "KITCHEN"])
    await db.execute(
      "INSERT INTO print_jobs(order_id,station,printer_key,payload_json) VALUES(1,?,?,?)",
      [
        station,
        "printer_" + station.toLowerCase(),
        JSON.stringify({
          orderId: 1,
          station,
          serviceType: "PICKUP",
          _bridge: { state: "QUEUED", version: 1 },
          subtotal: 25000,
          deliveryFee: 0,
          total: 25000,
          items: [{ name: "Fixture", quantity: 1, price: 25000 }],
        }),
      ],
    );
  for (const [station, profile] of [
    ["admin", { columns: 32, cutMode: "NONE" }],
    [
      "kitchen",
      {
        font: "B",
        columns: 64,
        characterSet: "CP858",
        codePage: 19,
        cutMode: "PARTIAL",
        cutCommand: "GS_V_FEED",
      },
    ],
  ])
    await db.execute("INSERT INTO settings(`key`,value) VALUES(?,?)", [
      "printer_" + station + "_profile",
      JSON.stringify(profile),
    ]);
  const [payloads] = await db.query("SELECT payload_json FROM print_jobs");
  assert.equal(
    typeof payloads[0].payload_json,
    "object",
    "Exercise real mysql2 JSON auto-decoding",
  );
  const {
    enrollment,
    enroll,
    bridgeAction: rawBridgeAction,
    confirmPaper,
    bridgeState,
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

  const owner = { id: 1, role: "OWNER" },
    admin = { id: 2, role: "ADMIN" };
  const now = Date.now();
  const device = async (station) =>
    enroll(await enrollment(owner, { station }, now), now);
  const a = await device("ADMIN"),
    b = await device("ADMIN"),
    k = await device("KITCHEN");
  const claims = await Promise.all(
    [a, b].map((d) => bridgeAction(d.token, "claim", {}, now)),
  );
  assert.equal(claims.filter((c) => c.job).length, 1);
  const winner = claims[0].job ? a : b;
  const job = claims.find((c) => c.job).job;
  assert.equal(job.connection.port, 515);
  assert.equal(job.profile.paperWidth, 58);
  assert.equal(job.profile.copies, 2);
  await assert.rejects(
    bridgeAction(k.token, "begin", job, now + 1),
    (e) => e.status === 404,
  );
  await bridgeAction(winner.token, "begin", job, now + 1);
  await assert.rejects(
    bridgeAction(winner.token, "begin", job, now + 2),
    (e) => e.status === 409,
  );
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await bridgeAction(
          winner.token,
          "ack",
          { ...job, outcome: "SENT" },
          now + 3,
        )
      ).state,
      "SENT",
    );
  let [rows] = await db.query("SELECT * FROM print_jobs WHERE station='ADMIN'");
  assert.equal(bridgeState(rows[0]), "SENT");
  assert.equal(rows[0].printed_at, null);
  assert.equal(rows[0].attempts, 1);
  await confirmPaper(admin, { id: job.id, paperVerified: true });
  [rows] = await db.query("SELECT * FROM print_jobs WHERE station='ADMIN'");
  assert.equal(rows[0].status, "PRINTED");
  assert.equal(bridgeState(rows[0]), "CONFIRMED");
  assert.ok(rows[0].printed_at);
  const kitchen = (await bridgeAction(k.token, "claim", {}, now + 1000)).job;
  assert.equal(kitchen.station, "KITCHEN");
  assert.equal(kitchen.connection.port, 9200);
  assert.equal(kitchen.profile.characterSet, "CP858");
  assert.equal(kitchen.profile.cutMode, "PARTIAL");
  await bridgeAction(
    k.token,
    "ack",
    { ...kitchen, outcome: "OFFLINE" },
    now + 1001,
  );
  assert.equal(
    (await bridgeAction(k.token, "claim", {}, now + 2000)).job,
    null,
  );
  assert.equal(
    (await bridgeAction(winner.token, "claim", {}, now + 2000)).job,
    null,
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      database: "disposable CI MySQL8",
      checks: [
        "real JSON decoding",
        "concurrent FOR UPDATE claim",
        "station isolation",
        "one begin",
        "idempotent ACK",
        "paper confirmation",
        "offline backoff",
      ],
      migration037Executed: false,
    }),
  );
} finally {
  await store.close();
  await db.end();
}
