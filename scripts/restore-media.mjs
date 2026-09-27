import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
if (!process.argv[2] || !process.argv[3])
  throw Error(
    "Penggunaan: node scripts/restore-media.mjs <backup-dir> <target-baru>",
  );
const source = path.resolve(process.argv[2]),
  dest = path.resolve(process.argv[3]);
const manifest = JSON.parse(
  await fs.readFile(path.join(source, "manifest.json"), "utf8"),
);
if (manifest.version !== 1 || !Array.isArray(manifest.files))
  throw Error("Manifest tidak valid");
let created = false;
try {
  await fs.mkdir(dest, { mode: 0o700 });
  created = true;
  for (const entry of manifest.files) {
    if (!/^[0-9a-f-]{36}\.webp$/.test(entry.name))
      throw Error("Nama file tidak valid");
    const bytes = await fs.readFile(path.join(source, entry.name));
    if (
      bytes.length !== entry.size ||
      crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw Error("Integritas gambar gagal: " + entry.name);
    await fs.writeFile(path.join(dest, entry.name), bytes, {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(
    "Restore media terverifikasi:",
    dest,
    manifest.files.length,
    "gambar",
  );
} catch (e) {
  if (created) {
    try {
      await fs.rm(dest, { recursive: true, force: true });
    } catch {}
  }
  throw e;
}
