import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "rbac-test-")),
  "data.db",
);
process.env.SESSION_SECRET = "rbac-test-secret-with-more-than-32-bytes";

const { db } = await import("../lib/db.mjs");
const { CAPABILITIES, FINAL_ROLES, hasCapability, isFinalRole } =
  await import("../lib/rbac.mjs");
const { DomainError, requiredCapability } = await import("../lib/domain.mjs");
const { saveCategory, saveProduct } = await import("../lib/catalog.mjs");
const { adjustStock } = await import("../lib/operations.mjs");
const { listPromotions, savePromotion } = await import("../lib/promotions.mjs");
const { listNotifications } = await import("../lib/notifications.mjs");
const { createStaff, listStaff, resetStaffPassword } =
  await import("../lib/staff.mjs");
const { checkPassword, currentUser, hashPassword, issueSession } =
  await import("../lib/auth.mjs");

const database = db();
const password = "initial-password-for-rbac";
for (const role of FINAL_ROLES)
  database
    .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(role, role.toLowerCase() + "@rbac.test", hashPassword(password), role);

const byRole = Object.fromEntries(
  database
    .prepare("SELECT id,role FROM users")
    .all()
    .map((user) => [user.role, user]),
);
const owner = byRole.OWNER;
const manager = byRole.MANAGER;
const admin = byRole.ADMIN;
const kitchen = byRole.KITCHEN;
const driver = byRole.DRIVER;
const customer = byRole.CUSTOMER;

const promotion = () => ({
  title: "Promo Manager",
  description: "Promo khusus pengujian RBAC Manager",
  badge: "PROMO TEST",
  terms: "Berlaku selama pengujian",
  ctaLabel: "Pilih Menu",
  imageUrl: "",
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  active: true,
});

test("model role final tidak memuat Cashier/Kasir dan permission map terpisah", () => {
  assert.deepEqual(FINAL_ROLES, [
    "OWNER",
    "MANAGER",
    "ADMIN",
    "KITCHEN",
    "DRIVER",
    "CUSTOMER",
  ]);
  assert.equal(isFinalRole("CASHIER"), false);
  assert.equal(isFinalRole("KASIR"), false);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.CATALOG_WRITE), true);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.STOCK_WRITE), true);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.PROMOTION_WRITE), true);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.NOTIFICATIONS_READ), true);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.SETTINGS_READ), false);
  assert.equal(hasCapability("MANAGER", CAPABILITIES.SETTINGS_WRITE), false);
  assert.equal(hasCapability("OWNER", CAPABILITIES.SETTINGS_READ), true);
  assert.equal(hasCapability("OWNER", CAPABILITIES.SETTINGS_WRITE), true);
  assert.equal(hasCapability("OWNER", CAPABILITIES.CATALOG_WRITE), false);
  assert.equal(hasCapability("OWNER", CAPABILITIES.STOCK_WRITE), false);
  assert.equal(hasCapability("ADMIN", CAPABILITIES.CATALOG_WRITE), false);
  assert.equal(hasCapability("ADMIN", CAPABILITIES.ORDERS_OPERATE), true);
  assert.equal(hasCapability("ADMIN", CAPABILITIES.PAYMENTS_VERIFY), true);
  assert.equal(hasCapability("KITCHEN", CAPABILITIES.KITCHEN_PREPARE), true);
  assert.equal(hasCapability("KITCHEN", CAPABILITIES.PAYMENTS_VERIFY), false);
  assert.equal(hasCapability("DRIVER", CAPABILITIES.DELIVERY_OWN), true);
  assert.equal(hasCapability("DRIVER", CAPABILITIES.DELIVERY_READ), false);
  assert.equal(hasCapability("CUSTOMER", CAPABILITIES.STAFF_MANAGE), false);
});

test("unauthenticated menghasilkan 401 dan role tanpa capability menghasilkan 403", () => {
  assert.throws(
    () => requiredCapability(null, CAPABILITIES.CATALOG_WRITE),
    (error) => error instanceof DomainError && error.status === 401,
  );
  assert.throws(
    () => requiredCapability(admin, CAPABILITIES.CATALOG_WRITE),
    (error) => error instanceof DomainError && error.status === 403,
  );
});

test("endpoint global settings meneruskan user ke guard server", () => {
  const route = fs.readFileSync(
    path.resolve("app/api/[action]/route.js"),
    "utf8",
  );
  assert.match(route, /action === "settings"[\s\S]*?getSettings\(user\)/);
  assert.match(
    route,
    /action === "settings"[\s\S]*?saveSettings\(user, body\)/,
  );
});

