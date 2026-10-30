import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "auth-hardening-rate-")),
  "data.db",
);
const store = await import("../lib/store.mjs");
const { db } = await import("../lib/db.mjs");
const { recordAttempt, cleanupAuthAttempts, authAttemptIdentifier } =
  await import("../lib/rate-limit.mjs");

test("fixed-window boundary, isolation, saturation and many concurrent promises", async () => {
  for (let i = 0; i < 12; i++)
    assert.equal(await recordAttempt("login", "boundary", 12, 1000), true);
  assert.equal(await recordAttempt("login", "boundary", 12, 61000), false);
  assert.equal(await recordAttempt("login", "boundary", 12, 61001), true);
  assert.equal(await recordAttempt("register", "boundary", 12, 1000), true);
  assert.equal(await recordAttempt("login", "other", 12, 1000), true);
  const decisions = await Promise.all(
    Array.from({ length: 100 }, () =>
      recordAttempt("login", "concurrent", 12, 1000),
    ),
  );
  assert.equal(decisions.filter(Boolean).length, 12);
  const rows = await store.all("SELECT count FROM auth_attempts");
  assert.equal(
    rows.every((row) => row.count <= 13),
    true,
  );
});

test("independent worker connections cannot admit more than maxCount", async () => {
  await store.get("SELECT 1");
  const ready = new Int32Array(new SharedArrayBuffer(4));
  const source = `import {parentPort,workerData} from 'node:worker_threads';
 process.env.DATABASE_URL='';process.env.DATABASE_PATH=workerData.database;
 const store=await import(workerData.store);await store.get('SELECT 1');
 const {recordAttempt}=await import(workerData.limiter);
 parentPort.postMessage('ready');
 Atomics.wait(new Int32Array(workerData.barrier),0,0);
 const results=await Promise.all(Array.from({length:20},()=>recordAttempt('login','cross-worker',12,2000)));
 parentPort.postMessage(results.filter(Boolean).length);`;
  const workers = Array.from(
    { length: 4 },
    () =>
      new Worker(
        new URL("data:text/javascript," + encodeURIComponent(source)),
        {
          workerData: {
            database: process.env.DATABASE_PATH,
            store: new URL("../lib/store.mjs", import.meta.url).href,
            limiter: new URL("../lib/rate-limit.mjs", import.meta.url).href,
            barrier: ready.buffer,
          },
        },
      ),
  );
  try {
    const counts = workers.map(
      (worker) =>
        new Promise((resolve, reject) => {
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (code) reject(Error("Worker failed"));
          });
          worker.on("message", (message) => {
            if (message !== "ready") resolve(message);
          });
        }),
    );
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise((resolve, reject) => {
            worker.once("message", (message) =>
              message === "ready"
                ? resolve()
                : reject(Error("Worker not ready")),
            );
            worker.once("error", reject);
          }),
      ),
    );
    Atomics.store(ready, 0, 1);
    Atomics.notify(ready, 0, 4);
    assert.equal(
      (await Promise.all(counts)).reduce((sum, n) => sum + n, 0),
      12,
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
});

test("no cleanup on requests; explicit bounded cleanup retains live and boundary buckets", async () => {
  await store.run("DELETE FROM auth_attempts");
  await recordAttempt("login", "expired-a", 2, 0);
  await recordAttempt("login", "expired-b", 2, 0);
  await recordAttempt("login", "boundary", 2, 1);
  await recordAttempt("login", "live", 2, 60000);
  db().exec(
    "CREATE TRIGGER forbid_hot_cleanup BEFORE DELETE ON auth_attempts BEGIN SELECT RAISE(ABORT,'cleanup must be explicit'); END;",
  );
  assert.equal(await recordAttempt("login", "normal", 2, 700000), true);
  db().exec("DROP TRIGGER forbid_hot_cleanup");
  assert.equal(
    (await cleanupAuthAttempts({ now: 60001, limit: 1 })).changes,
    1,
  );
  assert.equal(
    (await cleanupAuthAttempts({ now: 60001, limit: 1000 })).changes,
    1,
  );
  assert.equal((await store.get("SELECT COUNT(*) n FROM auth_attempts")).n, 3);
  await assert.rejects(() => cleanupAuthAttempts({ limit: 1001 }));
});

test("unrelated body fields cannot rotate login/register buckets; phone aliases share a key", () => {
  assert.equal(
    authAttemptIdentifier("login", {
      identifier: " User@Example.test ",
      challengeId: "a",
    }),
    "user@example.test",
  );
  assert.equal(
    authAttemptIdentifier("login", {
      identifier: "User@Example.test",
      challengeId: "b",
    }),
    "user@example.test",
  );
  const aliases = ["081234567890", "+62 81234567890", "81234567890"];
  assert.equal(
    new Set(
      aliases.map((identifier) =>
        authAttemptIdentifier("login", { identifier }),
      ),
    ).size,
    1,
  );
  assert.equal(
    authAttemptIdentifier("register", {
      email: "a@example.test",
      challengeId: "rotate",
    }),
    "a@example.test",
  );
  assert.equal(
    authAttemptIdentifier("otp-verify", {
      challengeId: "real",
      identifier: "rotate",
    }),
    "real",
  );
});

test("reset completion retains its coarse bucket regardless of unused fields", () => {
  assert.equal(
    authAttemptIdentifier("password-reset", {
      challengeId: "rotate-a",
      identifier: "rotate-b",
      resetToken: "private",
    }),
    "",
  );
});
