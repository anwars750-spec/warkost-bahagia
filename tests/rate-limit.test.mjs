import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rate-test-")), "data.db");
const { db } = await import("../lib/db.mjs");
const { recordAttempt } = await import("../lib/rate-limit.mjs");

test("batas login tersimpan di database, terpisah per akun dan pulih setelah interval", async () => {
  for (let i = 0; i < 12; i++)
    assert.equal(await recordAttempt("login", "one@example.test", 12, 1000 + i), true);
  assert.equal(await recordAttempt("login", "one@example.test", 12, 1012), false);
  assert.equal(await recordAttempt("login", "two@example.test", 12, 1012), true);
  assert.equal(await recordAttempt("register", "one@example.test", 12, 1012), true);
  assert.equal(db().prepare("SELECT COUNT(*) n FROM auth_attempts").get().n, 3);
  assert.equal(await recordAttempt("login", "one@example.test", 12, 61_001), true);
});

test("permintaan bersamaan tidak melewati batas", async () => {
  const decisions = await Promise.all(
    Array.from({ length: 10 }, () => recordAttempt("profile", 42, 5, 100_000)),
  );
  assert.equal(decisions.filter(Boolean).length, 5);
  assert.equal(decisions.filter((result) => !result).length, 5);
});
