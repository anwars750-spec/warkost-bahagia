import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createMysqlDefaultsFile,
  loadMysqlMigrations,
  parseMysqlUrl,
} from "../lib/mysql-operations.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("migration MySQL memiliki urutan dan checksum stabil", () => {
  const migrations = loadMysqlMigrations();
  assert.equal(migrations.length, 23);
  assert.equal(migrations[0].version, "001_mysql.sql");
  assert.equal(migrations.at(-1).version, "023_customer_cart_item_notes.sql");
  assert.ok(
    migrations.every(({ checksum }) => /^[0-9a-f]{64}$/.test(checksum)),
  );
  assert.equal(new Set(migrations.map(({ checksum }) => checksum)).size, 23);
});

test("DATABASE_URL MySQL diparsing tanpa kehilangan karakter kredensial", () => {
  assert.deepEqual(
    parseMysqlUrl(
      "mysql://user%40cafe:p%40ss%3Aword@db.example:3307/warkost?ssl-mode=REQUIRED",
    ),
    {
      host: "db.example",
      port: 3307,
      user: "user@cafe",
      password: "p@ss:word",
      database: "warkost",
      sslMode: "REQUIRED",
    },
  );
  assert.throws(() => parseMysqlUrl("postgres://db/warkost"), /mysql/);
  assert.throws(
    () => parseMysqlUrl("mysql://user@db/a/b"),
    /satu nama database/,
  );
});

test("file kredensial MySQL berizin terbatas dan dapat dibersihkan", () => {
  const credentials = createMysqlDefaultsFile(
    parseMysqlUrl("mysql://user:secret@127.0.0.1/warkost"),
  );
  assert.equal(fs.existsSync(credentials.file), true);
  if (process.platform !== "win32")
    assert.equal(fs.statSync(credentials.file).mode & 0o777, 0o600);
  assert.match(fs.readFileSync(credentials.file, "utf8"), /password="secret"/);
  const directory = path.dirname(credentials.file);
  credentials.cleanup();
  assert.equal(fs.existsSync(directory), false);
});

test("backup MySQL membuat checksum dan menolak output dump yang tidak valid", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "warkost-mysql-backup-test-"),
  );
  try {
    const backupScript = path.join(
      projectRoot,
      "scripts",
      "backup-mysql.mjs",
    );
    const restoreScript = path.join(
      projectRoot,
      "scripts",
      "restore-mysql.mjs",
    );
    const fixtureRunner = path.join(directory, "mysqldump-fixture-runner.mjs");
    fs.writeFileSync(
      fixtureRunner,
      `import fs from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";

childProcess.spawnSync = (_command, _args, options) => {
  const output = fs.readFileSync(process.env.MYSQLDUMP_FIXTURE_FILE);
  fs.writeSync(options.stdio[1], output);
  return { status: 0, signal: null, error: undefined, stderr: "" };
};
syncBuiltinESMExports();
await import(pathToFileURL(process.env.BACKUP_SCRIPT_PATH).href);
`,
    );
    const valid = path.join(directory, "valid-dump.sql");
    fs.writeFileSync(
      valid,
      "-- MySQL dump 8.0\n-- Host: test\nCREATE TABLE users(id BIGINT);\n",
    );
    const env = {
      ...process.env,
      DATABASE_URL: "mysql://user:secret@127.0.0.1/warkost",
      BACKUP_DIRECTORY: path.join(directory, "backups"),
      MYSQLDUMP_BINARY: "mysqldump-test-fixture",
      MYSQLDUMP_FIXTURE_FILE: valid,
      BACKUP_SCRIPT_PATH: backupScript,
    };
    const result = spawnSync(process.execPath, [fixtureRunner], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0, result.stderr);
    const backup = result.stdout.trim();
    assert.ok(fs.existsSync(backup + ".sha256"));
    if (process.platform !== "win32")
      assert.equal(fs.statSync(backup).mode & 0o777, 0o600);

    fs.writeFileSync(backup + ".sha256", "0".repeat(64) + "\n");
    const restore = spawnSync(
      process.execPath,
      [restoreScript, backup],
      { encoding: "utf8", env },
    );
    assert.notEqual(restore.status, 0);
    assert.match(restore.stderr, /Checksum backup MySQL tidak cocok/);

    const invalid = path.join(directory, "invalid-dump.sql");
    fs.writeFileSync(invalid, "not a database dump");
    const rejected = spawnSync(process.execPath, [fixtureRunner], {
      encoding: "utf8",
      env: { ...env, MYSQLDUMP_FIXTURE_FILE: invalid },
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Output mysqldump tidak valid/);
    assert.equal(
      fs
        .readdirSync(env.BACKUP_DIRECTORY)
        .some((file) => file.endsWith(".partial")),
      false,
    );
  } finally {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: process.platform === "win32" ? 8 : 2,
      retryDelay: 100,
    });
  }
});
