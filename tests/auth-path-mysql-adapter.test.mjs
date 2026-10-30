import test, { after } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
process.env.DATABASE_URL = "mysql://fixture:fixture@127.0.0.1:1/fixture";
const original = mysql.createPool;
let decision = 1,
  calls = [];
mysql.createPool = () => ({
  on() {},
  async execute(sql, args) {
    calls.push({ sql, args });
    if (decision === "error") throw Error("Fixture storage unavailable");
    return [{ affectedRows: 1, insertId: decision }, []];
  },
  async getConnection() {
    throw Error("Limiter must not acquire an explicit transaction");
  },
  async end() {},
});
const store = await import("../lib/store.mjs");
const { recordAttempt } = await import("../lib/rate-limit.mjs");
after(async () => {
  await store.close();
  mysql.createPool = original;
});
test("MySQL limiter consumes atomic statement OK packet rather than affectedRows or follow-up SELECT", async () => {
  for (const [value, allowed] of [
    [1, true],
    [12, true],
    [13, false],
    [0, false],
    [undefined, false],
    ["1", false],
  ]) {
    decision = value;
    assert.equal(
      await recordAttempt("login", "private@example.test", 12, 1000),
      allowed,
    );
  }
  assert.equal(calls.length, 6);
  for (const { sql, args } of calls) {
    assert.match(sql, /ON DUPLICATE KEY UPDATE/);
    assert.match(sql, /LAST_INSERT_ID\(1\)/);
    assert.match(sql, /count=LAST_INSERT_ID/);
    assert.doesNotMatch(sql, /FOR UPDATE|DELETE|SELECT/);
    assert.match(args[0], /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(args).includes("private@example.test"), false);
  }
  decision = "error";
  await assert.rejects(
    () => recordAttempt("login", "private", 12, 1000),
    /storage unavailable/,
  );
});
