import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { createDB } from "mysql-memory-server";
import {
  parseMysqlUrl,
  requiredMysqlTables,
} from "../lib/mysql-operations.mjs";

const root = path.resolve(".");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "warkost-mysql-integration-"),
);
const password = "mysql-integration-password-2026";
let database;
let web;
let sourceUrl;
let mysqlVersion;

function run(script, env) {
  console.log(`MYSQL INTEGRATION: mulai ${script}`);
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0)
    throw Error(
      `${script} gagal${result.signal ? ` (${result.signal})` : ""}\n${result.stdout}\n${result.stderr}`,
    );
  console.log(`MYSQL INTEGRATION: selesai ${script}`);
  return result.stdout.trim();
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

async function requireUnixSocket() {
  const socket = path.join(temporary, "capability.sock");
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket, resolve);
    });
    server.close();
    await once(server, "close");
  } catch (error) {
    if (server.listening) server.close();
    throw Error(
      `Environment tidak mengizinkan UNIX socket yang diwajibkan MySQL (${error.code || error.message})`,
    );
  } finally {
    fs.rmSync(socket, { force: true });
  }
}

async function waitForReady(origin, output) {
  let lastResponse = "belum ada respons HTTP";
  for (let attempt = 0; attempt < 80; attempt++) {
    if (web.exitCode !== null)
      throw Error("Next.js berhenti sebelum siap\n" + output());
    try {
      const response = await fetch(origin + "/api/health/ready");
      if (response.status === 200) return;
      lastResponse = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastResponse = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error(
    `Next.js tidak siap dalam batas waktu; respons terakhir: ${lastResponse}\n${output()}`,
  );
}

async function stopWeb() {
  if (!web || web.exitCode !== null) return;
  web.kill("SIGTERM");
  await Promise.race([
    once(web, "exit"),
    new Promise((resolve) =>
      setTimeout(() => {
        if (web.exitCode === null) web.kill("SIGKILL");
        resolve();
      }, 5000),
    ),
  ]);
}

try {
  const externalUrl = process.env.MYSQL_TEST_DATABASE_URL?.trim();
  if (externalUrl) {
    console.log("MYSQL INTEGRATION: verifikasi database MySQL eksternal");
    sourceUrl = externalUrl;
    const externalConfig = parseMysqlUrl(sourceUrl);
    const probe = await mysql.createConnection(sourceUrl);
    try {
      const [rows] = await probe.query("SELECT VERSION() version");
      mysqlVersion = rows[0].version;
      const [tables] = await probe.execute(
        "SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=?",
        [externalConfig.database],
      );
      assert.equal(
        tables[0].count,
        0,
        "MYSQL_TEST_DATABASE_URL harus menunjuk database test yang kosong",
      );
    } finally {
      await probe.end();
    }
  } else {
    console.log("MYSQL INTEGRATION: mulai MySQL ephemeral lokal");
    await requireUnixSocket();
    database = await createDB({
      version: process.env.MYSQL_TEST_VERSION || "8.0.x",
      dbName: "warkost_source",
      xEnabled: "OFF",
      downloadBinaryOnce: true,
      logLevel: "WARN",
    });
    sourceUrl = `mysql://${encodeURIComponent(database.username)}@127.0.0.1:${database.port}/${database.dbName}`;
    mysqlVersion = database.mysql.version;
  }
  assert.match(
    String(mysqlVersion),
    /^8\.0\./,
    "Recovery drill wajib memakai MySQL 8.0",
  );
  const common = {
    DATABASE_URL: sourceUrl,
    SEED_DEMO_PASSWORD: password,
    SESSION_SECRET: "mysql-integration-session-secret-32-bytes",
    UPLOAD_DIRECTORY: path.join(temporary, "uploads"),
  };

  console.log("MYSQL INTEGRATION: migration, schema, dan seed");
  const firstMigration = run("scripts/migrate-mysql.mjs", common);
  assert.match(firstMigration, /Migrasi diterapkan: 009_order_idempotency.sql/);
  const secondMigration = run("scripts/migrate-mysql.mjs", common);
  assert.match(secondMigration, /Sudah diterapkan: 001_mysql.sql/);
  run("scripts/verify-mysql-schema.mjs", common);
  run("scripts/seed.mjs", common);

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBinary = path.join(
    root,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  let serverOutput = "";
  web = spawn(
    process.execPath,
    [nextBinary, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: { ...process.env, ...common, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const append = (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-20000);
  };
  web.stdout.on("data", append);
  web.stderr.on("data", append);
  console.log("MYSQL INTEGRATION: menunggu HTTP readiness");
  await waitForReady(origin, () => serverOutput);
  console.log("MYSQL INTEGRATION: HTTP readiness PASS");
  run("scripts/http-smoke.mjs", { ...common, SMOKE_ORIGIN: origin });

  const binaryDirectory = database
    ? path.join(
        os.tmpdir(),
        "mysqlmsn",
        "binaries",
        database.mysql.version,
        "mysql",
        "bin",
      )
    : undefined;
  const backupDirectory = path.join(temporary, "backups");
  const backup = run("scripts/backup-mysql.mjs", {
    ...common,
    BACKUP_DIRECTORY: backupDirectory,
    MYSQLDUMP_BINARY:
      process.env.MYSQLDUMP_BINARY ||
      (binaryDirectory ? path.join(binaryDirectory, "mysqldump") : "mysqldump"),
  })
    .split("\n")
    .at(-1);
  assert.ok(fs.existsSync(backup));
  assert.ok(fs.existsSync(backup + ".sha256"));

  console.log("MYSQL INTEGRATION: membuat database target restore");
  const admin = await mysql.createConnection(sourceUrl);
  await admin.query(
    "CREATE DATABASE warkost_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  await admin.end();
  const restoreUrlObject = new URL(sourceUrl);
  restoreUrlObject.pathname = "/warkost_restore";
  const restoreUrl = restoreUrlObject.toString();
  run("scripts/restore-mysql.mjs", {
    ...common,
    DATABASE_URL: restoreUrl,
    MYSQL_BINARY:
      process.env.MYSQL_BINARY ||
      (binaryDirectory ? path.join(binaryDirectory, "mysql") : "mysql"),
  });

  console.log("MYSQL INTEGRATION: verifikasi parity record");
  const source = await mysql.createConnection(sourceUrl);
  const restored = await mysql.createConnection(restoreUrl);
  try {
    for (const table of requiredMysqlTables) {
      const [sourceRows] = await source.query(
        `SELECT COUNT(*) count FROM \`${table}\``,
      );
      const [restoredRows] = await restored.query(
        `SELECT COUNT(*) count FROM \`${table}\``,
      );
      assert.equal(restoredRows[0].count, sourceRows[0].count, table);
    }
    const [loyalty] = await restored.query(
      "SELECT COUNT(*) count FROM loyalty_transactions WHERE kind='EARN'",
    );
    assert.equal(loyalty[0].count, 1);
  } finally {
    await source.end();
    await restored.end();
  }
  console.log(
    `MYSQL INTEGRATION PASS: MySQL ${mysqlVersion}, migrations, HTTP E2E, backup, restore, record parity`,
  );
} finally {
  await stopWeb();
  if (database) await database.stop();
  fs.rmSync(temporary, { recursive: true, force: true });
}
