import crypto from "node:crypto";
import * as store from "./store.mjs";
import { isFinalRole } from "./rbac.mjs";
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
export async function issueSession(user) {
  const account = await store.get(
    "SELECT id,role,active FROM users WHERE id=?",
    user?.id,
  );
  if (
    !account ||
    account.active !== 1 ||
    account.role !== user?.role ||
    !isFinalRole(account.role)
  )
    throw Error("Sesi hanya dapat dibuat untuk akun aktif");
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
  await store.run(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    fingerprint(token),
    user.id,
    Date.now() + 7 * 86400000,
  );
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
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(parsed.id) || parsed.exp < Date.now()) return null;
  const session = await store.get(
    "SELECT user_id FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
    fingerprint(token),
    Date.now(),
  );
  if (session?.user_id !== parsed.id) return null;
  const user = await store.get(
    "SELECT id,name,email,role,active FROM users WHERE id=?",
    parsed.id,
  );
  if (
    user?.role !== parsed.role ||
    user.active !== 1 ||
    !isFinalRole(user.role)
  )
    return null;
  const { active, ...publicUser } = user;
  return publicUser;
}
