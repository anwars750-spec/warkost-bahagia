import path from "node:path";
import { spawn } from "node:child_process";
import { validateHostingerEnvironment } from "../lib/hostinger.mjs";

const errors = validateHostingerEnvironment(process.env);
if (errors.length) {
  for (const message of errors) console.error("- " + message);
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          Error(
            `${path.basename(args.at(-1) || command)} gagal (${signal || code})`,
          ),
        );
    });
  });
}

for (const script of [
  "scripts/migrate-mysql.mjs",
  "scripts/bootstrap-staging.mjs",
  "scripts/verify-mysql-schema.mjs",
  "scripts/preflight.mjs",
])
  await run(process.execPath, [script]);

const nextBin = path.resolve("node_modules/next/dist/bin/next");
const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "0.0.0.0"],
  {
    env: process.env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.kill(signal));

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code, signal) => {
    if (signal || code === 0) resolve();
    else reject(Error(`Next.js berhenti dengan exit code ${code}`));
  });
});
