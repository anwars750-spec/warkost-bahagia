import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
const allowed = new Set(["jpeg", "png", "webp", "avif"]);
const root = () => {
  if (process.env.NODE_ENV === "production" && !process.env.UPLOAD_DIRECTORY)
    throw Error("UPLOAD_DIRECTORY wajib disetel pada produksi");
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.UPLOAD_DIRECTORY || "./data/uploads",
  );
};
export async function uploadImage(user, file) {
  required(user, ["ADMIN"]);
  if (
    !file ||
    typeof file.arrayBuffer !== "function" ||
    file.size < 1 ||
    file.size > 8 * 1024 * 1024
  )
    throw new DomainError("Gambar harus berukuran 1 byte sampai 8 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  let metadata, converted;
  try {
    const image = sharp(buffer, {
      failOn: "error",
      limitInputPixels: 25_000_000,
    });
    metadata = await image.metadata();
    if (
      !allowed.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 25_000_000
    )
      throw new DomainError("Format atau dimensi gambar tidak didukung");
    converted = await image
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("Gambar tidak valid");
  }
  if (converted.length > 4 * 1024 * 1024)
    throw new DomainError("Gambar hasil optimasi terlalu besar");
  const id = crypto.randomUUID(),
    filename = id + ".webp",
    directory = root();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, filename);
  await fs.writeFile(target, converted, { flag: "wx", mode: 0o600 });
  try {
    await store.run(
      "INSERT INTO media_assets(id,filename,mime_type,bytes_size,uploaded_by) VALUES(?,?,?,?,?)",
      id,
      filename,
      "image/webp",
      converted.length,
      user.id,
    );
  } catch (e) {
    await fs.unlink(target);
    throw e;
  }
  return {
    id,
    url: "/api/media/" + id,
    bytes: converted.length,
    width: metadata.width,
    height: metadata.height,
  };
}
export async function readImage(id) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  )
    throw new DomainError("Gambar tidak ditemukan", 404);
  const asset = await store.get(
    "SELECT filename,mime_type FROM media_assets WHERE id=?",
    id,
  );
  if (!asset) throw new DomainError("Gambar tidak ditemukan", 404);
  try {
    return {
      bytes: await fs.readFile(path.join(root(), id + ".webp")),
      mimeType: asset.mime_type,
    };
  } catch (e) {
    if (e.code === "ENOENT")
      throw new DomainError("Gambar tidak tersedia", 404);
    throw e;
  }
}
