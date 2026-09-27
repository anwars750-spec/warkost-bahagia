import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hashFile } from "./hash-file.mjs";
import {
  createMysqlDefaultsFile,
  parseMysqlUrl,
} from "../lib/mysql-operations.mjs";

const config = parseMysqlUrl(process.env.DATABASE_URL);
const root = path.resolve(process.env.BACKUP_DIRECTORY || "./backups/mysql");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const base = "warkost-mysql-" + new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(root, base + ".sql");
const partial = destination + ".partial";
const credentials = createMysqlDefaultsFile(config);
let output;
try {
  output = fs.openSync(partial, "wx", 0o600);
  const result = spawnSync(
    process.env.MYSQLDUMP_BINARY || "mysqldump",
    [
      `--defaults-extra-file=${credentials.file}`,
      "--single-transaction",
      "--quick",
      "--skip-lock-tables",
      "--routines",
      "--events",
      "--triggers",
      "--hex-blob",
      "--set-gtid-purged=OFF",
      "--no-tablespaces",
      "--column-statistics=0",
      "--default-character-set=utf8mb4",
      config.database,
    ],
    { stdio: ["ignore", output, "pipe"], encoding: "utf8" },
  );
  fs.closeSync(output);
  output = undefined;
  if (result.error || result.status !== 0)
    throw Error(
      `mysqldump gagal: ${result.error?.message || result.stderr?.trim() || "exit " + result.status}`,
    );
  const headerBuffer = Buffer.alloc(8192);
  const headerFile = fs.openSync(partial, "r");
  const bytesRead = fs.readSync(
    headerFile,
    headerBuffer,
    0,
    headerBuffer.length,
    0,
  );
  fs.closeSync(headerFile);
  const header = headerBuffer.subarray(0, bytesRead).toString("utf8");
  if (!header.includes("MySQL dump") || !header.includes("Host:"))
    throw Error("Output mysqldump tidak valid");
  fs.renameSync(partial, destination);
  fs.chmodSync(destination, 0o600);
  const checksum = await hashFile(destination);
  fs.writeFileSync(destination + ".sha256", checksum + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(destination);
} catch (error) {
  fs.rmSync(partial, { force: true });
  fs.rmSync(destination, { force: true });
  fs.rmSync(destination + ".sha256", { force: true });
  throw error;
} finally {
  if (output !== undefined)
    try {
      fs.closeSync(output);
    } catch {}
  credentials.cleanup();
}
