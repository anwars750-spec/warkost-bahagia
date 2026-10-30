import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const context = new AsyncLocalStorage();
const allowed = new Set([
  "request.parse",
  "request.rate_limit",
  "request.session_lookup",
  "register.validate",
  "register.customer_transaction",
  "register.customer_lookup",
  "register.password_hash",
  "register.customer_write",
  "otp.challenge_transaction",
  "otp.challenge_lookup",
  "otp.challenge_hash",
  "otp.challenge_write",
  "smtp.connect",
  "smtp.greeting",
  "smtp.ehlo",
  "smtp.starttls",
  "smtp.tls",
  "smtp.ehlo_tls",
  "smtp.auth",
  "smtp.mail_from",
  "smtp.rcpt_to",
  "smtp.data_ready",
  "smtp.data_accept",
  "smtp.quit",
  "verify.validation",
  "verify.transaction",
  "verify.lookup",
  "verify.hash_compare",
  "verify.attempt_write",
  "verify.activation",
  "verify.loyalty",
  "verify.consume",
  "session.issue",
  "session.account_check",
  "session.insert",
  "session.cookie",
  "db.acquire",
  "db.begin",
  "db.commit",
  "api.register.total",
  "api.otp-verify.total",
]);
export function authStage(stage, operation) {
  const active = context.getStore();
  if (!active || !allowed.has(stage)) return operation();
  const start = performance.now();
  const finish = () => {
    if (!active.finished)
      active.timings.push({
        stage,
        durationMs: Number((performance.now() - start).toFixed(3)),
      });
  };
  try {
    const result = operation();
    if (result && typeof result.then === "function")
      return Promise.resolve(result).finally(finish);
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}
// Opt-in only. Neither payloads, identifiers, error text nor credentials enter
// the timing context. Concurrent requests have independent contexts.
export async function withAuthTimings(action, operation, options = {}) {
  const enabled = options.enabled ?? process.env.AUTH_TIMINGS === "1";
  if (!enabled || !["register", "otp-verify"].includes(action))
    return operation();
  const active = {
    timings: [],
    finished: false,
    report:
      options.report || ((timings) => console.info(JSON.stringify(timings))),
  };
  return context.run(active, async () => {
    try {
      const response = await authStage(`api.${action}.total`, operation);
      try {
        if (response?.headers && process.env.AUTH_TIMINGS === "1")
          response.headers.set(
            "Server-Timing",
            active.timings
              .map(({ stage, durationMs }) => `${stage};dur=${durationMs}`)
              .join(", "),
          );
      } catch {
        /* Read-only diagnostic headers must not affect auth. */
      }
      return response;
    } finally {
      active.finished = true;
      try {
        active.report(active.timings);
      } catch {
        /* Diagnostics must not change auth outcomes. */
      }
    }
  });
}

// Cleanup is outside the HTTP critical path. Log its own duration separately;
// never append it to the completed request's Server-Timing snapshot.
export async function authCleanupStage(stage, operation) {
  const active = context.getStore();
  const start = performance.now();
  try {
    return await operation();
  } finally {
    if (active && allowed.has(stage)) {
      try {
        active.report([
          { stage, durationMs: Number((performance.now() - start).toFixed(3)) },
        ]);
      } catch {}
    }
  }
}
