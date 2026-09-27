import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { verifySqliteBackup } from "./sqlite-backup-check.mjs";
import { hashFile } from "./hash-file.mjs";
const source = path.resolve(process.env.DATABASE_PATH || "./data/warkost.db");
if (!fs.existsSync(source)) throw Error("Database sumber tidak ditemukan");
const root = path.resolve(process.env.BACKUP_DIRECTORY || "./backups");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const dest = path.join(
  root,
  "warkost-" + new Date().toISOString().replace(/[:.]/g, "-") + ".db",
);
const database = new DatabaseSync(source);
try {
  await backup(database, dest);
} finally {
  database.close();
}
try {
  verifySqliteBackup(dest);
  fs.chmodSync(dest, 0o600);
  const hash = await hashFile(dest);
  fs.writeFileSync(dest + ".sha256", hash + "\n", { flag: "wx", mode: 0o600 });
} catch (error) {
  fs.rmSync(dest, { force: true });
  fs.rmSync(dest + ".sha256", { force: true });
  throw error;
}
console.log(dest);
