import crypto from "node:crypto";
import * as store from "./store.mjs";
import { normalizeCustomerPhone } from "./account.mjs";

// Keys must follow the field actually consumed by that action. In particular,
// an unrelated challengeId must never select a login bucket.
export function authAttemptIdentifier(action, body) {
  let value;
  if (action === "login" || action === "password-reset-request") {
    value = String(body.identifier || body.email || "")
      .trim()
      .toLowerCase();
    if (!value.includes("@")) {
      try {
        value = normalizeCustomerPhone(value);
      } catch {}
    }
  } else if (["otp-verify", "otp-resend"].includes(action)) {
    value = body.challengeId || "";
  } else if (action === "password-reset") {
    // Retain the existing coarse reset-completion bucket. Unused request
    // fields cannot rotate it, and reset tokens never become diagnostic data.
    value = "";
  } else if (action === "register") {
    value = body.email || "";
  } else {
    value = body.name || "";
  }
  return String(value).trim().toLowerCase().slice(0, 255);
}

export async function recordAttempt(
  purpose,
  identifier,
  maxCount,
  now = Date.now(),
) {
  if (
    !Number.isSafeInteger(maxCount) ||
    maxCount < 1 ||
    maxCount >= 2147483647 ||
    !Number.isSafeInteger(now)
  )
    throw Error("Invalid rate-limit policy");
  const key = crypto
    .createHash("sha256")
    .update(`${purpose}:${identifier}`)
    .digest("hex");
  if (store.isMySQL()) {
    // InnoDB serializes duplicate-key updates on the bucket's primary key.
    // LAST_INSERT_ID(expr) returns THIS statement's decision through its OK
    // packet, not a racy SELECT on a different pooled connection. Both INSERT
    // and UPDATE explicitly set it, including denied/no-change requests.
    const result = await store.run(
      `INSERT INTO auth_attempts(attempt_key,count,window_until) VALUES(?,LAST_INSERT_ID(1),?)
       ON DUPLICATE KEY UPDATE
       count=LAST_INSERT_ID(IF(window_until<?,1,LEAST(count+1,?))),
       window_until=IF(window_until<?,?,window_until)`,
      key,
      now + 60_000,
      now,
      maxCount + 1,
      now,
      now + 60_000,
    );
    const count = result.lastInsertRowid;
    // Unexpected/missing adapter metadata fails closed.
    return Number.isSafeInteger(count) && count >= 1 && count <= maxCount;
  }
  const row = await store.get(
    `INSERT INTO auth_attempts(attempt_key,count,window_until) VALUES(?,1,?)
     ON CONFLICT(attempt_key) DO UPDATE SET
       count=CASE WHEN auth_attempts.window_until<? THEN 1 ELSE MIN(auth_attempts.count+1,?) END,
       window_until=CASE WHEN auth_attempts.window_until<? THEN ? ELSE auth_attempts.window_until END
     RETURNING count`,
    key,
    now + 60_000,
    now,
    maxCount + 1,
    now,
    now + 60_000,
  );
  return (
    Number.isSafeInteger(row?.count) && row.count >= 1 && row.count <= maxCount
  );
}

// Deliberately not called from requests. Rows do not expire logically until
// window_until < now, so deleting ONLY expired rows cannot reset a live bucket.
// Operators can invoke this bounded helper during existing maintenance windows.
export async function cleanupAuthAttempts({
  now = Date.now(),
  limit = 500,
} = {}) {
  if (
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    throw Error("Invalid cleanup bound");
  return store.isMySQL()
    ? store.run(
        "DELETE FROM auth_attempts WHERE window_until<? LIMIT ?",
        now,
        limit,
      )
    : store.run(
        "DELETE FROM auth_attempts WHERE attempt_key IN (SELECT attempt_key FROM auth_attempts WHERE window_until<? LIMIT ?)",
        now,
        limit,
      );
}
