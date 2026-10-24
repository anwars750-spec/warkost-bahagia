import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const positive = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;

function validateImageUrl(value) {
  const imageUrl = String(value || "").trim();
  if (
    !imageUrl ||
    imageUrl.length > 1000 ||
    (!/^\/api\/media\/[0-9a-f-]{36}$/.test(imageUrl) &&
      !/^\/demo\/[a-z0-9._-]+\.(svg|webp|png)$/i.test(imageUrl) &&
      !/^https:\/\//.test(imageUrl))
  )
    throw new DomainError("Gambar banner tidak valid");
  return imageUrl;
}

async function assertStoredImageExists(imageUrl, database = store) {
  if (
    imageUrl.startsWith("/api/media/") &&
    !(await database.get(
      "SELECT id FROM media_assets WHERE id=?",
      imageUrl.slice(11),
    ))
  )
    throw new DomainError("Gambar banner tidak ditemukan");
}

export async function listActiveBanners() {
  return store.all(
    "SELECT id,image_url,sort_order FROM banners WHERE active=1 ORDER BY sort_order ASC,id ASC",
  );
}

export async function listBanners(user) {
  requiredCapability(user, CAPABILITIES.BANNER_READ);
  return store.all(
    "SELECT id,internal_name,image_url,active,sort_order,created_at,updated_at FROM banners ORDER BY sort_order ASC,id ASC",
  );
}

export async function saveBanner(user, input) {
  requiredCapability(user, CAPABILITIES.BANNER_WRITE);
  const internalName = String(input.internalName || "").trim();
  const imageUrl = validateImageUrl(input.imageUrl);
  const sortOrder = Number(input.sortOrder);
  const active = input.active === true ? 1 : 0;
  if (internalName.length < 2 || internalName.length > 100)
    throw new DomainError("Nama internal banner harus 2–100 karakter");
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999)
    throw new DomainError("Urutan banner harus 0–9999");
  if (input.id !== undefined && !positive(input.id))
    throw new DomainError("ID banner tidak valid");
  await assertStoredImageExists(imageUrl);

  return store.transaction(async (tx, mysql) => {
    let before = null;
    let id = input.id;
    if (id !== undefined) {
      before = await tx.get(
        "SELECT * FROM banners WHERE id=?" + (mysql ? " FOR UPDATE" : ""),
        Number(id),
      );
      if (!before) throw new DomainError("Banner tidak ditemukan", 404);
      await tx.run(
        "UPDATE banners SET internal_name=?,image_url=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        internalName,
        imageUrl,
        active,
        sortOrder,
        Number(id),
      );
    } else {
      const result = await tx.run(
        "INSERT INTO banners(internal_name,image_url,active,sort_order) VALUES(?,?,?,?)",
        internalName,
        imageUrl,
        active,
        sortOrder,
      );
      id = result.lastInsertRowid;
    }
    const after = {
      id: Number(id),
      internal_name: internalName,
      image_url: imageUrl,
      active,
      sort_order: sortOrder,
    };
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      before ? "BANNER_UPDATED" : "BANNER_CREATED",
      JSON.stringify({
        entity: "banner",
        entityId: Number(id),
        before,
        after,
      }),
    );
    return after;
  });
}

export async function deleteBanner(user, id) {
  requiredCapability(user, CAPABILITIES.BANNER_WRITE);
  if (!positive(id)) throw new DomainError("ID banner tidak valid");
  return store.transaction(async (tx, mysql) => {
    const before = await tx.get(
      "SELECT * FROM banners WHERE id=?" + (mysql ? " FOR UPDATE" : ""),
      Number(id),
    );
    if (!before) throw new DomainError("Banner tidak ditemukan", 404);
    await tx.run("DELETE FROM banners WHERE id=?", Number(id));
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "BANNER_DELETED",
      JSON.stringify({
        entity: "banner",
        entityId: Number(id),
        before,
      }),
    );
    return { ok: true, id: Number(id) };
  });
}
