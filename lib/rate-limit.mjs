import crypto from "node:crypto";
import * as store from "./store.mjs";

let lastCleanup = 0;

export async function recordAttempt(purpose, identifier, maxCount, now = Date.now()) {
  const key = crypto.createHash("sha256").update(`${purpose}:${identifier}`).digest("hex");
  if (now - lastCleanup > 10 * 60_000) {
    await store.run("DELETE FROM auth_attempts WHERE window_until<?", now);
    lastCleanup = now;
  }
  return store.transaction(async (tx, mysql) => {
    await tx.run(
      "INSERT OR IGNORE INTO auth_attempts(attempt_key,count,window_until) VALUES(?,0,?)",
      key,
      now + 60_000,
    );
    const row = await tx.get(
      `SELECT count,window_until FROM auth_attempts WHERE attempt_key=?${mysql ? " FOR UPDATE" : ""}`,
      key,
    );
    const count = now > row.window_until ? 1 : row.count + 1;
    await tx.run(
      "UPDATE auth_attempts SET count=?,window_until=? WHERE attempt_key=?",
      count,
      now > row.window_until ? now + 60_000 : row.window_until,
      key,
    );
    return count <= maxCount;
  });
}
