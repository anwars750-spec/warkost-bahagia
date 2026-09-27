import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { hashFile } from "./hash-file.mjs";
import {
  createMysqlDefaultsFile,
  loadMysqlMigrations,
  parseMysqlUrl,
  verifyMysqlSchema,
} from "../lib/mysql-operations.mjs";

const backupArg = process.argv[2];
if (!backupArg)
  throw Error("Penggunaan: node scripts/restore-mysql.mjs <backup.sql>");
const backup = path.resolve(backupArg);
if (!fs.existsSync(backup)) throw Error("Backup MySQL tidak ditemukan");
if (!fs.existsSync(backup + ".sha256"))
  throw Error("Checksum backup MySQL tidak ditemukan");
const expectedHash = fs.readFileSync(backup + ".sha256", "utf8").trim();
const actualHash = await hashFile(backup);
if (!/^[0-9a-f]{64}$/.test(expectedHash) || expectedHash !== actualHash)
  throw Error("Checksum backup MySQL tidak cocok");

const config = parseMysqlUrl(process.env.DATABASE_URL);
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [existing] = await connection.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=? LIMIT 1",
    [config.database],
  );
  if (existing.length) throw Error("Database target restore harus kosong");
} finally {
  await connection.end();
}

const credentials = createMysqlDefaultsFile(config);
let input;
try {
  input = fs.openSync(backup, "r");
  const result = spawnSync(
    process.env.MYSQL_BINARY || "mysql",
    [
      `--defaults-extra-file=${credentials.file}`,
      "--default-character-set=utf8mb4",
      config.database,
    ],
    { stdio: [input, "pipe", "pipe"], encoding: "utf8" },
  );
  fs.closeSync(input);
  input = undefined;
  if (result.error || result.status !== 0)
    throw Error(
      `Restore mysql gagal: ${result.error?.message || result.stderr?.trim() || "exit " + result.status}`,
    );
} finally {
  if (input !== undefined)
    try {
      fs.closeSync(input);
    } catch {}
  credentials.cleanup();
}

const verification = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const result = await verifyMysqlSchema(
    verification,
    config.database,
    loadMysqlMigrations(),
  );
  console.log("Restore MySQL terverifikasi:", JSON.stringify(result));
} finally {
  await verification.end();
}
