import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { renderEscPos } from "./print-escpos.mjs";

// No schema mutation: private metadata uses existing settings and payload_json.
const hash = (s) =>
  createHash("sha256")
    .update(Buffer.isBuffer(s) ? s : String(s))
    .digest("hex");
const secret = () => randomBytes(32).toString("hex");
const fail = (status = 409) => {
  throw new DomainError("Permintaan print bridge ditolak", status);
};
const lock = (mysql) => (mysql ? " FOR UPDATE" : "");
export const bridgeState = (job) => {
  const payload = JSON.parse(job.payload_json);
  // Historical PRINTED/REPRINTED have no physical evidence on the RC.
  return (
    (payload._bridge?.state === "PRINTING" &&
    payload._bridge.expires <= Date.now()
      ? "UNKNOWN"
      : payload._bridge?.state) ||
    (["PRINTED", "REPRINTED"].includes(job.status) ? "UNVERIFIED" : job.status)
  );
};
async function setting(tx, key, value, mysql) {
  await tx.run(
    mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value",
    key,
    JSON.stringify(value),
  );
}
async function audit(tx, action, job, actor = null) {
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    actor,
    action,
    JSON.stringify({
      printJobId: job.id,
      station: job.station,
      state: job.state,
    }),
  );
}
export async function enrollment(user, body, now = Date.now()) {
  if (user?.role !== "OWNER") fail(403);
  if (!["ADMIN", "KITCHEN"].includes(body.station)) fail(400);
  const code = secret();
  await store.transaction(async (tx, mysql) => {
    await setting(
      tx,
      "print_bridge_enroll_" + hash(code),
      { station: body.station, expires: now + 300000 },
      mysql,
    );
    await audit(
      tx,
      "PRINT_BRIDGE_ENROLLMENT",
      { station: body.station },
      user.id,
    );
  });
  return { code, expiresAt: now + 300000, station: body.station };
}
export async function revokeDevice(user, body) {
  if (user?.role !== "OWNER") fail(403);
  if (!/^[a-f0-9]{64}$/.test(body.deviceId || "")) fail(400);
  await store.run(
    "DELETE FROM settings WHERE `key`=?",
    "print_bridge_device_" + body.deviceId,
  );
  return { revoked: true };
}
export async function enroll(body, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(body.code || "")) fail(401);
  return store.transaction(async (tx, mysql) => {
    const key = "print_bridge_enroll_" + hash(body.code);
    const row = await tx.get(
      "SELECT value FROM settings WHERE `key`=?" + lock(mysql),
      key,
    );
    if (!row) fail(401);
    const grant = JSON.parse(row.value);
    if (grant.expires <= now) fail(401);
    await tx.run("DELETE FROM settings WHERE `key`=?", key);
    const token = secret();
    const id = hash(token);
    await setting(
      tx,
      "print_bridge_device_" + id,
      { station: grant.station, expires: now + 7 * 86400000 },
      mysql,
    );
    await audit(tx, "PRINT_BRIDGE_ENROLLED", { station: grant.station });
    return {
      token,
      deviceId: id,
      station: grant.station,
      expiresAt: now + 7 * 86400000,
    };
  });
}
async function device(tx, mysql, token, now) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) fail(401);
  const id = hash(token);
  const row = await tx.get(
    "SELECT value FROM settings WHERE `key`=?" + lock(mysql),
    "print_bridge_device_" + id,
  );
  if (!row) fail(401);
  const d = JSON.parse(row.value);
  if (d.expires <= now) fail(401);
  return { ...d, id };
}
async function save(tx, job, payload, legacy = "QUEUED") {
  await tx.run(
    "UPDATE print_jobs SET payload_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    JSON.stringify(payload),
    legacy,
    job.id,
  );
}
export async function bridgeAction(token, action, body = {}, now = Date.now()) {
  if (!["claim", "begin", "ack"].includes(action)) fail(404);
  return store.transaction(async (tx, mysql) => {
    const d = await device(tx, mysql, token, now);
    if (action === "claim") {
      if ((d.nextClaim || 0) > now) return { job: null };
      await setting(
        tx,
        "print_bridge_device_" + d.id,
        { station: d.station, expires: d.expires, nextClaim: now + 500 },
        mysql,
      );
      const config = Object.fromEntries(
        (
          await tx.all(
            "SELECT `key`,value FROM settings WHERE `key` LIKE 'printer_%'",
          )
        ).map((r) => [r.key, r.value]),
      );
      const prefix = "printer_" + d.station.toLowerCase() + "_";
      // New agent is deliberately opt-in using the existing Owner device controls.
      if (
        config.printer_simulation === "true" ||
        config[prefix + "enabled"] !== "true" ||
        config[prefix + "auto_print"] !== "true"
      )
        return { job: null };
      if (
        config[prefix + "transport"] !== "NETWORK_AGENT" ||
        config[prefix + "paper_width"] !== "80" ||
        config[prefix + "copies"] !== "1"
      )
        fail();
      let cursor = 0;
      while (true) {
        const rows = await tx.all(
          "SELECT * FROM print_jobs WHERE station=? AND status IN('QUEUED','FAILED') AND id>? ORDER BY id LIMIT 100" +
            lock(mysql),
          d.station,
          cursor,
        );
        if (!rows.length) return { job: null };
        for (const job of rows) {
          cursor = job.id;
          const p = JSON.parse(job.payload_json);
          const m = p._bridge || { state: "QUEUED" };
          if (m.state === "PRINTING" && m.expires <= now) {
            p._bridge = { ...m, state: "UNKNOWN" };
            await save(tx, job, p, "FAILED");
            await audit(tx, "PRINT_BRIDGE_UNCERTAIN", {
              ...job,
              state: "UNKNOWN",
            });
            continue;
          }
          if (
            ["SENT", "CONFIRMED", "UNKNOWN", "SIMULATED", "PRINTING"].includes(
              m.state,
            )
          )
            continue;
          if (m.state === "CLAIMED" && m.expires > now) continue;
          if ((m.retryAt || 0) > now || (m.failures || 0) >= 3) continue;
          const lease = secret();
          p._bridge = {
            ...m,
            state: "CLAIMED",
            leaseHash: hash(lease),
            device: d.id,
            expires: now + 30000,
          };
          // Render before reserving; malformed payload must never dispatch.
          const bytes = renderEscPos(p, job.station);
          await save(tx, job, p);
          await audit(tx, "PRINT_BRIDGE_CLAIMED", { ...job, state: "CLAIMED" });
          return {
            job: {
              id: job.id,
              station: job.station,
              printerKey: job.printer_key,
              lease,
              expiresAt: now + 30000,
              bytes: bytes.toString("base64"),
              sha256: hash(bytes),
            },
          };
        }
      }
    }
    if (
      !Number.isSafeInteger(body.id) ||
      body.id < 1 ||
      !/^[a-f0-9]{64}$/.test(body.lease || "")
    )
      fail(400);
    const job = await tx.get(
      "SELECT * FROM print_jobs WHERE id=? AND station=?" + lock(mysql),
      body.id,
      d.station,
    );
    if (!job) fail(404);
    const p = JSON.parse(job.payload_json);
    const m = p._bridge;
    if (
      !m ||
      m.device !== d.id ||
      !timingSafeEqual(Buffer.from(m.leaseHash), Buffer.from(hash(body.lease)))
    )
      fail();
    if (action === "begin") {
      // A duplicated begin is rejected: no second authorization to send bytes.
      if (m.state !== "CLAIMED" || m.expires <= now) fail();
      p._bridge = { ...m, state: "PRINTING", expires: now + 60000 };
      await save(tx, job, p);
      await tx.run(
        "UPDATE print_jobs SET attempts=attempts+1 WHERE id=?",
        job.id,
      );
      await audit(tx, "PRINT_BRIDGE_BEGIN", { ...job, state: "PRINTING" });
      return { state: "PRINTING" };
    }
    if (!["SENT", "OFFLINE", "UNKNOWN"].includes(body.outcome)) fail(400);
    if (m.state === "SENT" && body.outcome === "SENT") return { state: "SENT" };
    if (body.outcome === "OFFLINE") {
      if (m.state !== "CLAIMED") fail();
      p._bridge = {
        ...m,
        state: "FAILED",
        failures: (m.failures || 0) + 1,
        retryAt: now + Math.min(60000, 5000 * 2 ** (m.failures || 0)),
      };
    } else {
      if (m.state !== "PRINTING") fail();
      p._bridge = { ...m, state: body.outcome };
    }
    await save(tx, job, p, p._bridge.state === "SENT" ? "QUEUED" : "FAILED");
    await audit(tx, "PRINT_BRIDGE_" + p._bridge.state, {
      ...job,
      state: p._bridge.state,
    });
    return { state: p._bridge.state };
  });
}
export async function confirmPaper(user, body) {
  const station = user?.role;
  if (!["ADMIN", "KITCHEN"].includes(station) || body.paperVerified !== true)
    fail(403);
  if (!Number.isSafeInteger(body.id) || body.id < 1) fail(400);
  return store.transaction(async (tx, mysql) => {
    const job = await tx.get(
      "SELECT * FROM print_jobs WHERE id=? AND station=?" + lock(mysql),
      body.id,
      station,
    );
    if (!job) fail(404);
    const p = JSON.parse(job.payload_json);
    if (!["SENT", "UNKNOWN"].includes(bridgeState(job))) fail();
    p._bridge.state = "CONFIRMED";
    await save(tx, job, p, job.reprint_count ? "REPRINTED" : "PRINTED");
    await tx.run(
      "UPDATE print_jobs SET printed_at=CURRENT_TIMESTAMP WHERE id=?",
      job.id,
    );
    await audit(
      tx,
      "PRINT_PAPER_CONFIRMED",
      { ...job, state: "CONFIRMED" },
      user.id,
    );
    return { state: "CONFIRMED" };
  });
}
