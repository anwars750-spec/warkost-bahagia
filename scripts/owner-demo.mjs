import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prepareOnly = process.argv.includes("--prepare-only");

function fail(message) {
  throw new Error(message);
}

function validateEnvironment(env) {
  if (env.DATABASE_URL)
    fail("OWNER DEMO menolak DATABASE_URL agar database lain tidak tersentuh");
  if (env.DEPLOYMENT_ENV && env.DEPLOYMENT_ENV !== "demo")
    fail("OWNER DEMO hanya boleh memakai DEPLOYMENT_ENV=demo");
  if (!env.OWNER_DEMO_PASSWORD || env.OWNER_DEMO_PASSWORD.length < 10)
    fail("OWNER_DEMO_PASSWORD wajib minimal 10 karakter");
  if (env.OWNER_DEMO_PASSWORD.length > 128)
    fail("OWNER_DEMO_PASSWORD maksimal 128 karakter");

  const port = Number(env.OWNER_DEMO_PORT || 3000);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    fail("OWNER_DEMO_PORT harus berupa port 1024-65535");
  return port;
}

function runStep(script, env) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, script)], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) fail(`${script} gagal`);
}

async function main() {
  const port = validateEnvironment(process.env);
  if (!prepareOnly) {
    try {
      await fsPromises.access(path.join(projectRoot, ".next", "BUILD_ID"));
    } catch {
      fail("Production build belum tersedia; jalankan npm run build satu kali");
    }
  }

  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "warkost-owner-demo-"),
  );
  const databasePath = path.join(directory, "warkost-demo.db");
  const commonEnv = {
    ...process.env,
    DATABASE_URL: "",
    DATABASE_PATH: databasePath,
    DEPLOYMENT_ENV: "demo",
    SEED_DEMO_PASSWORD: process.env.OWNER_DEMO_PASSWORD,
    SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
    UPLOAD_DIRECTORY: path.join(directory, "uploads"),
    BACKUP_DIRECTORY: path.join(directory, "backups"),
  };

  runStep("scripts/seed.mjs", { ...commonEnv, NODE_ENV: "development" });
  runStep("scripts/preflight.mjs", { ...commonEnv, NODE_ENV: "production" });

  const evidence = {
    url: `http://127.0.0.1:${port}`,
    directory,
    databasePath,
    roles: [
      "customer@warkost.local",
      "admin@warkost.local",
      "kitchen@warkost.local",
      "owner@warkost.local",
      "driver@warkost.local",
    ],
  };
  console.log("OWNER_DEMO_READY " + JSON.stringify(evidence));
  if (prepareOnly) return;

  console.log("Gunakan password dari OWNER_DEMO_PASSWORD untuk kelima akun.");
  console.log("Tekan Ctrl+C setelah demo selesai.");

  const nextBin = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  if (!fs.existsSync(nextBin)) fail("Next.js belum terpasang; jalankan npm ci");

  const server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectRoot,
      env: { ...commonEnv, NODE_ENV: "production", PORT: String(port) },
      stdio: "inherit",
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.kill(signal));
  server.once("error", (error) => {
    console.error("OWNER DEMO gagal menjalankan server:", error.message);
    process.exitCode = 1;
  });
  server.once("exit", (code, signal) => {
    if (code && code !== 0) process.exitCode = code;
    else if (signal && !["SIGINT", "SIGTERM"].includes(signal))
      process.exitCode = 1;
  });
}

main().catch((error) => {
  console.error("OWNER DEMO gagal:", error.message);
  process.exitCode = 1;
});
