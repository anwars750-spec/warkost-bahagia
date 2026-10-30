import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "auth-hardening-session-")),
  "data.db",
);
process.env.SESSION_SECRET = "auth-hardening-test-secret-more-than-32-bytes";
const store = await import("../lib/store.mjs");
const {
  hashPassword,
  checkPassword,
  checkPasswordAsync,
  issueSession,
  issueSessionForAuthenticatedAccount,
  currentUser,
} = await import("../lib/auth.mjs");
const { authenticateCustomer } = await import("../lib/customer-auth.mjs");
const { FINAL_ROLES } = await import("../lib/rbac.mjs");
const password = "Legacy-Test#2026",
  hash = hashPassword(password);
let serial = 0;
async function account(role = "CUSTOMER") {
  const email = `auth-${++serial}@example.test`;
  const result = await store.run(
    "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)",
    "Test",
    email,
    hash,
    role,
  );
  return store.get("SELECT * FROM users WHERE id=?", result.lastInsertRowid);
}
const request = (token) => ({ cookies: { get: () => ({ value: token }) } });
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
async function sessionCount() {
  return (await store.get("SELECT COUNT(*) n FROM sessions")).n;
}

test("async scrypt accepts unchanged legacy format/work factor and rejects wrong/malformed hashes", async () => {
  assert.equal(checkPassword(password, hash), true);
  assert.equal(await checkPasswordAsync(password, hash), true);
  assert.equal(await checkPasswordAsync("wrong", hash), false);
  for (const invalid of [null, "", "salt:00", "salt:not-hex"])
    assert.equal(await checkPasswordAsync(password, invalid), false);
});

test("all final roles authenticate and restore through one joined session lookup", async () => {
  for (const role of FINAL_ROLES) {
    const user = await account(role);
    const verified = await authenticateCustomer(user.email, password);
    const token = await issueSessionForAuthenticatedAccount(verified);
    const restored = await currentUser(request(token));
    assert.equal(restored?.id, user.id);
    assert.equal(restored?.role, role);
  }
});

test("wrong password/inactive account never create a session", async () => {
  const user = await account();
  const before = await sessionCount();
  await assert.rejects(
    () => authenticateCustomer(user.email, "wrong"),
    /password salah/,
  );
  await store.run("UPDATE users SET active=0 WHERE id=?", user.id);
  await assert.rejects(
    () => authenticateCustomer(user.email, password),
    /password salah/,
  );
  assert.equal(await sessionCount(), before);
});

test("atomic session INSERT rejects deactivation, role changes and password reset after password validation", async () => {
  for (const [sql, value] of [
    ["active", 0],
    ["role", "ADMIN"],
    ["password_hash", hashPassword("New-Password#2026")],
  ]) {
    const user = await account();
    const verified = await authenticateCustomer(user.email, password);
    const before = await sessionCount();
    await store.run(`UPDATE users SET ${sql}=? WHERE id=?`, value, user.id);
    await assert.rejects(
      () => issueSessionForAuthenticatedAccount(verified),
      /akun aktif/,
    );
    assert.equal(await sessionCount(), before);
  }
  await assert.rejects(() =>
    issueSessionForAuthenticatedAccount({
      id: 1,
      role: "NOT_A_ROLE",
      active: 1,
      password_hash: hash,
    }),
  );
});

test("session JOIN preserves revocation, DB expiry, user status/role, signature and payload expiry", async () => {
  const cases = [
    async (user, token) =>
      store.run(
        "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?",
        digest(token),
      ),
    async (user, token) =>
      store.run(
        "UPDATE sessions SET expires_at=? WHERE token_hash=?",
        Date.now() - 1,
        digest(token),
      ),
    async (user) => store.run("UPDATE users SET active=0 WHERE id=?", user.id),
    async (user) =>
      store.run("UPDATE users SET role='ADMIN' WHERE id=?", user.id),
  ];
  for (const change of cases) {
    const user = await account();
    const token = await issueSession(user);
    await change(user, token);
    assert.equal(await currentUser(request(token)), null);
  }
  const user = await account();
  const token = await issueSession(user);
  assert.equal(await currentUser(request(token + "x")), null);
  assert.equal(
    await currentUser(request(token.split(".")[0] + "." + "\u00e9".repeat(43))),
    null,
  );
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, role: user.role, exp: Date.now() - 1 }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  assert.equal(await currentUser(request(payload + "." + sig)), null);
});

test("password verification yields to unrelated work and state changes during scrypt fail session issuance", async () => {
  const user = await account();
  const original = crypto.scrypt;
  let release, entered;
  const ready = new Promise((resolve) => (entered = resolve));
  crypto.scrypt = (...args) => {
    const callback = args.pop();
    release = () => original(...args, callback);
    entered();
  };
  try {
    const pending = authenticateCustomer(user.email, password);
    await ready;
    await store.run("UPDATE users SET active=0 WHERE id=?", user.id);
    let ticked = false;
    await new Promise((resolve) =>
      setImmediate(() => {
        ticked = true;
        resolve();
      }),
    );
    assert.equal(ticked, true);
    release();
    const verified = await pending;
    await assert.rejects(
      () => issueSessionForAuthenticatedAccount(verified),
      /akun aktif/,
    );
  } finally {
    crypto.scrypt = original;
  }
});
