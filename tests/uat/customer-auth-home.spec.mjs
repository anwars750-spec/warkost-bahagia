import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// OTPs and generated credentials must never be retained in traces/screenshots.
test.use({ trace: "off", screenshot: "off", video: "off" });
const customer = { id: 101, name: "Customer Fixture", role: "CUSTOMER" };
const password = "CustomerBrowserFixture#2026";
const food = {
  id: 1,
  category_id: 1,
  subcategory_id: 1,
  name: "Nasi Goreng Warkost",
  description: "Menu fixture",
  price: 25000,
  image_url: "/demo/nasi-goreng-warkost.webp",
  available_quantity: 10,
  stock_quantity: 10,
  stock_unit: "PCS",
  price_unit_quantity: 1,
  minimum_order_quantity: 1,
  order_step_quantity: 1,
  prep_station: "KITCHEN",
};

async function fixture(page, options = {}) {
  const state = {
    authenticated: !!options.authenticated,
    failMe: !!options.failMe,
    failRegister: !!options.failRegister,
    writes: [],
    reads: {},
    verified: false,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      key = new URL(request.url()).pathname.replace(/^\/api\//, ""),
      body = request.postDataJSON();
    const reply = (data, status = 200) => route.fulfill({ status, json: data });
    if (request.method() === "POST") {
      state.writes.push(key);
      if (key === "register") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (state.failRegister)
          return reply({ error: "Terjadi kesalahan server" }, 500);
        return reply(
          {
            pending: true,
            challengeId: "fixture-registration",
            destination: "cu***@example.test",
            resendAfterSeconds: 60,
            message: "Kode verifikasi telah dikirim ke email Anda.",
          },
          201,
        );
      }
      if (key === "otp-verify") {
        if (body.code !== "739251")
          return reply({ error: "Kode OTP tidak valid" }, 401);
        state.verified = true;
        state.authenticated = true;
        return reply({ verified: true, user: customer });
      }
      if (key === "otp-resend")
        return reply({
          challengeId: "fixture-resent",
          destination: "cu***@example.test",
          resendAfterSeconds: 60,
          message: "Kode baru telah dikirim ke email Anda.",
        });
      if (key === "login") {
        if (
          body.identifier !== "customer@warkost.local" ||
          body.password !== password
        )
          return reply({ error: "Email/nomor HP atau password salah" }, 401);
        state.authenticated = true;
        return reply({ user: customer });
      }
      if (key === "logout") {
        state.authenticated = false;
        return reply({ ok: true });
      }
      if (key === "notification-read") return reply({ ok: true });
      if (key === "password-reset-request")
        return reply({
          challengeId: "reset-fixture",
          destination: "email terdaftar",
          resendAfterSeconds: 60,
          message:
            "Jika akun ditemukan, kode verifikasi telah dikirim ke email yang terdaftar.",
        });
      return reply({ ok: true });
    }
    state.reads[key] = (state.reads[key] || 0) + 1;
    if (key === "me" && state.failMe)
      return reply({ error: "Terjadi kesalahan server" }, 500);
    const responses = {
      me: { user: state.authenticated ? customer : null },
      menu: {
        brand: "Warkost Bahagia",
        products: [
          food,
          {
            ...food,
            id: 2,
            category_id: 2,
            subcategory_id: 2,
            name: "Kopi Susu",
            prep_station: "CASHIER",
          },
        ],
        categories: [
          { id: 1, name: "Makanan" },
          { id: 2, name: "Minuman" },
        ],
        subcategories: [
          { id: 1, category_id: 1, name: "Nasi", sort_order: 0 },
          { id: 2, category_id: 2, name: "Kopi", sort_order: 0 },
        ],
        banners: [
          { id: 1, image_url: "/demo/promo-warkost.webp" },
          { id: 2, image_url: "/demo/nasi-goreng-warkost.webp" },
        ],
      },
      "store-hours": { isOpen: true, openTime: "08:00", closeTime: "22:00" },
      orders: { orders: [], nextCursor: null },
      notifications: {
        notifications: [
          {
            id: 1,
            message: "Pesanan fixture siap",
            created_at: new Date().toISOString(),
            read_at: null,
          },
        ],
        unread: 1,
      },
      account: {
        profile: {
          name: customer.name,
          email: "customer@warkost.local",
          phone: "081234567890",
          birth_date: "1996-09-18",
        },
        addresses: [
          {
            id: 1,
            label: "Rumah Fixture",
            detail: "Alamat fixture yang tersimpan",
            latitude: -6.9217,
            longitude: 106.9272,
            is_default: 1,
          },
        ],
        loyalty: 25,
        transactions: [],
        vouchers: [],
        promotions: [],
        rewards: [],
      },
    };
    if (key === "realtime")
      return route.fulfill({
        contentType: "text/event-stream",
        body: "event: connected\ndata: {}\n\n",
      });
    return reply(responses[key] || {});
  });
  return state;
}
async function openRegister(page) {
  await page.goto("/");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  await page
    .locator(".auth-login-card")
    .getByRole("button", { name: "Belum punya akun? Daftar Akun", exact: true })
    .click();
  await expect(page.locator(".auth-onboarding form")).toHaveCount(1);
}
async function fillRegistration(page, overrides = {}) {
  const form = page.locator(".auth-register-card form");
  for (const [name, value] of Object.entries({
    name: "Customer Fixture",
    email: "new-customer@example.test",
    phone: "081234567890",
    birthDate: "1996-09-18",
    password,
    passwordConfirmation: password,
    ...overrides,
  }))
    await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="consent"]').check();
  return form;
}
const registerButton = (form) =>
  form.getByRole("button", { name: "Daftar Akun", exact: true });
