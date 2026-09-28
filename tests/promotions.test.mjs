import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "promotion-test-")),
  "data.db",
);

const { db } = await import("../lib/db.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const { listActivePromotions, listPromotions, savePromotion } =
  await import("../lib/promotions.mjs");

const database = db();
for (const role of ["ADMIN", "CUSTOMER", "OWNER"])
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, role.toLowerCase() + "@promo.test", "x", role);

const admin = { id: 1, role: "ADMIN" };
const customer = { id: 2, role: "CUSTOMER" };
const owner = { id: 3, role: "OWNER" };
const hours = (amount) => new Date(Date.now() + amount * 3600000).toISOString();
const payload = (title, startHours, endHours, active = true) => ({
  title,
  description: `Deskripsi ${title}`,
  badge: "PROMO TEST",
  terms: "Syarat promo test berlaku",
  ctaLabel: "Pilih Menu",
  imageUrl: "",
  startsAt: hours(startHours),
  endsAt: hours(endHours),
  active,
});

test("hanya Admin dapat mengelola promo dan input divalidasi", async () => {
  await assert.rejects(
    savePromotion(customer, payload("Ditolak", -1, 1)),
    /Akses/,
  );
  await assert.rejects(
    savePromotion(owner, payload("Ditolak", -1, 1)),
    /Akses/,
  );
  await assert.rejects(listPromotions(owner), /Akses/);
  await assert.rejects(
    savePromotion(admin, payload("Tanggal salah", 2, 1)),
    /setelah waktu mulai/,
  );
  await assert.rejects(
    savePromotion(admin, {
      ...payload("Gambar salah", -1, 1),
      imageUrl: "http://tidak-aman.test/promo.jpg",
    }),
    /Gambar promo tidak valid/,
  );
  await assert.rejects(
    savePromotion(admin, {
      ...payload("Media hilang", -1, 1),
      imageUrl: "/api/media/00000000-0000-4000-8000-000000000000",
    }),
    /Gambar promo tidak ditemukan/,
  );
});

test("customer hanya menerima promo aktif pada jendela waktu server", async () => {
  const active = await savePromotion(admin, payload("Aktif", -1, 1));
  await savePromotion(admin, payload("Terjadwal", 1, 2));
  await savePromotion(admin, payload("Kedaluwarsa", -2, -1));
  await savePromotion(admin, payload("Dinonaktifkan", -1, 1, false));

  const insertBoundary = database.prepare(
    "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,created_by,updated_by) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,datetime(CURRENT_TIMESTAMP,'+1 hour'),1,1,1)",
  );
  insertBoundary.run(
    "Batas mulai",
    "Aktif tepat pada waktu mulai",
    "BATAS",
    "Berlaku sekarang",
    "Pilih Menu",
  );
  database
    .prepare(
      "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,created_by,updated_by) VALUES(?,?,?,?,?,datetime(CURRENT_TIMESTAMP,'-1 hour'),CURRENT_TIMESTAMP,1,1,1)",
    )
    .run(
      "Batas selesai",
      "Tidak aktif tepat pada waktu selesai",
      "BATAS",
      "Sudah selesai",
      "Pilih Menu",
    );

  const visible = await listActivePromotions();
  assert.deepEqual(
    new Set(visible.map((item) => item.title)),
    new Set(["Aktif", "Batas mulai"]),
  );
  const catalog = await listCatalog(false);
  assert.deepEqual(
    new Set(catalog.promotions.map((item) => item.title)),
    new Set(["Aktif", "Batas mulai"]),
  );
  assert.deepEqual((await listCatalog(true)).promotions, []);

  const all = await listPromotions(admin);
  assert.equal(all.find((item) => item.title === "Aktif").status, "ACTIVE");
  assert.equal(
    all.find((item) => item.title === "Terjadwal").status,
    "SCHEDULED",
  );
  assert.equal(
    all.find((item) => item.title === "Kedaluwarsa").status,
    "EXPIRED",
  );
  assert.equal(
    all.find((item) => item.title === "Dinonaktifkan").status,
    "INACTIVE",
  );

  const updated = await savePromotion(admin, {
    ...payload("Aktif diperbarui", -1, 2),
    id: active.id,
  });
  assert.equal(updated.status, "ACTIVE");
  const audit = database
    .prepare(
      "SELECT details FROM audit_logs WHERE action='PROMOTION_SAVED' ORDER BY id DESC LIMIT 1",
    )
    .get();
  const details = JSON.parse(audit.details);
  assert.equal(details.entity, "promotion");
  assert.equal(details.entityId, active.id);
  assert.equal(details.before.title, "Aktif");
  assert.equal(details.after.title, "Aktif diperbarui");
});
