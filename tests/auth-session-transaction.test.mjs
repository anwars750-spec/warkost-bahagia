import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
process.env.DATABASE_URL = "mysql://fixture:fixture@127.0.0.1:1/fixture";
process.env.SESSION_SECRET = "transaction-session-fixture-more-than-32-bytes";
process.env.OTP_SECRET = "transaction-otp-fixture-more-than-32-bytes";
const original = mysql.createPool;
let pooled = 0,
  acquired = 0,
  pools = 0,
  active = 0,
  queries = 0;
const code = "103759";
const connection = {
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release() {},
  async execute(sql) {
    queries++;
    if (sql.startsWith("SELECT c.*"))
      return [
        [
          {
            id: 1,
            user_id: 1,
            name: "Fixture",
            email: "fixture@example.test",
            role: "CUSTOMER",
            active,
            otp_hash: crypto
              .createHmac("sha256", process.env.OTP_SECRET)
              .update(`1:REGISTRATION:${code}`)
              .digest("hex"),
            attempts: 0,
            expires_at: Date.now() + 60000,
            consumed_at: null,
          },
        ],
        [],
      ];
    if (sql.startsWith("UPDATE users SET active=1")) active = 1;
    if (sql.startsWith("SELECT id,role,active"))
      return [[{ id: 1, role: "CUSTOMER", active }], []];
    return [{ affectedRows: 1, insertId: 1 }, []];
  },
};
mysql.createPool = () => {
  pools++;
  return {
    on() {},
    execute(...args) {
      pooled++;
      return connection.execute(...args);
    },
    async getConnection() {
      acquired++;
      return connection;
    },
    async end() {},
  };
};
const store = await import("../lib/store.mjs");
const { issueSession } = await import("../lib/auth.mjs");
const { verifyRegistrationOtp } = await import("../lib/otp.mjs");
after(async () => {
  await store.close();
  mysql.createPool = original;
});
test("activation/session use one MySQL checkout while retaining the active-account query", async () => {
  const legacy = await verifyRegistrationOtp({ challengeId: "fixture", code });
  await issueSession(legacy.user);
  assert.equal(acquired, 1);
  assert.equal(pooled, 2);
  const legacyQueries = queries;
  acquired = 0;
  pooled = 0;
  queries = 0;
  active = 0;
  const result = await verifyRegistrationOtp(
    { challengeId: "fixture", code },
    Date.now(),
    { createSession: true },
  );
  assert.equal(typeof result.sessionToken === "string", true);
  assert.equal(acquired, 1);
  assert.equal(pooled, 0);
  assert.equal(queries, legacyQueries);
  assert.equal(pools, 1);
});
