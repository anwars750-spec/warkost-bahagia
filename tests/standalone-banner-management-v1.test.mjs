import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "standalone-banner-test-")),
  "data.db",
);

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { db } = await import("../lib/db.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const { savePromotion } = await import("../lib/promotions.mjs");
const { deleteBanner, listActiveBanners, listBanners, saveBanner } =
  await import("../lib/banners.mjs");

const database = db();
for (const role of ["MANAGER", "OWNER", "ADMIN", "CUSTOMER"])
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, `${role.toLowerCase()}@banner.test`, "x", role);

const manager = { id: 1, role: "MANAGER" };
const owner = { id: 2, role: "OWNER" };
const admin = { id: 3, role: "ADMIN" };
const customer = { id: 4, role: "CUSTOMER" };
const bannerInput = (name, sortOrder, active = true) => ({
  internalName: name,
  imageUrl: `https://cdn.example.test/${name.toLowerCase()}.webp`,
  active,
  sortOrder,
});

test("banner default customer tersinkron satu kali ke resource mandiri", async () => {
  const initial = await listBanners(owner);
  assert.equal(initial.length, 1);
  assert.equal(initial[0].internal_name, "Banner Utama Warkost");
  assert.equal(initial[0].image_url, "/demo/promo-warkost.webp");
  assert.equal(initial[0].active, 1);
  assert.equal(initial[0].sort_order, 0);
  assert.equal(
    database
      .prepare("SELECT value FROM settings WHERE `key`='standalone_banner_initialized_v1'")
      .get().value,
    "1",
  );

  await deleteBanner(manager, initial[0].id);
  assert.deepEqual(await listBanners(owner), []);
});

test("banner memakai resource mandiri, RBAC Manager, dan urutan server", async () => {
  await assert.rejects(saveBanner(admin, bannerInput("Ditolak", 1)), /Akses/);
  await assert.rejects(
    saveBanner(customer, bannerInput("Ditolak", 1)),
    /Akses/,
  );

  const second = await saveBanner(manager, bannerInput("Kedua", 20));
  const first = await saveBanner(manager, bannerInput("Pertama", 10));
  await saveBanner(manager, bannerInput("Nonaktif", 0, false));

  assert.deepEqual(
    (await listActiveBanners()).map((banner) => banner.id),
    [first.id, second.id],
  );
  assert.deepEqual(Object.keys((await listActiveBanners())[0]).sort(), [
    "id",
    "image_url",
    "sort_order",
  ]);

  const catalog = await listCatalog(false);
  assert.deepEqual(
    catalog.banners.map((banner) => banner.id),
    [first.id, second.id],
  );
  assert.equal("internal_name" in catalog.banners[0], false);
  assert.deepEqual((await listCatalog(true)).banners, []);
});

test("edit, aktivasi, replace image, dan delete tidak menyentuh promo", async () => {
  const before = await listBanners(manager);
  const target = before.find((banner) => banner.internal_name === "Kedua");
  const promotion = await savePromotion(manager, {
    title: "Promo Tetap",
    description: "Promo tidak menjadi sumber banner",
    badge: "PROMO",
    terms: "Berlaku untuk pengujian",
    ctaLabel: "Pilih Menu",
    imageUrl: "",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    active: true,
  });

  await saveBanner(manager, {
    id: target.id,
    internalName: "Kedua Diperbarui",
    imageUrl: "https://cdn.example.test/replacement.webp",
    active: false,
    sortOrder: 5,
  });

  const updated = (await listBanners(manager)).find(
    (banner) => banner.id === target.id,
  );
  assert.equal(updated.internal_name, "Kedua Diperbarui");
  assert.equal(updated.image_url, "https://cdn.example.test/replacement.webp");
  assert.equal(updated.active, 0);
  assert.equal(updated.sort_order, 5);
  assert.equal(
    database
      .prepare("SELECT title FROM promotions WHERE id=?")
      .get(promotion.id).title,
    "Promo Tetap",
  );

  await deleteBanner(manager, target.id);
  assert.equal(
    (await listBanners(manager)).some((banner) => banner.id === target.id),
    false,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) count FROM promotions").get().count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action IN ('BANNER_CREATED','BANNER_UPDATED','BANNER_DELETED')",
      )
      .get().count,
    6,
  );
});

test("schema dan API banner terpisah dari promotions", () => {
  const migration = read("migrations/032_standalone_banner_management_v1.sql");
  const route = read("app/api/[action]/route.js");
  assert.match(migration, /CREATE TABLE banners/);
  for (const field of [
    "id",
    "internal_name",
    "image_url",
    "active",
    "sort_order",
    "created_at",
    "updated_at",
  ])
    assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /Banner Utama Warkost/);
  assert.match(migration, /standalone_banner_initialized_v1/);
  assert.doesNotMatch(migration, /promotion_id|FOREIGN KEY.*promotions/i);
  assert.match(route, /action === "banners"/);
  assert.match(route, /action === "banner"/);
  assert.match(route, /action === "banner-delete"/);
});

test("Manager menyediakan add, edit, replace, status, order, delete, active nav, dan icon polish", () => {
  const managerUi = read("app/ManagerBannerCenter.js");
  const managerCss = read("app/ManagerBannerCenter.module.css");
  const page = read("app/page.js");
  const polish = read("app/ManagerDashboardUiPolish.js");
  assert.match(managerUi, /Tambah Banner/);
  assert.match(managerUi, /Edit Banner/);
  assert.match(managerUi, /Pilih gambar pengganti/);
  assert.match(managerUi, /Informasi Banner/);
  assert.match(managerUi, /Pengaturan Tampil/);
  assert.match(managerUi, /sortOrder/);
  assert.match(managerUi, /Nonaktifkan/);
  assert.match(managerUi, /window\.confirm/);
  assert.match(managerUi, /banner-delete/);
  assert.match(managerCss, /\.formSection/);
  assert.match(managerCss, /\.uploadField/);
  assert.match(managerCss, /\.toggle/);
  assert.match(page, /setView\("banners"\)/);
  assert.match(polish, /\["Banner", "banners"\]/);
  assert.match(polish, /\["Jam Operasional", "store-hours"\]/);
  assert.match(polish, /navIconMasks/);
  assert.match(polish, /return "banners"/);
  assert.match(polish, /querySelectorAll\("h1, h2"\)/);
});

test("Customer hanya merender gambar banner penuh dan fallback aman", () => {
  const page = read("app/page.js");
  const css = read("app/customer-banner-carousel.css");
  const start = page.indexOf('<section className="home-banner"');
  const end = page.indexOf('<section className="customer-catalog"', start);
  const markup = page.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(page, /const activeBanners = menu\.banners \|\| \[\]/);
  assert.match(page, /id: "fallback"/);
  assert.match(markup, /<img/);
  assert.doesNotMatch(
    markup,
    /activePromo|title|description|badge|starts_at|ends_at|cta_label/,
  );
  assert.match(css, /object-fit: contain/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /height: auto/);
});
