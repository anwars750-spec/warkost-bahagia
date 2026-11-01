// Controlled, loopback-only production-bundle benchmark. Never uses live Gmail,
// an inherited DATABASE_URL, a real mailbox, or production credentials.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { localSmtpFixture } from "../tests/helpers/local-smtp-fixture.mjs";
const phase = process.argv[2];
if (!["before", "after"].includes(phase))
  throw Error("Usage: node scripts/auth-latency-bench.mjs before|after");
const root = process.cwd(),
  directory = path.join(root, ".uat", `auth-latency-${crypto.randomUUID()}`);
fs.mkdirSync(directory, { recursive: true });
const smtp = await localSmtpFixture({
  commandDelayMs: 15,
  greetingDelayMs: 15,
  dataDelayMs: 30,
  quitDelayMs: 250,
});
const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const output = fs.createWriteStream(path.join(directory, "server.log"));
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
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: "",
      DATABASE_PATH: path.join(directory, "browser.db"),
      UPLOAD_DIRECTORY: path.join(directory, "uploads"),
      BACKUP_DIRECTORY: path.join(directory, "backups"),
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "demo",
      SESSION_SECRET: "latency-fixture-session-secret-more-than-32-bytes",
      OTP_SECRET: "latency-fixture-otp-secret-more-than-32-bytes",
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtp.port),
      SMTP_SECURE: "false",
      SMTP_USER: "fixture-user",
      SMTP_PASS: "fixture-password",
      SMTP_FROM: "fixture@example.test",
      NODE_EXTRA_CA_CERTS: smtp.cert,
      AUTH_TIMINGS: "1",
      PAYMENT_PROVIDER_MODE: "simulation",
      QRIS_AUTO_CONFIRM_WORKER_DISABLED: "true",
    },
  },
);
let logs = "";
web.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
web.stdout.pipe(output, { end: false });
web.stderr.pipe(output, { end: false });
const origin = `http://127.0.0.1:${port}`;
function stages(response) {
  return (response.headers.get("server-timing") || "")
    .split(", ")
    .filter(Boolean)
    .map((metric) => {
      const [stage, value] = metric.split(";dur=");
      return { stage, durationMs: Number(value) };
    });
}
const results = { registration: [], verification: [] };
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (web.exitCode !== null) throw Error("Fixture production server stopped");
    try {
      const response = await fetch(origin + "/api/health/live");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw Error("Fixture production server readiness timeout");
  for (let i = 0; i < 6; i++) {
    const email = `latency-${i}@example.test`,
      password = "Latency-Fixture#2026";
    const post = (route, body) =>
      fetch(origin + "/api/" + route, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    const registered = await post("register", {
      name: "Latency Fixture",
      email,
      phone: "08123456" + String(i).padStart(4, "0"),
      birthDate: "1996-09-18",
      password,
      passwordConfirmation: password,
      consent: true,
    });
    if (registered.status !== 201) throw Error("Fixture registration failed");
    const challenge = await registered.json();
    if ("otp" in challenge) throw Error("Unexpected OTP disclosure");
    const verified = await post("otp-verify", {
      purpose: "REGISTRATION",
      challengeId: challenge.challengeId,
      code: smtp.messages.get(email),
    });
    if (verified.status !== 200) throw Error("Fixture verification failed");
    if (i) {
      results.registration.push(stages(registered));
      results.verification.push(stages(verified));
    }
  }
  const median = (values) => {
    const ordered = values.toSorted((a, b) => a - b);
    return Number(ordered[Math.floor(ordered.length / 2)].toFixed(3));
  };
  const summarize = (samples) =>
    [...new Set(samples.flat().map((item) => item.stage))].map((stage) => ({
      stage,
      durationMs: median(
        samples.map((sample) =>
          sample
            .filter((item) => item.stage === stage)
            .reduce((sum, item) => sum + item.durationMs, 0),
        ),
      ),
    }));
  const quitSamples = () =>
    logs.split(/\r?\n/).flatMap((line) => {
      try {
        const rows = JSON.parse(line);
        return Array.isArray(rows)
          ? rows.filter((item) => item.stage === "smtp.quit")
          : [];
      } catch {
        return [];
      }
    });
  for (let attempt = 0; attempt < 60 && quitSamples().length < 6; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  if (quitSamples().length < 6)
    throw Error("Fixture cleanup profile incomplete");
  const summary = {
    registration: summarize(results.registration),
    verification: summarize(results.verification),
    cleanup: [
      {
        stage: "smtp.quit",
        durationMs: median(
          quitSamples()
            .slice(1)
            .map((item) => item.durationMs),
        ),
      },
    ],
  };
  const target = path.join(root, ".uat", `auth-latency-${phase}.json`);
  fs.writeFileSync(target, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally {
  web.kill("SIGTERM");
  await smtp.close();
  output.end();
}