async function assertFeedback(page, text) {
  const alert = page.locator('.auth-card [role="alert"]');
  await expect(alert).toContainText(text);
  await expect(alert).toBeInViewport();
}
async function login(
  page,
  identifier = "customer@warkost.local",
  secret = password,
) {
  const form = page.locator(".auth-login-card form");
  await form.locator('[name="identifier"]').fill(identifier);
  await form.locator('[name="password"]').fill(secret);
  await form.getByRole("button", { name: "Masuk", exact: true }).click();
}
async function watchAuthenticatedFrames(page) {
  await page.addInitScript(() => {
    window.customerFrameViolations = [];
    const check = () => {
      if (
        document.querySelector("header.customer-home-header") &&
        (document.querySelector(".auth-onboarding") ||
          document.querySelector(".guest-product-cta"))
      )
        window.customerFrameViolations.push(
          "guest/auth content in Customer session",
        );
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

test("registration submits once, shows busy state, rejects wrong OTP and supports resend/activation", async ({
  page,
}) => {
  await page.clock.install();
  const state = await fixture(page);
  await openRegister(page);
  const form = await fillRegistration(page);
  await registerButton(form).click();
  await expect(
    form.getByRole("button", { name: "Memproses…", exact: true }),
  ).toBeDisabled();
  // Exercise the synchronous request guard even if a second submit bypasses disabled HTML.
  await form.evaluate((form) =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  await expect(page.locator(".auth-otp-card")).toBeVisible();
  expect(state.writes.filter((k) => k === "register")).toHaveLength(1);
  await expect(page.locator(".auth-onboarding form")).toHaveCount(1);
  await page.locator('[name="code"]').fill("000001");
  await page
    .getByRole("button", { name: "Verifikasi Kode", exact: true })
    .click();
  await assertFeedback(page, "Kode OTP tidak valid");
  await expect(
    page.getByRole("button", { name: /Kirim ulang dalam/ }),
  ).toBeDisabled();
  await page.clock.fastForward(61_000);
  await page
    .getByRole("button", { name: "Kirim Ulang Kode", exact: true })
    .click();
  expect(state.writes.filter((k) => k === "otp-resend")).toHaveLength(1);
  await page.locator('[name="code"]').fill("739251");
  await page
    .getByRole("button", { name: "Verifikasi Kode", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Akun Sudah Aktif" }),
  ).toBeVisible();
  expect(state.verified).toBe(true);
  await page.getByRole("button", { name: "Mulai Pesan", exact: true }).click();
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  await expect(
    page.locator('.customer-catalog[data-customer-ui-owner="react"]'),
  ).toBeVisible();
});
test("invalid registration and backend failure always provide visible feedback without false OTP success", async ({
  page,
}) => {
  const state = await fixture(page, { failRegister: true });
  await openRegister(page);
  let form = await fillRegistration(page, {
    password: "Aman#2026",
    passwordConfirmation: "Aman#2026",
  });
  await registerButton(form).click();
  await assertFeedback(page, "10 sampai 128");
  expect(state.writes).toEqual([]);
  await form.locator('[name="password"]').fill(password);
  await registerButton(form).click();
  await assertFeedback(page, "Konfirmasi password tidak cocok");
  expect(state.writes).toEqual([]);
  await form.locator('[name="passwordConfirmation"]').fill(password);
  await registerButton(form).click();
  await assertFeedback(page, "Terjadi kesalahan server");
  await expect(page.locator(".auth-otp-card")).toHaveCount(0);
  await expect(registerButton(form)).toBeEnabled();
  expect(state.writes).toEqual(["register"]);
});
test("login, modern catalog, account, notifications, refresh and React logout preserve Customer ownership", async ({
  page,
}) => {
  await watchAuthenticatedFrames(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  await login(page, "customer@warkost.local", "wrong");
  await assertFeedback(page, "password salah");
  const form = page.locator(".auth-login-card form");
  await form
    .getByRole("button", { name: "Tampilkan password", exact: true })
    .click();
  await expect(form.locator('[name="password"]')).toHaveAttribute(
    "type",
    "text",
  );
  await form
    .getByRole("button", { name: "Sembunyikan password", exact: true })
    .click();
  await login(page);
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  await page
    .getByRole("button", { name: "Tampilkan semua kategori", exact: true })
    .click();
  await expect(page.locator("#menu-title")).toHaveText("Semua Menu");
  await expect(page.locator(".catalog-group-category-heading")).toHaveCount(2);
  await page
    .locator('.filters[aria-label="Kategori produk"]')
    .getByRole("button", { name: "Makanan", exact: true })
    .click();
  await expect(page.locator("#menu-title")).toHaveText("Makanan");
  await expect(page.locator(".customer-product")).toHaveCount(1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.reload();
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  await expect(page.locator(".auth-onboarding")).toHaveCount(0);
  await expect(page.locator(".guest-product-cta")).toHaveCount(0);
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Akun", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pengaturan Akun", exact: true })
    .click();
  await expect(page.locator(".account-overview")).toContainText(customer.name);
  await expect(page.locator("#account-address")).toContainText("Rumah Fixture");
  await expect(
    page.locator('#account-settings input[name="email"]'),
  ).toHaveValue("customer@warkost.local");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Buka notifikasi", exact: true })
    .click();
  await expect(page.locator(".notification-list")).toContainText(
    "Pesanan fixture siap",
  );
  await page.keyboard.press("Escape");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Akun", exact: true })
    .click();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Konfirmasi keluar CUSTOMER",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page.locator("header.customer-home-header")).toHaveCount(0);
  await expect(page.locator(".guest-product-cta").first()).toBeVisible();
  expect(state.authenticated).toBe(false);
  expect(state.writes.filter((k) => k === "logout")).toHaveLength(1);
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  await login(page);
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  expect(await page.evaluate(() => window.customerFrameViolations)).toEqual([]);
  expect(errors).toEqual([]);
});
test("session failure stays unresolved and retry restores the authenticated Customer without guest leakage", async ({
  page,
}) => {
  await watchAuthenticatedFrames(page);
  const state = await fixture(page, { authenticated: true, failMe: true });
  await page.goto("/");
  await expect(page.locator('header [role="alert"]')).toContainText(
    "Sesi belum dapat diperiksa",
  );
  await expect(
    page.locator(".customer-catalog,.auth-onboarding,.guest-product-cta"),
  ).toHaveCount(0);
  state.failMe = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  await expect(page.locator(".customer-catalog")).toBeVisible();
  await expect.poll(() => state.reads.account || 0).toBe(1);
  expect(await page.evaluate(() => window.customerFrameViolations)).toEqual([]);
});
test("session invalidation clears Customer identity and presents visible login feedback", async ({
  page,
}) => {
  const state = await fixture(page, { authenticated: true });
  await page.goto("/");
  await expect(page.locator("header.customer-home-header")).toBeVisible();
  state.authenticated = false;
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("warkost:session-invalidated")),
  );
  await expect(page.locator(".auth-login-card")).toBeVisible();
  await assertFeedback(page, "Sesi Anda telah berakhir");
  await expect(page.locator("header.customer-home-header")).toHaveCount(0);
  await expect(page.locator(".auth-onboarding form")).toHaveCount(1);
});
test("banner selection and rotation are owned by the modern homepage", async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page);
  await page.goto("/");
  const banner = page.getByRole("region", { name: "Banner Warkost" });
  await banner.getByRole("button", { name: "Tampilkan banner 2" }).click();
  await expect(
    banner.getByRole("button", { name: "Tampilkan banner 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward(6_000);
  await expect(
    banner.getByRole("button", { name: "Tampilkan banner 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  const card = banner.locator(".banner-card");
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  for (const [from, to, expected] of [
    [0.8, 0.2, 2],
    [0.2, 0.8, 1],
  ]) {
    await page.mouse.move(box.x + box.width * from, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(
      banner.getByRole("button", { name: `Tampilkan banner ${expected}` }),
    ).toHaveAttribute("aria-pressed", "true");
  }
});

const fixtureDir = process.env.CUSTOMER_AUTH_FIXTURE_DIRECTORY;
test("real isolated registration, mail invocation, OTP activation, legacy Customer login and reset contract", async ({
  page,
}) => {
  test.skip(
    !fixtureDir,
    "Requires dedicated local development mail fixture, never live SMTP",
  );
  test.setTimeout(90_000);
  const resolved = path.resolve(fixtureDir),
    allowed = path.resolve(".uat") + path.sep;
  expect(
    resolved.startsWith(allowed) &&
      /^customer-auth-[0-9a-f]{32}$/.test(path.basename(resolved)),
  ).toBe(true);
  const database = new DatabaseSync(path.join(resolved, "browser.db"));
  const email = `auth-${crypto.randomUUID()}@example.test`;
  const phone = "0812" + String(Date.now()).slice(-8);
  const mail = () =>
    JSON.parse(
      fs.readFileSync(path.join(resolved, "mail.json"), "utf8"),
    ).filter((item) => item.to === email);
  const code = () =>
    mail()
      .at(-1)
      .text.match(/\b\d{6}\b/)[0];
  async function bridge(response) {
    const raw = (await response.headerValue("set-cookie"))?.match(
      /(?:^|,\s*)wb_session=([^;]+)/,
    )?.[1];
    if (raw) {
      await page.context().clearCookies();
      await page.context().addCookies([
        {
          name: "wb_session",
          value: raw,
          url: new URL(page.url()).origin,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    }
  }
  try {
    await openRegister(page);
    const form = await fillRegistration(page, { email, phone });
    const [registered] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/register")),
      registerButton(form).click(),
    ]);
    expect(registered.status()).toBe(201);
    const result = await registered.json();
    expect("otp" in result).toBe(false);
    await expect(page.locator(".auth-otp-card")).toBeVisible();
    expect(mail().length).toBe(1);
    const pending = database
      .prepare("SELECT active,email_verified_at FROM users WHERE email=?")
      .get(email);
    expect(pending.active).toBe(0);
    expect(pending.email_verified_at).toBeNull();
    await page
      .locator('[name="code"]')
      .fill(code() === "000001" ? "000002" : "000001");
    await page
      .getByRole("button", { name: "Verifikasi Kode", exact: true })
      .click();
    await assertFeedback(page, "Kode OTP tidak valid");
    // Move only the isolated fixture's last-send time; policy itself remains unchanged.
    database
      .prepare("UPDATE otp_challenges SET last_sent_at=? WHERE public_id=?")
      .run(Date.now() - 61_000, result.challengeId);
    await page.clock.install();
    await page.clock.fastForward(61_000);
    await page
      .getByRole("button", { name: "Kirim Ulang Kode", exact: true })
      .click();
    await expect.poll(() => mail().length).toBe(2);
    await page.locator('[name="code"]').fill(code());
    const [verified] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/otp-verify")),
      page
        .getByRole("button", { name: "Verifikasi Kode", exact: true })
        .click(),
    ]);
    expect(verified.status()).toBe(200);
    await bridge(verified);
    await expect(
      page.getByRole("heading", { name: "Akun Sudah Aktif" }),
    ).toBeVisible();
    expect(
      database.prepare("SELECT active FROM users WHERE email=?").get(email)
        .active,
    ).toBe(1);
    await page
      .getByRole("button", { name: "Mulai Pesan", exact: true })
      .click();
    await expect(page.locator("header.customer-home-header")).toBeVisible();
    await page.reload();
    await expect(page.locator("header.customer-home-header")).toBeVisible();
    await page.context().clearCookies();
    await page.goto("/");
    await page
      .locator("header.top nav")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    const [loggedIn] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/login")),
      login(page),
    ]);
    expect(loggedIn.status()).toBe(200);
    await bridge(loggedIn);
    await page.reload();
    await expect(page.locator("header.customer-home-header")).toBeVisible();
    await page.context().clearCookies();
    await page.goto("/");
    await page
      .locator("header.top nav")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Lupa password?", exact: true })
      .click();
    await page.locator('.auth-recovery-card [name="identifier"]').fill(email);
    await page
      .getByRole("button", { name: "Kirim Kode OTP", exact: true })
      .click();
    await expect(page.locator(".auth-otp-card")).toBeVisible();
    await expect.poll(() => mail().length).toBe(3);
    await page.locator('[name="code"]').fill(code());
    await page
      .getByRole("button", { name: "Verifikasi Kode", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Atur Ulang Password", exact: true }),
    ).toBeVisible();
    const reset = page.locator(".auth-reset-card form");
    const updatedPassword = "CustomerResetFixture#2026";
    await reset.locator('[name="password"]').fill(updatedPassword);
    await reset.locator('[name="passwordConfirmation"]').fill(updatedPassword);
    await page
      .getByRole("button", { name: "Simpan Password Baru", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Password Diperbarui", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Kembali ke Masuk", exact: true })
      .last()
      .click();
    const [resetLogin] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/login")),
      login(page, email, updatedPassword),
    ]);
    expect(resetLogin.status()).toBe(200);
  } finally {
    database.close();
  }
});

test("OTP success renders directly from the authoritative response without waiting for account/menu refresh", async ({
  page,
}) => {
  const state = await fixture(page);
  let verification,
    verifyRequests = 0;
  await page.route("**/api/otp-verify", (route) => {
    verifyRequests++;
    verification = route;
  });
  await openRegister(page);
  const form = await fillRegistration(page);
  await registerButton(form).click();
  await expect(page.locator(".auth-otp-card")).toBeVisible();
  await page.locator('[name="code"]').fill("739251");
  const menuReads = state.reads.menu;
  await page
    .getByRole("button", { name: "Verifikasi Kode", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Memverifikasi…", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".auth-otp-card form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect.poll(() => verifyRequests).toBe(1);
  await expect(page.locator(".auth-success-card")).toHaveCount(0);
  await verification.fulfill({
    status: 200,
    json: { verified: true, user: customer },
  });
  await expect(
    page.getByRole("heading", { name: "Akun Sudah Aktif", exact: true }),
  ).toBeVisible();
  expect(state.reads.account || 0).toBe(0);
  expect(state.reads.menu).toBe(menuReads);
});
