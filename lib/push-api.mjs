import crypto from "node:crypto";
import * as store from "./store.mjs";
import { currentUser } from "./auth.mjs";
import { DomainError } from "./domain.mjs";
import { assertSameOrigin, readJsonBody } from "./request.mjs";
import { recordAttempt } from "./rate-limit.mjs";
import { PUSH_ROLES, pushConfiguration } from "./web-push-config.mjs";
import {
  requirePushUser,
  savePushSubscription,
  removePushSubscription,
  pushSubscriptionStatus,
} from "./push-subscriptions.mjs";
const out = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request, mutate) {
  try {
    const user = await currentUser(request);
    if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
    const config = pushConfiguration();
    if (!mutate && new URL(request.url).searchParams.has("delivery")) {
      const key = new URL(request.url).searchParams.get("delivery");
      if (!/^[a-f0-9]{64}$/.test(key || "")) return out({ allowed: false });
      const tokenHash = crypto
        .createHash("sha256")
        .update(request.cookies.get("wb_session")?.value || "")
        .digest("hex");
      const row = await store.get(
        "SELECT d.delivery_key FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id WHERE d.delivery_key=? AND s.user_id=? AND s.role=? AND s.session_token_hash=? AND s.disabled_at IS NULL",
        key,
        user.id,
        user.role,
        tokenHash,
      );
      return out({ allowed: Boolean(row) });
    }
    if (!mutate)
      return out({
        enabled: Boolean(config) && PUSH_ROLES.includes(user.role),
        publicKey: PUSH_ROLES.includes(user.role)
          ? config?.publicKey || null
          : null,
      });
    requirePushUser(user);
    if (
      !request.headers.get("origin") ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new DomainError("Asal permintaan tidak diizinkan", 403);
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const token = request.cookies.get("wb_session")?.value;
    if (body.action === "status")
      return out(await pushSubscriptionStatus(user, body.endpoint, token));
    if (!(await recordAttempt("push-subscription", user.id, 20)))
      throw new DomainError("Terlalu banyak percobaan. Coba lagi nanti.", 429);
    if (body.action === "unsubscribe")
      return out(await removePushSubscription(user, body.endpoint));
    if (body.action !== "subscribe") throw new DomainError("Aksi tidak valid");
    if (!config)
      throw new DomainError("Notifikasi perangkat belum tersedia", 503);
    return out(await savePushSubscription(user, body.subscription, token));
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    // Never log raw provider errors, endpoint/key values or SQL arguments.
    console.warn("Web Push API unavailable");
    return out({ error: "Notifikasi perangkat belum dapat diperbarui" }, 503);
  }
}
export const getPush = (request) => handle(request, false);
export const postPush = (request) => handle(request, true);
