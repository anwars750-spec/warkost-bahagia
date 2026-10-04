import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-local-uat-"));
const setupScript = path.join(projectRoot, "scripts", "setup-local-uat.mjs");
const localPassword = "WarkostLocal#2026";
const fixtureEnvironment = { ...process.env, NODE_ENV: "development" };
delete fixtureEnvironment.DATABASE_URL;
delete fixtureEnvironment.DATABASE_PATH;

function runFixture(environment = fixtureEnvironment, cwd = fixtureRoot) {
  return spawnSync(process.execPath, [setupScript], {
    cwd,
    env: environment,
    encoding: "utf8",
  });
}

const firstSetup = runFixture();
assert.equal(firstSetup.status, 0, firstSetup.stderr);

process.env.DATABASE_PATH = path.join(fixtureRoot, "data", "warkost.db");
process.env.SESSION_SECRET =
  "uat-hotfix-test-secret-with-more-than-32-characters";

const { db } = await import("../lib/db.mjs");
const { close } = await import("../lib/store.mjs");
const { checkPassword } = await import("../lib/auth.mjs");
const { authenticateCustomer } = await import("../lib/customer-auth.mjs");
const { getCustomerAccount } = await import("../lib/account.mjs");
const { listCatalog } = await import("../lib/catalog.mjs");
const database = db();

after(async () => {
  await close();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test("guest storefront menerima produk, kategori, dan promo aktif yang public-safe", async () => {
  const catalog = await listCatalog(false);
  assert.equal(catalog.products.length, 3);
  assert.equal(catalog.categories.length, 2);
  assert.ok(catalog.promotions.length >= 1);
  for (const product of catalog.products) {
    assert.deepEqual(Object.keys(product).sort(), [
      "category_id",
      "description",
      "id",
      "image_url",
      "name",
      "price",
    ]);
    assert.equal("stock_quantity" in product, false);
    assert.equal("prep_station" in product, false);
  }
});

test("promo inactive dan expired tidak masuk katalog guest", async () => {
  const admin = database
    .prepare("SELECT id FROM users WHERE email='admin@warkost.local'")
    .get();
  database
    .prepare(
      "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,created_by,updated_by) VALUES('Expired UAT','Sudah habis','EXPIRED','Tidak berlaku','Tutup',datetime(CURRENT_TIMESTAMP,'-2 day'),datetime(CURRENT_TIMESTAMP,'-1 day'),1,?,?)",
    )
    .run(admin.id, admin.id);
  database
    .prepare(
      "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,created_by,updated_by) VALUES('Inactive UAT','Tidak aktif','OFF','Tidak berlaku','Tutup',datetime(CURRENT_TIMESTAMP,'-1 day'),datetime(CURRENT_TIMESTAMP,'+1 day'),0,?,?)",
    )
    .run(admin.id, admin.id);
  const titles = (await listCatalog(false)).promotions.map(
    (promotion) => promotion.title,
  );
  assert.equal(titles.includes("Expired UAT"), false);
  assert.equal(titles.includes("Inactive UAT"), false);
});

test("private account tetap memerlukan customer terautentikasi", async () => {
  await assert.rejects(getCustomerAccount(null), /masuk terlebih dahulu/);
  await assert.rejects(
    getCustomerAccount({ id: 1, role: "ADMIN" }),
    /Akses/,
  );
});

test("fixture customer lokal deterministik, aman, dan dapat login", async () => {
  const customer = database
    .prepare(
      "SELECT id,email,role,active,password_hash,phone,birth_date FROM users WHERE email='customer@warkost.local'",
    )
    .get();
  assert.equal(customer.role, "CUSTOMER");
  assert.equal(customer.active, 1);
  assert.equal(customer.phone, "6281234567890");
  assert.equal(customer.birth_date, "1996-09-18");
  assert.notEqual(customer.password_hash, localPassword);
  assert.ok(checkPassword(localPassword, customer.password_hash));

  const authenticated = await authenticateCustomer(
    "customer@warkost.local",
    localPassword,
  );
  assert.equal(authenticated.id, customer.id);
  await assert.rejects(
    authenticateCustomer("customer@warkost.local", "password-salah"),
    /password salah/,
  );
});

test("fixture idempotent dan menolak production mode", () => {
  const before = database
    .prepare(
      "SELECT COUNT(*) users FROM users WHERE email='customer@warkost.local'",
    )
    .get().users;
  const rerun = runFixture();
  assert.equal(rerun.status, 0, rerun.stderr);
  const afterCount = database
    .prepare(
      "SELECT COUNT(*) users FROM users WHERE email='customer@warkost.local'",
    )
    .get().users;
  assert.equal(afterCount, before);

  const productionRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "warkost-production-fixture-"),
  );
  const productionEnvironment = {
    ...fixtureEnvironment,
    NODE_ENV: "production",
  };
  const rejected = runFixture(productionEnvironment, productionRoot);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /tidak boleh dijalankan di production/);
  assert.equal(fs.existsSync(path.join(productionRoot, "data", "warkost.db")), false);
  fs.rmSync(productionRoot, { recursive: true, force: true });
});

