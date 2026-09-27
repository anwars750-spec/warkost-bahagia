import fs from "node:fs";
import path from "node:path";
import { verifySqliteBackup } from "./sqlite-backup-check.mjs";
import { hashFile } from "./hash-file.mjs";
const backup = process.argv[2],
  target = process.argv[3];
if (!backup || !target)
  throw Error(
    "Penggunaan: node scripts/restore.mjs <backup.db> <target-baru.db>",
  );
const source = path.resolve(backup),
  dest = path.resolve(target);
if (!fs.existsSync(source) || fs.existsSync(dest))
  throw Error("Backup harus ada dan target harus belum ada");
verifySqliteBackup(source);
if (!fs.existsSync(source + ".sha256"))
  throw Error("Checksum backup tidak ditemukan");
const expected = fs.readFileSync(source + ".sha256", "utf8").trim();
const actual = await hashFile(source);
if (!/^[0-9a-f]{64}$/.test(expected) || expected !== actual)
  throw Error("Checksum backup tidak cocok");
fs.mkdirSync(path.dirname(dest), { recursive: true });
let copied = false;
try {
  fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
  copied = true;
  fs.chmodSync(dest, 0o600);
  verifySqliteBackup(dest);
} catch (error) {
  if (copied) fs.rmSync(dest, { force: true });
  throw error;
}
console.log("Restore terverifikasi:", dest);
