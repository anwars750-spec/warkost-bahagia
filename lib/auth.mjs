import { authStage } from "./auth-timing.mjs";
import crypto from "node:crypto";
import * as store from "./store.mjs";
import { isFinalRole } from "./rbac.mjs";
import { isGuestEmail } from "./customer-kind.mjs";
export function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!value || Buffer.byteLength(value) < 32)
  )
    throw Error("SESSION_SECRET harus diisi minimal 32 byte pada produksi");
  return value || "development-only-secret-change-before-deploy";
}
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
}
// Same salt, scrypt parameters and stored format as hashPassword. Keep
// registration crypto off the event loop and outside database write locks.
export async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
  return salt + ":" + hash.toString("hex");
}
export function checkPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      crypto.scryptSync(password, salt, 64),
    );
  } catch {
    return false;
  }
}
// Legacy format and default scrypt work factor remain identical. Malformed
// hashes fail closed; valid derived keys always use timingSafeEqual.
export async function checkPasswordAsync(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const derived = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (error, key) =>
        error ? reject(error) : resolve(key),
      );
    });
    const expected = Buffer.from(hash, "hex");
    return (
      expected.length === derived.length &&
      crypto.timingSafeEqual(expected, derived)
    );
  } catch {
    return false;
  }
}

const fingerprint = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export async function revokeSession(request) {
  const token = request.cookies.get("wb_session")?.value;
  if (token)
    await store.run(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL",
      fingerprint(token),
    );
}
export async function issueSession(user, transaction = store) {
  const account = await authStage("session.account_check", () =>
    transaction.get("SELECT id,role,active FROM users WHERE id=?", user?.id),
  );
  if (
    !account ||
    account.active !== 1 ||
    account.role !== user?.role ||
    !isFinalRole(account.role)
  )
    throw Error("Sesi hanya dapat dibuat untuk akun aktif");
  const token = signedSessionToken(user);
  await authStage("session.insert", () =>
    transaction.run(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      fingerprint(token),
      user.id,
      Date.now() + 7 * 86400000,
    ),
  );
  return token;
}
function signedSessionToken(user) {
  const key = sessionSecret();
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      role: user.role,
      exp: Date.now() + 7 * 86400000,
    }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("base64url");
  const token = payload + "." + sig;
  return token;
}

// Internal server-only contract: caller has just checked the password against
// account.password_hash returned by the authoritative users lookup. The same
// hash, role and active flag are rechecked atomically INSIDE the INSERT SELECT,
// so a password/role/deactivation change during async scrypt prevents issuance.
// MySQL may use a case-insensitive default collation: compare the hash bytes.
// This helper is never an API action and never accepts request body objects.
export async function issueSessionForAuthenticatedAccount(account) {
  if (
    !account ||
    account.active !== 1 ||
    !isFinalRole(account.role) ||
    typeof account.password_hash !== "string"
  )
    throw Error("Sesi hanya dapat dibuat untuk akun aktif");
  const token = signedSessionToken(account);
  const result = await authStage("login.session_insert", () =>
    store.run(
      `INSERT INTO sessions(token_hash,user_id,expires_at)
     SELECT ?,id,? FROM users WHERE id=? AND active=1 AND role=? AND ${store.isMySQL() ? "BINARY password_hash" : "password_hash"}=?`,
      fingerprint(token),
      Date.now() + 7 * 86400000,
      account.id,
      account.role,
      account.password_hash,
    ),
  );
  if (result.changes !== 1)
    throw Error("Sesi hanya dapat dibuat untuk akun aktif");
  return token;
}

export async function currentUser(request) {
  const token = request.cookies.get("wb_session")?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  const key = sessionSecret();
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("base64url");
  if (
    Buffer.byteLength(sig) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (
    !Number.isSafeInteger(parsed.id) ||
    !Number.isSafeInteger(parsed.exp) ||
    parsed.exp < Date.now()
  )
    return null;
  const user = await authStage("session.lookup_join", () =>
    store.get(
      `SELECT u.id,u.name,u.email,u.role,u.active FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.user_id=?`,
      fingerprint(token),
      Date.now(),
      parsed.id,
    ),
  );
  if (
    !user ||
    user.role !== parsed.role ||
    user.active !== 1 ||
    !isFinalRole(user.role)
  )
    return null;
  const { active, ...publicUser } = user;
  return { ...publicUser, isGuest: isGuestEmail(publicUser.email) };
}
