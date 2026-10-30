// Explicit opt-in integration check. Uses the existing ephemeral MySQL test
// binary; never uses an inherited DATABASE_URL or an existing database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { localMysqlFixture } from "../tests/helpers/local-mysql-fixture.mjs";
import mysql from "mysql2/promise";
let database, connection;
try {
  const binaryIndex = process.argv.indexOf("--mysqld");
  database = await localMysqlFixture(
    binaryIndex < 0 ? null : process.argv[binaryIndex + 1],
  );
  connection = await mysql.createConnection({
    host: "127.0.0.1",
    port: database.port,
    user: database.username,
    database: database.dbName,
    password: "",
  });
  await connection.execute(
    "CREATE TABLE auth_attempts(attempt_key CHAR(64) PRIMARY KEY,count INT UNSIGNED NOT NULL,window_until BIGINT NOT NULL,INDEX idx_auth_attempts_window(window_until)) ENGINE=InnoDB",
  );
  process.env.DATABASE_URL = `mysql://${database.username}:@127.0.0.1:${database.port}/${database.dbName}`;
  const store = await import("../lib/store.mjs");
  const { recordAttempt, cleanupAuthAttempts } =
    await import("../lib/rate-limit.mjs");
  try {
    assert.equal(await recordAttempt("login", "first", 12, 1000), true);
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        recordAttempt("login", "same", 12, 1000),
      ),
    );
    assert.equal(results.filter(Boolean).length, 12);
    for (let i = 0; i < 10; i++)
      assert.equal(await recordAttempt("login", "same", 12, 1000), false);
    assert.equal(await recordAttempt("login", "same", 12, 61000), false);
    assert.equal(await recordAttempt("login", "same", 12, 61001), true);
    assert.equal(await recordAttempt("login", "independent", 12, 1000), true);
    const independent = await Promise.all(
      ["a", "b", "c"].map(
        async (key) =>
          (
            await Promise.all(
              Array.from({ length: 30 }, () =>
                recordAttempt("login", key, 12, 2000),
              ),
            )
          ).filter(Boolean).length,
      ),
    );
    assert.deepEqual(independent, [12, 12, 12]);
    assert.equal(
      (await cleanupAuthAttempts({ now: 61001, limit: 1 })).changes,
      1,
    );
    // Reused pooled connections must not leak LAST_INSERT_ID between buckets.
    for (let i = 0; i < 15; i++)
      assert.equal(await recordAttempt("login", `new-${i}`, 12, 70000), true);

    await connection.execute(
      "CREATE TABLE users(id INT PRIMARY KEY AUTO_INCREMENT,name VARCHAR(80),email VARCHAR(255),phone VARCHAR(30),role VARCHAR(20),active INT,password_hash VARCHAR(255)) ENGINE=InnoDB",
    );
    await connection.execute(
      "CREATE TABLE sessions(token_hash CHAR(64) PRIMARY KEY,user_id INT,expires_at BIGINT,revoked_at DATETIME NULL) ENGINE=InnoDB",
    );
    process.env.SESSION_SECRET = "local-mysql-auth-fixture-more-than-32-bytes";
    const auth = await import("../lib/auth.mjs");
    const { authenticateCustomer } = await import("../lib/customer-auth.mjs");
    const password = "Local-MySQL#2026";
    const hash = auth.hashPassword(password);
    await store.run(
      "INSERT INTO users(name,email,role,active,password_hash) VALUES(?,?,'CUSTOMER',1,?)",
      "Local",
      "mysql@example.test",
      hash,
    );
    const account = await authenticateCustomer("mysql@example.test", password);
    const token = await auth.issueSessionForAuthenticatedAccount(account);
    const request = { cookies: { get: () => ({ value: token }) } };
    assert.equal((await auth.currentUser(request)).id, account.id);
    await store.run(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?",
      account.id,
    );
    assert.equal(await auth.currentUser(request), null);
    await store.run("UPDATE users SET active=0 WHERE id=?", account.id);
    await assert.rejects(() =>
      auth.issueSessionForAuthenticatedAccount(account),
    );
    await store.run(
      "UPDATE users SET active=1,password_hash=? WHERE id=?",
      auth.hashPassword("Changed-Password#2026"),
      account.id,
    );
    await assert.rejects(() =>
      auth.issueSessionForAuthenticatedAccount(account),
    );
    await store.run(
      "UPDATE users SET password_hash=? WHERE id=?",
      hash,
      account.id,
    );
    // MySQL default text collation is case-insensitive. A byte-different
    // password hash must invalidate the previously verified account snapshot.
    await store.run(
      "UPDATE users SET password_hash=UPPER(password_hash) WHERE id=?",
      account.id,
    );
    await assert.rejects(() =>
      auth.issueSessionForAuthenticatedAccount(account),
    );
    await store.run(
      "UPDATE users SET password_hash=? WHERE id=?",
      hash,
      account.id,
    );
    // Execute the baseline's exact limiter protocol, on this same disposable
    // MySQL, without changing any durability setting. No simulated fsync claim.
    async function legacyAttempt(identifier, now) {
      const key = crypto
        .createHash("sha256")
        .update(`login:${identifier}`)
        .digest("hex");
      return store.transaction(async (tx) => {
        await tx.run(
          "INSERT OR IGNORE INTO auth_attempts(attempt_key,count,window_until) VALUES(?,0,?)",
          key,
          now + 60000,
        );
        const row = await tx.get(
          "SELECT count,window_until FROM auth_attempts WHERE attempt_key=? FOR UPDATE",
          key,
        );
        const count = now > row.window_until ? 1 : row.count + 1;
        await tx.run(
          "UPDATE auth_attempts SET count=?,window_until=? WHERE attempt_key=?",
          count,
          now > row.window_until ? now + 60000 : row.window_until,
          key,
        );
        return count <= 12;
      });
    }
    const { performance } = await import("node:perf_hooks");
    const metrics = {};
    const median = (values) =>
      Number(
        values
          .toSorted((a, b) => a - b)
          [Math.floor(values.length / 2)].toFixed(3),
      );
    for (const phase of ["before", "after"]) {
      const rows = {
        rateLimit: [],
        passwordVerify: [],
        sessionCreation: [],
        loginPipeline: [],
      };
      for (let i = 0; i < 8; i++) {
        const start = performance.now();
        const rateStart = performance.now();
        const allowed =
          phase === "before"
            ? await legacyAttempt("legacy-benchmark", 1000)
            : await recordAttempt("login", "mysql-benchmark", 12, 1000);
        assert.equal(allowed, true);
        const rate = performance.now() - rateStart;
        const user = await store.get(
          "SELECT * FROM users WHERE email=?",
          "mysql@example.test",
        );
        const verifyStart = performance.now();
        assert.equal(
          await (phase === "before"
            ? auth.checkPassword(password, user.password_hash)
            : auth.checkPasswordAsync(password, user.password_hash)),
          true,
        );
        const verify = performance.now() - verifyStart;
        const issueStart = performance.now();
        await (phase === "before"
          ? auth.issueSession(user)
          : auth.issueSessionForAuthenticatedAccount(user));
        const issue = performance.now() - issueStart;
        if (i) {
          rows.rateLimit.push(rate);
          rows.passwordVerify.push(verify);
          rows.sessionCreation.push(issue);
          rows.loginPipeline.push(performance.now() - start);
        }
      }
      metrics[phase] = Object.fromEntries(
        Object.entries(rows).map(([key, values]) => [key, median(values)]),
      );
    }
    const fs = await import("node:fs");
    fs.writeFileSync(
      ".uat/auth-path-mysql-benchmark.json",
      JSON.stringify(
        {
          scope:
            "Disposable local MySQL; 7 warm medians; modeled login pipeline, not HTTP or VPS; durability settings unchanged",
          metricsMs: metrics,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        localMysqlBenchmarkMs: metrics,
        sessionInsertSelectAndJoin: "PASS",
        accountMutationGuard: "PASS",
      }),
    );
    const [[version]] = await connection.query(
      "SELECT VERSION() version,@@innodb_flush_log_at_trx_commit flushCommit,@@sync_binlog syncBinlog,@@innodb_doublewrite doublewrite,@@general_log generalLog",
    );
    assert.equal(version.flushCommit, 1);
    assert.equal(version.syncBinlog, 1);
    assert.equal(version.doublewrite, "ON");
    assert.equal(version.generalLog, 0);
    console.log(
      JSON.stringify({
        result: "PASS",
        mysqlVersion: version.version,
        durability: {
          innodbFlushLogAtTrxCommit: version.flushCommit,
          syncBinlog: version.syncBinlog,
          doublewrite: version.doublewrite,
        },
        generalQueryLog: version.generalLog,
        sameKeyRequests: 100,
        allowed: 12,
        independentKeysAllowed: independent,
        saturatedDenials: 10,
        windowBoundary: "PASS",
        boundedCleanup: "PASS",
        pooledDecisionIsolation: "PASS",
      }),
    );
  } finally {
    await store.close();
  }
} finally {
  if (connection) await connection.end();
  if (database) await database.stop();
}
