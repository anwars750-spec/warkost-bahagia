import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createMysqlDefaultsFile,
  loadMysqlMigrations,
  parseMysqlUrl,
} from "../lib/mysql-operations.mjs";

test("migration MySQL memiliki urutan dan checksum stabil", () => {
  const migrations = loadMysqlMigrations();
  assert.equal(migrations.length, 17);
  assert.equal(migrations[0].version, "001_mysql.sql");
  assert.equal(migrations.at(-1).version, "017_customer_otp_email.sql");
  assert.ok(
    migrations.every(({ checksum }) => /^[0-9a-f]{64}$/.test(checksum)),
  );
  assert.equal(new Set(migrations.map(({ checksum }) => checksum)).size, 17);
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
    const valid = path.join(directory, "valid-dump.mjs");
    fs.writeFileSync(
      valid,
      "#!/usr/bin/env node\nprocess.stdout.write('-- MySQL dump 8.0\\n-- Host: test\\nCREATE TABLE users(id BIGINT);\\n');\n",
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      DATABASE_URL: "mysql://user:secret@127.0.0.1/warkost",
      BACKUP_DIRECTORY: path.join(directory, "backups"),
      MYSQLDUMP_BINARY: valid,
    };
    const result = spawnSync(process.execPath, ["scripts/backup-mysql.mjs"], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0, result.stderr);
    const backup = result.stdout.trim();
    assert.ok(fs.existsSync(backup + ".sha256"));
    assert.equal(fs.statSync(backup).mode & 0o777, 0o600);

    fs.writeFileSync(backup + ".sha256", "0".repeat(64) + "\n");
    const restore = spawnSync(
      process.execPath,
      ["scripts/restore-mysql.mjs", backup],
      { encoding: "utf8", env },
    );
    assert.notEqual(restore.status, 0);
    assert.match(restore.stderr, /Checksum backup MySQL tidak cocok/);

    const invalid = path.join(directory, "invalid-dump.mjs");
    fs.writeFileSync(
      invalid,
      "#!/usr/bin/env node\nprocess.stdout.write('not a database dump');\n",
      { mode: 0o700 },
    );
    const rejected = spawnSync(process.execPath, ["scripts/backup-mysql.mjs"], {
      encoding: "utf8",
      env: { ...env, MYSQLDUMP_BINARY: invalid },
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
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
