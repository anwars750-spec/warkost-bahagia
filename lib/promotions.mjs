import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const positive = (value) => Number.isSafeInteger(value) && value > 0;

function text(input, key, min, max, label) {
  const value = String(input[key] || "").trim();
  if (value.length < min || value.length > max)
    throw new DomainError(`${label} harus ${min}–${max} karakter`);
  return value;
}

function sqlTimestamp(value, label) {
  if (typeof value !== "string" || value.length > 40)
    throw new DomainError(`${label} tidak valid`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds))
    throw new DomainError(`${label} tidak valid`);
  return new Date(milliseconds).toISOString().slice(0, 19).replace("T", " ");
}

function statusOf(row, now = Date.now()) {
  if (!row.active) return "INACTIVE";
  const starts = Date.parse(String(row.starts_at).replace(" ", "T") + "Z");
  const ends = Date.parse(String(row.ends_at).replace(" ", "T") + "Z");
  if (now < starts) return "SCHEDULED";
  if (now >= ends) return "EXPIRED";
  return "ACTIVE";
}

function nonNegative(value, label, { nullable = false } = {}) {
  if (nullable && (value === "" || value === null || value === undefined))
    return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

export async function listActivePromotions() {
  return store.all(
    "SELECT id,title,description,badge,terms,cta_label,image_url,starts_at,ends_at FROM promotions WHERE active=1 AND starts_at<=CURRENT_TIMESTAMP AND ends_at>CURRENT_TIMESTAMP ORDER BY starts_at DESC,id DESC",
  );
}

export async function listPromotions(user) {
  requiredCapability(user, CAPABILITIES.PROMOTION_READ);
  const rows = await store.all(
    "SELECT id,title,description,badge,terms,cta_label,image_url,starts_at,ends_at,active,voucher_type,voucher_category,discount_value,minimum_order,max_discount,quota,used_count,one_per_customer,created_at,updated_at FROM promotions ORDER BY id DESC",
  );
  return rows.map((row) => ({ ...row, status: statusOf(row) }));
}

export async function savePromotion(user, input) {
  requiredCapability(user, CAPABILITIES.PROMOTION_WRITE);
  const title = text(input, "title", 2, 100, "Judul promo"),
    description = text(input, "description", 5, 500, "Deskripsi promo"),
    badge = text(input, "badge", 2, 40, "Badge promo"),
    terms = text(input, "terms", 3, 300, "Syarat promo"),
    ctaLabel = text(input, "ctaLabel", 2, 40, "CTA promo"),
    imageUrl = String(input.imageUrl || "").trim(),
    startsAt = sqlTimestamp(input.startsAt, "Waktu mulai"),
    endsAt = sqlTimestamp(input.endsAt, "Waktu selesai"),
    active = input.active === true,
    voucherType = input.voucherType || null,
    discountValue = nonNegative(input.discountValue ?? 0, "Nilai diskon"),
    minimumOrder = nonNegative(input.minimumOrder ?? 0, "Minimum belanja"),
    maxDiscount = nonNegative(input.maxDiscount, "Maksimum diskon", {
      nullable: true,
    }),
    quota = nonNegative(input.quota, "Kuota voucher", { nullable: true });
  if (voucherType !== null && !["PERCENT", "FIXED"].includes(voucherType))
    throw new DomainError("Tipe voucher tidak valid");
  if (voucherType && discountValue < 1)
    throw new DomainError("Nilai diskon voucher minimal 1");
  if (voucherType === "PERCENT" && discountValue > 100)
    throw new DomainError("Diskon persen maksimal 100");
  if (Date.parse(endsAt + "Z") <= Date.parse(startsAt + "Z"))
    throw new DomainError("Waktu selesai harus setelah waktu mulai");
  if (
    imageUrl.length > 1000 ||
    (imageUrl &&
      !/^\/api\/media\/[0-9a-f-]{36}$/.test(imageUrl) &&
      !/^https:\/\//.test(imageUrl))
  )
    throw new DomainError("Gambar promo tidak valid");
  if (
    imageUrl.startsWith("/api/media/") &&
    !(await store.get(
      "SELECT id FROM media_assets WHERE id=?",
      imageUrl.slice(11),
    ))
  )
    throw new DomainError("Gambar promo tidak ditemukan");
  if (input.id !== undefined && !positive(input.id))
    throw new DomainError("ID promo tidak valid");

  return store.transaction(async (tx, mysql) => {
    let before = null;
    let id = input.id;
    if (id !== undefined) {
      before = await tx.get(
        "SELECT id,title,description,badge,terms,cta_label,image_url,starts_at,ends_at,active,voucher_type,voucher_category,discount_value,minimum_order,max_discount,quota,used_count,one_per_customer FROM promotions WHERE id=?" +
          (mysql ? " FOR UPDATE" : ""),
        id,
      );
      if (!before) throw new DomainError("Promo tidak ditemukan", 404);
      if (quota !== null && quota < Number(before.used_count))
        throw new DomainError(
          "Kuota tidak boleh lebih kecil dari voucher yang sudah digunakan",
        );
      await tx.run(
        "UPDATE promotions SET title=?,description=?,badge=?,terms=?,cta_label=?,image_url=?,starts_at=?,ends_at=?,active=?,voucher_type=?,discount_value=?,minimum_order=?,max_discount=?,quota=?,one_per_customer=1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        title,
        description,
        badge,
        terms,
        ctaLabel,
        imageUrl,
        startsAt,
        endsAt,
        active ? 1 : 0,
        voucherType,
        voucherType ? discountValue : 0,
        voucherType ? minimumOrder : 0,
        voucherType ? maxDiscount : null,
        voucherType ? quota : null,
        user.id,
        id,
      );
    } else {
      const result = await tx.run(
        "INSERT INTO promotions(title,description,badge,terms,cta_label,image_url,starts_at,ends_at,active,voucher_type,discount_value,minimum_order,max_discount,quota,one_per_customer,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
        title,
        description,
        badge,
        terms,
        ctaLabel,
        imageUrl,
        startsAt,
        endsAt,
        active ? 1 : 0,
        voucherType,
        voucherType ? discountValue : 0,
        voucherType ? minimumOrder : 0,
        voucherType ? maxDiscount : null,
        voucherType ? quota : null,
        user.id,
        user.id,
      );
      id = result.lastInsertRowid;
    }
    const after = {
      id: Number(id),
      title,
      description,
      badge,
      terms,
      cta_label: ctaLabel,
      image_url: imageUrl,
      starts_at: startsAt,
      ends_at: endsAt,
      active: active ? 1 : 0,
      voucher_type: voucherType,
      voucher_category: before?.voucher_category || "REGULAR",
      discount_value: voucherType ? discountValue : 0,
      minimum_order: voucherType ? minimumOrder : 0,
      max_discount: voucherType ? maxDiscount : null,
      quota: voucherType ? quota : null,
      used_count: Number(before?.used_count || 0),
      one_per_customer: 1,
    };
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PROMOTION_SAVED",
      JSON.stringify({
        entity: "promotion",
        entityId: Number(id),
        before,
        after,
      }),
    );
    return { ...after, status: statusOf(after) };
  });
}
