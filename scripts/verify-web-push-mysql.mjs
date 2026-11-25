// Explicit disposable native MySQL check. Never reads an existing DATABASE_URL.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { localMysqlFixture } from "../tests/helpers/local-mysql-fixture.mjs";
let fixture, connection;
try {
  const index = process.argv.indexOf("--mysqld");
  fixture = await localMysqlFixture(index < 0 ? null : process.argv[index + 1]);
  const url = `mysql://${fixture.username}:@127.0.0.1:${fixture.port}/${fixture.dbName}`;
  for (const script of [
    "scripts/migrate-mysql.mjs",
    "scripts/verify-mysql-schema.mjs",
  ]) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, DATABASE_URL: url },
      windowsHide: true,
      encoding: "utf8",
      timeout: 60000,
    });
    if (result.status !== 0)
      throw Error("Disposable MySQL migration/schema check failed");
  }
  connection = await mysql.createConnection({
    host: "127.0.0.1",
    port: fixture.port,
    user: fixture.username,
    password: "",
    database: fixture.dbName,
  });
  const [[count]] = await connection.query(
    "SELECT COUNT(*) n FROM schema_migrations",
  );
  assert.equal(count.n, 36);
  Object.assign(process.env, {
    DATABASE_URL: url,
    SESSION_SECRET: "native-push-fixture-secret-more-than-32-bytes",
  });
  const store = await import("../lib/store.mjs");
  const { issueSession } = await import("../lib/auth.mjs");
  const { savePushSubscription, removePushSubscription } =
    await import("../lib/push-subscriptions.mjs");
  try {
    const created = await store.run(
      "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,'CUSTOMER',1)",
      "Fixture",
      "push@example.test",
      "x",
    );
    const user = { id: created.lastInsertRowid, role: "CUSTOMER" };
    const token = await issueSession(user);
    const key = crypto.createECDH("prime256v1");
    key.generateKeys();
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/native-fixture",
      keys: {
        p256dh: key.getPublicKey().toString("base64url"),
        auth: crypto.randomBytes(16).toString("base64url"),
      },
    };
    for (let i = 0; i < 2; i++)
      await savePushSubscription(user, subscription, token);
    await savePushSubscription(
      user,
      {
        ...subscription,
        endpoint: subscription.endpoint.replace(
          "https://fcm.googleapis.com/",
          "https://FCM.GOOGLEAPIS.COM:443/",
        ),
      },
      token,
    );
    const row = await store.get("SELECT COUNT(*) n FROM push_subscriptions");
    assert.equal(row.n, 1);
    const sub = await store.get("SELECT id FROM push_subscriptions");
    const deliveryKey = crypto.randomBytes(32).toString("hex");
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.run(
          "INSERT OR IGNORE INTO push_deliveries(delivery_key,subscription_id) VALUES(?,?)",
          deliveryKey,
          sub.id,
        ),
      ),
    );
    assert.equal(results.filter((result) => result.changes === 1).length, 1);
    await removePushSubscription(user, subscription.endpoint);
    assert.notEqual(
      (await store.get("SELECT disabled_at FROM push_subscriptions"))
        .disabled_at,
      null,
    );
    console.log(
      JSON.stringify({
        result: "PASS",
        migrations: 35,
        subscriptionDuplicate: "PASS",
        concurrentDeliveryClaims: 20,
        allowedDeliveryClaims: 1,
        unsubscribe: "PASS",
      }),
    );
  } finally {
    await store.close();
  }
} finally {
  if (connection) await connection.end();
  if (fixture) await fixture.stop();
}