test("Manager mengelola katalog dan stok sementara Owner/Admin tidak menjadi editor", async () => {
  await saveCategory(manager, { name: "Makanan RBAC" });
  await saveProduct(manager, {
    name: "Menu RBAC",
    description: "Produk pengujian role Manager",
    price: 25000,
    categoryId: 1,
    prepStation: "KITCHEN",
    active: true,
  });
  await assert.rejects(
    saveProduct(owner, {
      id: 1,
      name: "Menu RBAC",
      description: "Harga diperbarui Owner",
      price: 27000,
      categoryId: 1,
      active: true,
    }),
    /Akses/,
  );
  await adjustStock(manager, {
    productId: 1,
    quantity: 10,
    reason: "Stok Manager",
  });
  await assert.rejects(
    adjustStock(owner, {
      productId: 1,
      quantity: -2,
      reason: "Koreksi Owner",
    }),
    /Akses/,
  );
  await savePromotion(manager, promotion());
  assert.equal((await listPromotions(owner)).length, 1);
  assert.deepEqual(await listNotifications(manager), {
    notifications: [],
    unread: 0,
  });

  await assert.rejects(saveCategory(admin, { name: "Ditolak" }), /Akses/);
  await assert.rejects(
    saveProduct(admin, {
      name: "Ditolak Admin",
      description: "Tidak boleh mengubah katalog",
      price: 1000,
      categoryId: 1,
      active: true,
    }),
    /Akses/,
  );
  await assert.rejects(
    adjustStock(admin, {
      productId: 1,
      quantity: 1,
      reason: "Ditolak",
    }),
    /Akses/,
  );
  await assert.rejects(savePromotion(admin, promotion()), /Akses/);
  assert.equal(
    database.prepare("SELECT price FROM products WHERE id=1").get().price,
    25000,
  );
  assert.equal(
    database.prepare("SELECT stock_quantity FROM products WHERE id=1").get()
      .stock_quantity,
    10,
  );
});

test("Owner membuat staf terbatas, reset password aman, mencabut sesi, dan tercatat", async () => {
  await assert.rejects(
    createStaff(manager, {
      role: "ADMIN",
      name: "Admin Ilegal",
      email: "illegal-manager@rbac.test",
      password: "a-secure-password-123",
    }),
    /Akses/,
  );
  await assert.rejects(
    createStaff(admin, {
      role: "MANAGER",
      name: "Manager Ilegal",
      email: "illegal-admin@rbac.test",
      password: "a-secure-password-123",
    }),
    /Akses/,
  );
  await assert.rejects(
    createStaff(owner, {
      role: "OWNER",
      name: "Owner Ilegal",
      email: "second-owner@rbac.test",
      password: "a-secure-password-123",
    }),
    /tidak valid/,
  );

  const created = await createStaff(owner, {
    role: "MANAGER",
    name: "Manager Baru",
    email: "manager-new@rbac.test",
    password: "a-secure-password-123",
  });
  const token = await issueSession({ id: created.id, role: "MANAGER" });
  const request = { cookies: { get: () => ({ value: token }) } };
  assert.equal((await currentUser(request)).id, created.id);
  await resetStaffPassword(owner, created.id, "new-secure-password-456");
  assert.equal(await currentUser(request), null);
  const stored = database
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(created.id).password_hash;
  assert.equal(checkPassword("a-secure-password-123", stored), false);
  assert.equal(checkPassword("new-secure-password-456", stored), true);

  const listed = await listStaff(owner);
  assert.equal(
    listed.some((member) => member.id === created.id),
    true,
  );
  assert.equal(Object.hasOwn(listed[0], "password_hash"), false);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) count FROM audit_logs WHERE action IN ('STAFF_CREATED','STAFF_PASSWORD_RESET')",
      )
      .get().count,
    2,
  );
});

test("migration MySQL memetakan legacy Cashier ke Admin sebelum enum final", () => {
  const migration = fs.readFileSync(
    path.resolve("migrations/018_manager_rbac.sql"),
    "utf8",
  );
  assert.match(migration, /CASHIER/);
  assert.match(migration, /KASIR/);
  assert.match(migration, /SET role='ADMIN'/);
  assert.match(
    migration,
    /ENUM\('OWNER','MANAGER','ADMIN','KITCHEN','DRIVER','CUSTOMER'\)/,
  );
});

test("UI Manager/Owner tersedia tanpa mengandalkan hiding sebagai guard", () => {
  const page = fs.readFileSync(path.resolve("app/page.js"), "utf8");
  assert.match(page, /role === "MANAGER"/);
  assert.match(page, /setView\("staff"\)/);
  assert.doesNotMatch(page, />Kasir · minuman</);
  const managerNavigationStart = page.indexOf('{role === "MANAGER" && (');
  const ownerNavigationStart = page.indexOf(
    '{role === "OWNER" && (',
    managerNavigationStart,
  );
  assert.notEqual(managerNavigationStart, -1);
  assert.notEqual(ownerNavigationStart, -1);
  const managerNavigation = page.slice(
    managerNavigationStart,
    ownerNavigationStart,
  );
  assert.match(managerNavigation, />Produk</);
  assert.match(managerNavigation, />Promo</);
  assert.match(managerNavigation, />Stok</);
  assert.doesNotMatch(managerNavigation, /setView\("settings"\)/);
  assert.match(page.slice(ownerNavigationStart), /setView\("settings"\)/);
  assert.match(page, /role === "OWNER" && view === "settings"/);
  assert.doesNotMatch(
    page,
    /\["MANAGER", "OWNER"\]\.includes\(role\) && view === "settings"/,
  );
});
