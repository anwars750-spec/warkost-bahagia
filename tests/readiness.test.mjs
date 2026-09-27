import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateProductionConfig } from "../lib/readiness.mjs";

const valid = {
  NODE_ENV: "production",
  SESSION_SECRET: "x".repeat(32),
  DATABASE_PATH: "/srv/warkost/data/app.db",
  UPLOAD_DIRECTORY: "/srv/warkost/uploads",
  BACKUP_DIRECTORY: "/srv/warkost/backups",
};

test("production config menerima konfigurasi SQLite yang lengkap", () => {
  assert.deepEqual(validateProductionConfig(valid), []);
});

test("production config menolak secret lemah dan path relatif", () => {
  const errors = validateProductionConfig({
    ...valid,
    SESSION_SECRET: "pendek",
    DATABASE_PATH: "./data/app.db",
    UPLOAD_DIRECTORY: "./uploads",
  });
  assert.ok(errors.some((message) => message.includes("SESSION_SECRET")));
  assert.ok(errors.some((message) => message.includes("DATABASE_PATH")));
  assert.ok(errors.some((message) => message.includes("UPLOAD_DIRECTORY")));
});

test("production config menerima URI MySQL dan menolak lokasi backup yang sama", () => {
  const errors = validateProductionConfig({
    ...valid,
    DATABASE_PATH: undefined,
    DATABASE_URL: "mysql://user:password@db.local/warkost",
    BACKUP_DIRECTORY: valid.UPLOAD_DIRECTORY,
  });
  assert.deepEqual(errors, [
    "BACKUP_DIRECTORY harus berbeda dari UPLOAD_DIRECTORY",
  ]);
});

test("production preflight memeriksa database dan direktori operasional", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "warkost-preflight-"),
  );
  try {
    const result = spawnSync(process.execPath, ["scripts/preflight.mjs"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        SESSION_SECRET: "s".repeat(32),
        DATABASE_URL: "",
        DATABASE_PATH: path.join(directory, "app.db"),
        UPLOAD_DIRECTORY: path.join(directory, "uploads"),
        BACKUP_DIRECTORY: path.join(directory, "backups"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Production preflight lulus/);
    assert.ok(fs.existsSync(path.join(directory, "app.db")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
