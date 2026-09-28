import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

function run(extraEnv = {}) {
  return spawnSync(
    process.execPath,
    ["scripts/owner-demo.mjs", "--prepare-only"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        DEPLOYMENT_ENV: "",
        OWNER_DEMO_PASSWORD: "owner-demo-password",
        ...extraEnv,
      },
      encoding: "utf8",
    },
  );
}

test("owner demo membuat database baru yang siap dan terisolasi", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const marker = result.stdout
    .split("\n")
    .find((line) => line.startsWith("OWNER_DEMO_READY "));
  assert.ok(marker, result.stdout);
  const evidence = JSON.parse(marker.slice("OWNER_DEMO_READY ".length));
  assert.ok(
    evidence.directory.startsWith(
      path.join(os.tmpdir(), "warkost-owner-demo-"),
    ),
  );
  assert.equal(evidence.url, "http://127.0.0.1:3000");
  assert.equal(evidence.roles.length, 3);

  const database = new DatabaseSync(evidence.databasePath, { readOnly: true });
  try {
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) total FROM users WHERE role IN ('CUSTOMER','ADMIN','DRIVER')",
        )
        .get().total,
      3,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) total FROM orders").get().total,
      0,
    );
  } finally {
    database.close();
    fs.rmSync(evidence.directory, { recursive: true, force: true });
  }
});

test("owner demo menolak koneksi database eksternal", () => {
  const result = run({ DATABASE_URL: "mysql://example.invalid/warkost" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /menolak DATABASE_URL/);
});

test("owner demo memvalidasi password dan port", () => {
  const password = run({ OWNER_DEMO_PASSWORD: "pendek" });
  assert.notEqual(password.status, 0);
  assert.match(password.stderr, /minimal 10 karakter/);

  const port = run({ OWNER_DEMO_PORT: "80" });
  assert.notEqual(port.status, 0);
  assert.match(port.stderr, /1024-65535/);
});
