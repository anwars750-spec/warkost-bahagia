import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
const source = path.resolve(process.env.UPLOAD_DIRECTORY || "./data/uploads"),
  parent = path.resolve(
    process.env.MEDIA_BACKUP_DIRECTORY || "./backups/media",
  );
await fs.mkdir(parent, { recursive: true, mode: 0o700 });
const dest = path.join(
  parent,
  "media-" + new Date().toISOString().replace(/[:.]/g, "-"),
);
await fs.mkdir(dest, { mode: 0o700 });
const files = [];
try {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[0-9a-f-]{36}\.webp$/.test(entry.name)) continue;
    const bytes = await fs.readFile(path.join(source, entry.name));
    await fs.writeFile(path.join(dest, entry.name), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    files.push({
      name: entry.name,
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await fs.writeFile(
    path.join(dest, "manifest.json"),
    JSON.stringify({ version: 1, files }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(dest);
} catch (e) {
  await fs.rm(dest, { recursive: true, force: true });
  throw e;
}
