import crypto from "node:crypto";
import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { PUSH_ROLES } from "./web-push-config.mjs";
export function requirePushUser(user) {
  if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
  if (!PUSH_ROLES.includes(user.role))
    throw new DomainError(
      "Notifikasi perangkat belum tersedia untuk role ini",
      403,
    );
  return user;
}
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export function validatePushEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048)
    throw new DomainError("Subscription tidak valid");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("Subscription tidak valid");
  }
  const host = url.hostname.toLowerCase();
  // Browser-owned push services only: prevent authenticated endpoint SSRF.
  const allowed =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  if (
    !allowed ||
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new DomainError("Layanan push tidak didukung");
  return url.href;
}
function keyBytes(value, length) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    Buffer.from(value, "base64url").length !== length
  )
    throw new DomainError("Kunci subscription tidak valid");
  return value;
}
export function validatePushSubscription(input) {
  const endpoint = validatePushEndpoint(input?.endpoint);
  const p256dh = keyBytes(input?.keys?.p256dh, 65);
  const auth = keyBytes(input?.keys?.auth, 16);
  try {
    crypto.ECDH.convertKey(Buffer.from(p256dh, "base64url"), "prime256v1");
  } catch {
    throw new DomainError("Kunci subscription tidak valid");
  }
  return { endpoint, p256dh, auth };
}
export async function savePushSubscription(user, input, token) {
  requirePushUser(user);
  const data = validatePushSubscription(input);
  const tokenHash = digest(String(token || ""));
  return store.transaction(async (tx, mysql) => {
    const session = await tx.get(
      "SELECT user_id FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
      tokenHash,
      Date.now(),
    );
    if (Number(session?.user_id) !== Number(user.id))
      throw new DomainError("Sesi tidak valid", 401);
    const key = digest(data.endpoint);
    const existing = await tx.get(
      `SELECT id,user_id,endpoint FROM push_subscriptions WHERE endpoint_hash=?${mysql ? " FOR UPDATE" : ""}`,
      key,
    );
    if (
      existing &&
      (Number(existing.user_id) !== Number(user.id) ||
        existing.endpoint !== data.endpoint)
    )
      throw new DomainError(
        "Perangkat terkait akun lain. Nonaktifkan subscription browser lalu coba kembali.",
        409,
      );
    const generation = crypto.randomUUID();
    if (existing) {
      await tx.run(
        "UPDATE push_subscriptions SET p256dh=?,auth=?,session_token_hash=?,role=?,generation=?,disabled_at=NULL,failure_count=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        data.p256dh,
        data.auth,
        tokenHash,
        user.role,
        generation,
        existing.id,
      );
    } else {
      try {
        await tx.run(
          "INSERT INTO push_subscriptions(user_id,endpoint_hash,endpoint,p256dh,auth,session_token_hash,role,generation) VALUES(?,?,?,?,?,?,?,?)",
          user.id,
          key,
          data.endpoint,
          data.p256dh,
          data.auth,
          tokenHash,
          user.role,
          generation,
        );
      } catch (error) {
        if (
          error.code === "ER_DUP_ENTRY" ||
          /UNIQUE constraint/.test(error.message || "")
        )
          throw new DomainError(
            "Subscription sedang diperbarui. Coba kembali.",
            409,
          );
        throw error;
      }
    }
    return { active: true };
  });
}
export async function removePushSubscription(user, endpoint) {
  requirePushUser(user);
  const canonical = validatePushEndpoint(endpoint);
  await store.run(
    "UPDATE push_subscriptions SET disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE endpoint_hash=? AND user_id=?",
    digest(canonical),
    user.id,
  );
  return { active: false };
}
export async function pushSubscriptionStatus(user, endpoint, token) {
  requirePushUser(user);
  const canonical = validatePushEndpoint(endpoint);
  const row = await store.get(
    "SELECT id FROM push_subscriptions WHERE endpoint_hash=? AND user_id=? AND session_token_hash=? AND disabled_at IS NULL",
    digest(canonical),
    user.id,
    digest(String(token || "")),
  );
  return { active: Boolean(row) };
}
