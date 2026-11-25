import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
const root = process.cwd(),
  directory = path.join(
    root,
    ".uat",
    `customer-auth-${crypto.randomBytes(16).toString("hex")}`,
  );
fs.mkdirSync(directory, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: "",
  DATABASE_PATH: path.join(directory, "browser.db"),
  OTP_OUTBOX_PATH: path.join(directory, "mail.json"),
  CUSTOMER_AUTH_FIXTURE_DIRECTORY: directory,
  SESSION_SECRET: "auth-browser-fixture-secret-more-than-32-bytes",
  OTP_SECRET: "auth-browser-fixture-otp-secret-more-than-32-bytes",
  EMAIL_TRANSPORT: "development",
  DEPLOYMENT_ENV: "demo",
  PAYMENT_PROVIDER_MODE: "simulation",
  QRIS_AUTO_CONFIRM_WORKER_DISABLED: "true",
  SEED_DEMO_PASSWORD: "CustomerBrowserFixture#2026",
  STAGING_UAT_PASSWORD: "CustomerBrowserFixture#2026",
  WARKOST_TEST_STORE_NOW_MS: String(Date.parse("2026-10-23T05:00:00Z")),
  AUTH_TIMINGS: "0",
  CI: "1",
};
const seed = spawnSync(process.execPath, ["scripts/setup-local-uat.mjs"], {
  cwd: root,
  env: { ...env, NODE_ENV: "test" },
  windowsHide: true,
  stdio: "ignore",
});
if (seed.status !== 0) throw Error("Fixture seed failed");
// The real Customer auth test intentionally checks this legacy fixture hash.
const { DatabaseSync } = await import("node:sqlite");
const { hashPassword } = await import("../lib/auth.mjs");
const seeded = new DatabaseSync(env.DATABASE_PATH);
seeded
  .prepare(
    "UPDATE users SET password_hash=? WHERE email LIKE '%@warkost.local'",
  )
  .run(hashPassword("CustomerBrowserFixture#2026"));
seeded.close();
// Existing Admin navigation requires an active operator/shift. Establish that
// prerequisite only in this dedicated fixture, using the unchanged domain API.
Object.assign(process.env, {
  DATABASE_URL: "",
  DATABASE_PATH: env.DATABASE_PATH,
  NODE_ENV: "test",
});
const store = await import("../lib/store.mjs");
const { bootstrapAdminOperator, startAdminShift } =
  await import("../lib/admin-cash-control.mjs");
const admin = await store.get(
  "SELECT id,role FROM users WHERE email='admin@warkost.local'",
);
const operator = await bootstrapAdminOperator(admin, {
  name: "Browser Fixture",
  pin: "739251",
});
await startAdminShift(admin, { operatorId: operator.id, pin: "739251" });
await store.close();

const reserve = net.createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
env.BASE_URL = `http://127.0.0.1:${port}`;
const log = fs.createWriteStream(path.join(directory, "server.log"));
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
    env: { ...env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
web.stdout.pipe(log, { end: false });
web.stderr.pipe(log, { end: false });
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (web.exitCode !== null) throw Error("Fixture server stopped");
    try {
      if ((await fetch(env.BASE_URL + "/api/health/live")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Readiness timed out");
  const requested = process.argv.slice(2);
  const files = requested.length
    ? requested
    : [
        "tests/uat/customer-auth-home.spec.mjs",
        "tests/uat/admin-first-paint.spec.mjs",
        "tests/uat/admin-ui-stabilization.spec.mjs",
        "tests/uat/kitchen-workspace.spec.mjs",
        "tests/uat/kitchen-role-safety.spec.mjs",
        "tests/uat/staging-release.spec.mjs",
      ];
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      ...files,
      "--workers=1",
      "--retries=0",
      "--reporter=line",
    ],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const output = fs.createWriteStream(
    path.join(root, ".uat", "auth-path-browser.log"),
  );
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  const code = await new Promise((r) => child.on("exit", r));
  output.end();
  console.log(`Browser exit: ${code}`);
  process.exitCode = code;
} finally {
  web.kill("SIGTERM");
  log.end();
}
