import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
const phase = process.argv[2];
if (!["before", "after"].includes(phase))
  throw Error(
    "Usage: node scripts/auth-path-bench.mjs before|after (run on respective checkout/build)",
  );
const root = process.cwd(),
  directory = path.join(root, ".uat", `auth-path-${crypto.randomUUID()}`);
fs.mkdirSync(directory, { recursive: true });
Object.assign(process.env, {
  DATABASE_URL: "",
  DATABASE_PATH: path.join(directory, "data.db"),
  SESSION_SECRET: "local-auth-path-fixture-secret-more-than-32-bytes",
  NODE_ENV: "test",
  AUTH_TIMINGS: "0",
});
const store = await import("../lib/store.mjs");
const auth = await import("../lib/auth.mjs");
const { recordAttempt } = await import("../lib/rate-limit.mjs");
const password = "Local-Benchmark#2026";
const hash = auth.hashPassword(password);
for (const email of ["direct@example.test", "http@example.test"])
  await store.run(
    "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,'CUSTOMER',1)",
    "Benchmark",
    email,
    hash,
  );
const samples = {
  rateLimit: [],
  passwordVerify: [],
  sessionCreation: [],
  loginPipeline: [],
  completeHttpRequest: [],
};
async function timed(operation) {
  const start = performance.now();
  await operation();
  return performance.now() - start;
}
for (let i = 0; i < 8; i++) {
  const start = performance.now();
  const rate = await timed(async () => {
    if (!(await recordAttempt("login", "direct@example.test", 12)))
      throw Error("Unexpected limit");
  });
  const account = await store.get(
    "SELECT * FROM users WHERE email=?",
    "direct@example.test",
  );
  const verify = await timed(async () => {
    if (
      !(await (auth.checkPasswordAsync || auth.checkPassword)(
        password,
        account.password_hash,
      ))
    )
      throw Error("Verification failed");
  });
  const issue = await timed(() =>
    phase === "after"
      ? auth.issueSessionForAuthenticatedAccount(account)
      : auth.issueSession(account),
  );
  if (i) {
    samples.rateLimit.push(rate);
    samples.passwordVerify.push(verify);
    samples.sessionCreation.push(issue);
    samples.loginPipeline.push(performance.now() - start);
  }
}
const reserve = net.createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const web = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "demo",
      EMAIL_TRANSPORT: "development",
      AUTH_TIMINGS: "1",
      QRIS_AUTO_CONFIRM_WORKER_DISABLED: "true",
      PAYMENT_PROVIDER_MODE: "simulation",
    },
  },
);
const origin = `http://127.0.0.1:${port}`;
const stageSamples = [];
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (web.exitCode !== null) throw Error("Local server stopped");
    try {
      if ((await fetch(origin + "/api/health/live")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Local readiness timeout");
  for (let i = 0; i < 8; i++) {
    const start = performance.now();
    const response = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ identifier: "http@example.test", password }),
    });
    await response.arrayBuffer();
    if (response.status !== 200 || !response.headers.get("set-cookie"))
      throw Error("Local HTTP login failed");
    if (i) {
      samples.completeHttpRequest.push(performance.now() - start);
      stageSamples.push(
        (response.headers.get("server-timing") || "")
          .split(", ")
          .filter(Boolean)
          .map((metric) => {
            const [stage, value] = metric.split(";dur=");
            return { stage, durationMs: Number(value) };
          }),
      );
    }
  }
  if (phase === "after") {
    // Eight successful HTTP attempts above; four wrong-password attempts may
    // still run, then the thirteenth must be rejected despite rotated fields.
    for (let i = 0; i < 5; i++) {
      const response = await fetch(origin + "/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          "X-Forwarded-For": `198.51.100.${i + 1}`,
        },
        body: JSON.stringify({
          identifier: "http@example.test",
          password: "wrong",
          challengeId: crypto.randomUUID(),
        }),
      });
      if (response.status !== (i < 4 ? 401 : 429))
        throw Error("HTTP limiter field-isolation check failed");
    }
  }
  const median = (values) =>
    Number(
      values
        .toSorted((a, b) => a - b)
        [Math.floor(values.length / 2)].toFixed(3),
    );
  const result = {
    scope:
      "Local production bundle + SQLite; 7 warm sequential samples, no VPS/MySQL claim. Phase labels do not restore source/build.",
    metricsMs: Object.fromEntries(
      Object.entries(samples).map(([key, values]) => [key, median(values)]),
    ),
    httpRateLimitBodyFieldIsolation:
      phase === "after" ? "PASS" : "not tested on baseline",
    serverStages: [...new Set(stageSamples.flat().map((r) => r.stage))].map(
      (stage) => ({
        stage,
        durationMs: median(
          stageSamples.map((rows) =>
            rows
              .filter((r) => r.stage === stage)
              .reduce((sum, r) => sum + r.durationMs, 0),
          ),
        ),
      }),
    ),
  };
  fs.writeFileSync(
    path.join(root, ".uat", `auth-path-${phase}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  web.kill("SIGTERM");
  await store.close();
}
