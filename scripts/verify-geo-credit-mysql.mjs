import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { localMysqlFixture } from "../tests/helpers/local-mysql-fixture.mjs";

const execute = promisify(execFile);
const binaryIndex = process.argv.indexOf("--mysqld");
const fixture = await localMysqlFixture(
  binaryIndex < 0 ? null : process.argv[binaryIndex + 1],
);
const url = `mysql://${fixture.username}:@127.0.0.1:${fixture.port}/${fixture.dbName}`;
const env = { ...process.env, DATABASE_URL: url };
let store;
try {
  for (const script of [
    "scripts/migrate-mysql.mjs",
    "scripts/verify-mysql-schema.mjs",
  ])
    console.log(
      execFileSync(process.execPath, [script], {
        env,
        encoding: "utf8",
        timeout: 60_000,
        windowsHide: true,
      }).trim(),
    );
  process.env.DATABASE_URL = url;
  store = await import("../lib/store.mjs");
  await store.run(
    `INSERT INTO geo_credit_reservations(endpoint,credits,user_id,ip_hash,attempt_id,reserved_ms,finished_ms,outcome)
    VALUES('autocomplete',1199,999,'fixture',?,UNIX_TIMESTAMP()*1000-3000,UNIX_TIMESTAMP()*1000-3000,'SUCCESS')`,
    randomUUID(),
  );
  const child = `
    import { randomUUID } from "node:crypto";
    import { reserveGeoCredit, settleGeoCredit } from "./lib/geo-credit-brake.mjs";
    import { close } from "./lib/store.mjs";
    const count = Number(process.argv[1]);
    const results = await Promise.all(Array.from({length:count}, async () => {
      try {
        const id = await reserveGeoCredit({ endpoint:"autocomplete", userId:1, ipHash:"fixture", attemptId:randomUUID() });
        await settleGeoCredit(id,true);
        return "allowed";
      } catch(error) {
        if (!["CONSERVATION","DAILY_LIMIT"].includes(error.code)) throw error;
        return error.code;
      }
    }));
    console.log(JSON.stringify(results));
    await close();
  `;
  async function processRequests(count) {
    const { stdout } = await execute(
      process.execPath,
      ["--input-type=module", "-e", child, String(count)],
      { env, timeout: 30_000, windowsHide: true },
    );
    return JSON.parse(stdout);
  }
  const results = (
    await Promise.all([processRequests(50), processRequests(50)])
  ).flat();
  assert.equal(results.length, 100);
  assert.equal(results.filter((value) => value === "allowed").length, 1);
  const { geoUsage } = await import("../lib/geo-credit-brake.mjs");
  assert.equal((await geoUsage()).estimatedCredits.reserved, 1200);
  assert.deepEqual(await processRequests(1), ["CONSERVATION"]);
  await store.run(
    `INSERT INTO geo_credit_reservations(endpoint,credits,user_id,ip_hash,attempt_id,reserved_ms,finished_ms,outcome)
    VALUES('autocomplete',300,999,'fixture',?,UNIX_TIMESTAMP()*1000-3000,UNIX_TIMESTAMP()*1000-3000,'SUCCESS')`,
    randomUUID(),
  );
  assert.deepEqual(await processRequests(1), ["DAILY_LIMIT"]);
  assert.equal((await geoUsage()).estimatedCredits.reserved, 1500);
  console.log(
    "Native MySQL PASS: 100 reservations across two processes, restart persistence, conservation and 1500-credit hard stop.",
  );
} finally {
  if (store) await store.close();
  await fixture.stop();
}
