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

function fail(message) {
  throw new Error(message);
}

function validateEnvironment(env) {
  if (env.DATABASE_URL)
    fail("MOBILE UAT menolak DATABASE_URL agar database lain tidak tersentuh");
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

  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "warkost-mobile-uat-"),
  );
  const databasePath = path.join(directory, "warkost-mobile-uat.db");
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

  const nextBin = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  if (!fs.existsSync(nextBin)) fail("Next.js belum terpasang; jalankan npm ci");

  console.log(
    "MOBILE_UAT_READY " +
      JSON.stringify({
        host: "0.0.0.0",
        port,
        directory,
        databasePath,
        roles: [
          "customer@warkost.local",
          "admin@warkost.local",
          "manager@warkost.local",
          "kitchen@warkost.local",
          "owner@warkost.local",
          "driver@warkost.local",
        ],
      }),
  );
  console.log(
    "Buka URL LAN laptop yang sama dari desktop dan HP, contoh http://172.17.107.88:" +
      port,
  );
  console.log("Gunakan password dari OWNER_DEMO_PASSWORD untuk semua akun demo.");
  console.log("Tekan Ctrl+C setelah UAT selesai.");

  const server = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "0.0.0.0", "--port", String(port)],
    {
      cwd: projectRoot,
      env: { ...commonEnv, NODE_ENV: "development", PORT: String(port) },
      stdio: "inherit",
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.kill(signal));

  server.once("error", (error) => {
    console.error("MOBILE UAT gagal menjalankan server:", error.message);
    process.exitCode = 1;
  });
  server.once("exit", (code, signal) => {
    if (code && code !== 0) process.exitCode = code;
    else if (signal && !["SIGINT", "SIGTERM"].includes(signal))
      process.exitCode = 1;
  });
}

main().catch((error) => {
  console.error("MOBILE UAT gagal:", error.message);
  process.exitCode = 1;
});