test("customer inactive ditolak dan response login tidak mengekspos hash", async () => {
  const customer = database
    .prepare("SELECT id FROM users WHERE email='customer@warkost.local'")
    .get();
  database.prepare("UPDATE users SET active=0 WHERE id=?").run(customer.id);
  await assert.rejects(
    authenticateCustomer("customer@warkost.local", localPassword),
    /password salah/,
  );
  database.prepare("UPDATE users SET active=1 WHERE id=?").run(customer.id);

  const routeSource = fs.readFileSync(
    path.join(projectRoot, "app", "api", "[action]", "route.js"),
    "utf8",
  );
  assert.match(
    routeSource,
    /user:\s*{ id: account\.id, name: account\.name, role: account\.role }/,
  );
  assert.doesNotMatch(routeSource, /password_hash:\s*account\.password_hash/);
});

test("onboarding desktop/mobile mempertahankan auth contract dan tanpa OTP palsu", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  const style = fs.readFileSync(
    path.join(projectRoot, "app", "style.css"),
    "utf8",
  );
  for (const field of [
    'name="name"',
    'name="email"',
    'name="phone"',
    'name="password"',
    'name="passwordConfirmation"',
    'name="birthDate"',
    'name="consent"',
  ])
    assert.match(page, new RegExp(field));
  assert.match(page, /Makan Enak Lebih Mudah di Warkost Bahagia/);
  assert.match(page, /auth-login-card/);
  assert.match(page, /auth-register-card/);
  assert.match(page, /Tampilkan password/);
  assert.doesNotMatch(page, /auth-flow-ready/);
  assert.doesNotMatch(page, /\["Intro", "ready"\]/);
  assert.doesNotMatch(page, /Google Sign-In|Masuk dengan Google|Apple Sign-In|Masuk dengan Apple/);
  assert.doesNotMatch(page, /OTP berhasil|email terverifikasi/i);
  assert.match(
    style,
    /\.auth-onboarding\s*{[\s\S]*?grid-template-columns:\s*minmax\(360px,[\s\S]*?minmax\(390px/,
  );
  assert.match(style, /\.auth-card\s*{[\s\S]*?display:\s*none/);
  assert.match(style, /\.auth-card\.active\s*{[\s\S]*?display:\s*block/);
  const mobileAuthCss = style.slice(style.indexOf("@media (max-width: 760px)"));
  assert.match(mobileAuthCss, /\.auth-mobile-switch\s*{[\s\S]*?order:\s*1/);
  assert.match(mobileAuthCss, /\.auth-card\s*{[\s\S]*?order:\s*2/);
  assert.match(mobileAuthCss, /\.auth-story-card\s*{[\s\S]*?order:\s*3/);
});

test("aksi produk guest mengarahkan bersih ke login", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  assert.match(
    page,
    /className="guest-product-cta"[\s\S]*?setMode\("login"\);[\s\S]*?setView\("auth"\);[\s\S]*?Pesan/,
  );
  assert.doesNotMatch(page, /Masuk untuk pesan/);
});

test("logo dan header auth mempertahankan proporsi penuh pada desktop/mobile", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  const style = fs.readFileSync(path.join(projectRoot, "app", "style.css"), "utf8");
  assert.equal((page.match(/className="auth-card-logo"/g) || []).length, 2);
  assert.equal((page.match(/width=\{1672\}[\s\S]*?height=\{941\}/g) || []).length, 2);
  assert.match(
    style,
    /\.auth-card-heading \.auth-card-logo\s*{[\s\S]*?aspect-ratio:\s*1672 \/ 941[\s\S]*?object-fit:\s*contain/,
  );
  assert.match(
    style,
    /@media \(max-width: 760px\)[\s\S]*?\.guest-customer-header \.brand\s*{[\s\S]*?flex:\s*1 1 auto[\s\S]*?\.guest-customer-header nav\s*{[\s\S]*?margin-left:\s*14px/,
  );
  assert.match(page, /!role \? "guest-customer-header" : ""/);
});

test("CTA produk dan ringkasan cart mobile memakai hierarchy compact tanpa overlap", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  const style = fs.readFileSync(path.join(projectRoot, "app", "style.css"), "utf8");
  assert.match(page, /<small>\{count\} item di keranjang<\/small>[\s\S]*?<strong>\{money\(total\)\}<\/strong>/);
  assert.match(page, /<span className="floating-cart-cta">[\s\S]*?Buka[\s\S]*?<ArrowIcon \/>/);
  assert.match(style, /\.guest-product-cta\s*{[\s\S]*?min-width:\s*68px/);
  assert.match(
    style,
    /@media \(max-width: 620px\)[\s\S]*?\.customer-home-main\s*{[\s\S]*?padding-bottom:\s*calc\(172px \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(
    style,
    /\.customer-floating-cart\s*{[\s\S]*?bottom:\s*calc\(76px \+ env\(safe-area-inset-bottom\)\)[\s\S]*?min-height:\s*58px/,
  );
});

test("menu akun menjadi satu-satunya entry point delapan aksi akun", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  const overviewStart = page.indexOf('<section className="account-overview"');
  const columnsStart = page.indexOf('<div className="columns account-columns">', overviewStart);
  const overview = page.slice(overviewStart, columnsStart);
  assert.ok(overviewStart >= 0 && columnsStart > overviewStart);
  assert.doesNotMatch(overview, /<button/);
  assert.doesNotMatch(page, /account-shortcuts/);

  const menuStart = page.indexOf('<div className="quick-account-menu">');
  const menuEnd = page.indexOf("</div>\n            )}", menuStart);
  const menu = page.slice(menuStart, menuEnd);
  for (const label of [
    "Pesanan Aktif",
    "Riwayat",
    "Tracking",
    "Voucher &amp; Loyalty",
    "Alamat",
    "Pengaturan Akun",
    "Bantuan",
    "Keluar",
  ])
    assert.equal((menu.match(new RegExp(label, "g")) || []).length, 1, label);
});

test("voucher success auto-dismiss dan quote hanya dipanggil untuk state valid", () => {
  const page = fs.readFileSync(path.join(projectRoot, "app", "page.js"), "utf8");
  assert.match(
    page,
    /function showTransientMessage\(text, duration = 2500\)[\s\S]*?setTimeout\([\s\S]*?setMessage\(\(current\) => \(current === text \? "" : current\)\)[\s\S]*?duration/,
  );
  assert.match(
    page,
    /await api\("voucher-claim", \{ promotionId: voucher\.id \}\);[\s\S]*?showTransientMessage\("Voucher berhasil diklaim\."\)/,
  );
  assert.doesNotMatch(
    page,
    /await api\("voucher-claim", \{ promotionId: voucher\.id \}\);[\s\S]{0,160}?setSelectedVoucherId\(voucher\.id\)/,
  );
  assert.match(
    page,
    /if \(!checkoutItems\.length\)[\s\S]*?if \(!selectedVoucher \|\| selectedVoucher\.state !== "CLAIMED"\)[\s\S]*?if \(total < selectedVoucherMinimumOrder\)[\s\S]*?const controller = new AbortController\(\)/,
  );
  assert.match(
    page,
    /Minimum belanja voucher adalah \$\{money\(selectedVoucherMinimumOrder\)\}/,
  );
});
