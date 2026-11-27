import { randomUUID, createHmac } from "node:crypto";
import { expect, test, request as apiRequest } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD;

if (!password) throw new Error("SEED_DEMO_PASSWORD wajib untuk browser UAT");

function captureConsoleErrors(page) {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      consoleErrors.push(
        location ? `${message.text()} @ ${location}` : message.text(),
      );
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  return consoleErrors;
}

async function ensureLocalAdminShift() {
  const origin = process.env.BASE_URL;
  expect(new URL(origin).hostname).toBe("127.0.0.1");
  const api = await apiRequest.newContext({ baseURL: origin });
  try {
    const headers = async (role) => {
      const res = await api.post("/api/login", {
        data: { identifier: role + "@warkost.local", password },
      });
      expect(res.status()).toBe(200);
      return { Cookie: res.headers()["set-cookie"].split(";")[0] };
    };
    const admin = await headers("admin");
    const state = await api.get("/api/admin-cash-control", { headers: admin });
    expect(state.status()).toBe(200);
    if (!(await state.json()).current_shift) {
      const pin = "173682";
      const operator = await api.post("/api/owner-admin-operators", {
        headers: await headers("owner"),
        data: {
          action: "CREATE",
          name: "Roles UAT " + randomUUID().slice(0, 8),
          pin,
        },
      });
      expect(operator.status()).toBe(201);
      const start = await api.post("/api/admin-cash-control", {
        headers: admin,
        data: {
          action: "START_SHIFT",
          operatorId: (await operator.json()).id,
          pin,
        },
      });
      expect(start.status()).toBe(200);
    }
  } finally {
    await api.dispose();
  }
}

async function signIn(page, email) {
  if (email === "admin@warkost.local") await ensureLocalAdminShift();
  await page.context().clearCookies();
  await page.goto("/");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  const form = page.locator(".auth-login-card form");
  await form.getByLabel("Email atau Nomor HP").fill(email);
  await form.locator('input[name="password"]').fill(password);
  const origin = new URL(page.url());
  const loopback =
    origin.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(origin.hostname);
  // Preserve the real signed session and HTTP-only/SameSite attributes. Remove
  // Secure only at this isolated HTTP transport boundary BEFORE React mounts
  // staff requests, rather than creating a post-login unauthenticated gap.
  const loginTransport = async (route) => {
    const upstream = await route.fetch();
    const headers = { ...upstream.headers() };
    if (headers["set-cookie"])
      headers["set-cookie"] = headers["set-cookie"].replace(
        /;\s*Secure(?=;|$)/gi,
        "",
      );
    await route.fulfill({ response: upstream, headers });
  };
  if (loopback) await page.route("**/api/login", loginTransport);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/login") && r.request().method() === "POST",
    ),
    form.getByRole("button", { name: "Masuk", exact: true }).click(),
  ]);
  if (loopback) await page.unroute("**/api/login", loginTransport);
  expect(response.status()).toBe(200);
  const user = (await response.json()).user;
  expect(user.role).toBe(email.split("@")[0].toUpperCase());
  await page.reload();
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user.role).toBe(user.role);
  if (user.role !== "DRIVER") await expect(page.locator("main")).toBeVisible();
  if (user.role === "ADMIN") {
    const cash = await page.request.get("/api/admin-cash-control");
    expect(cash.status()).toBe(200);
    expect((await cash.json()).current_shift).toBeTruthy();
    await expect(page.locator("body")).not.toHaveClass(
      /admin-shift-gate-(checking|locked)/,
    );
    const panel = page.getByRole("dialog", {
      name: "Setoran dan Shift Admin",
      exact: true,
    });
    if (await panel.isVisible()) {
      await expect(panel).toContainText("SHIFT AKTIF");
      await panel.getByRole("button", { name: "Tutup", exact: true }).click();
    }
  }
  if (user.role === "CUSTOMER")
    await expect(page.locator("header.customer-home-header")).toBeVisible();
  if (user.role === "DRIVER") {
    await expect(page.locator(".driver-v2-root")).toBeVisible();
    await page
      .locator(".driver-v2-nav-link:visible")
      .filter({ hasText: /^Antar$/ })
      .first()
      .click();
  }
}

async function login(page, email) {
  const consoleErrors = captureConsoleErrors(page);
  await signIn(page, email);
  return consoleErrors;
}

async function signOut(page) {
  const cashPanel = page.getByRole("dialog", {
    name: "Setoran dan Shift Admin",
    exact: true,
  });
  if (await cashPanel.isVisible()) {
    const cash = await page.request.get("/api/admin-cash-control");
    expect(cash.status()).toBe(200);
    expect((await cash.json()).current_shift).toBeTruthy();
    await expect(page.locator("body")).not.toHaveClass(
      /admin-shift-gate-(checking|locked)/,
    );
    await cashPanel.getByRole("button", { name: "Tutup", exact: true }).click();
  }
  const kitchen = page.locator('header.top nav [data-kitchen-nav="logout"]');
  const staff = page.locator("button:visible").filter({ hasText: /^Keluar$/ });
  if (await page.locator(".driver-v2-root").isVisible()) {
    await page
      .locator(".driver-v2-nav-link:visible")
      .filter({ hasText: /^Akun$/ })
      .first()
      .click();
    await page.locator(".driver-v2-account-logout").click();
  } else if (await kitchen.isVisible()) await kitchen.click();
  else if (await staff.count()) await staff.first().click();
  else {
    const account = await openCustomerAccountMenu(page);
    await account.getByRole("button", { name: "Keluar", exact: true }).click();
  }
  const confirm = page.getByRole("dialog", { name: /Konfirmasi keluar/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(
    page
      .locator("header.top nav")
      .getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  const me = await page.request.get("/api/me");
  expect((await me.json()).user).toBeNull();
}

function orderCard(page, orderId) {
  return page.getByRole("article").filter({
    has: page.getByText(
      new RegExp(`WB${String(orderId).padStart(6, "0")}\\s*$`),
    ),
  });
}

async function readLocalStockAsOwner(productId) {
  expect(new URL(process.env.BASE_URL).hostname).toBe("127.0.0.1");
  const api = await apiRequest.newContext({ baseURL: process.env.BASE_URL });
  try {
    const login = await api.post("/api/login", {
      data: { identifier: "owner@warkost.local", password },
    });
    expect(login.status()).toBe(200);
    const stock = await api.get("/api/stock", {
      headers: { Cookie: login.headers()["set-cookie"].split(";")[0] },
    });
    expect(stock.status()).toBe(200);
    const product = (await stock.json()).products.find(
      (p) => p.id === productId,
    );
    expect(product).toBeTruthy();
    return product.stock_quantity;
  } finally {
    await api.dispose();
  }
}
async function expectOrderStatus(page, id, status) {
  await expect
    .poll(async () => {
      const response = await authenticatedGet(page, "/api/orders");
      expect(response.status()).toBe(200);
      return (await response.json()).orders.find((o) => o.id === id)?.status;
    })
    .toBe(status);
}

async function authenticatedGet(page, path) {
  const session = (await page.context().cookies()).find(
    (cookie) => cookie.name === "wb_session",
  );
  expect(session).toBeDefined();
  return page.context().request.get(path, {
    headers: { cookie: `wb_session=${session.value}` },
  });
}

async function expectResponsiveShell(page) {
  await expect(
    page.locator("[data-nextjs-dialog], .nextjs-container-errors-header"),
  ).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    text: document.body.innerText.trim().length,
  }));
  expect(dimensions.text).toBeGreaterThan(100);
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function openCustomerAccountMenu(page) {
  if (page.viewportSize().width <= 620) {
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Akun", exact: true })
      .click();
  } else {
    await page
      .locator("header")
      .getByRole("button", { name: "Akun", exact: true })
      .click();
  }
  return page.getByRole("dialog", { name: "Menu akun" });
}

async function goToCustomerOrders(page) {
  const accountDialog = await openCustomerAccountMenu(page);
  await accountDialog
    .getByRole("button", { name: "Pesanan Aktif", exact: true })
    .click();
}

async function goToCustomerAccount(page) {
  const accountDialog = await openCustomerAccountMenu(page);
  await accountDialog
    .getByRole("button", { name: "Pengaturan Akun", exact: true })
    .click();
}

async function goToCheckout(page) {
  if (page.viewportSize().width <= 620) {
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  } else {
    await page
      .locator("header.customer-home-header")
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  }
  await page
    .getByRole("dialog", { name: "Ringkasan keranjang" })
    .getByRole("button", { name: "Lanjut ke checkout" })
    .click();
}

test("OP-UAT-01 login gagal tidak membuat sesi", async ({ page }, testInfo) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();

  const form = page.locator(".auth-login-card form");
  await form
    .getByLabel("Email atau Nomor HP")
    .fill(`invalid-${testInfo.project.name}@example.test`);
  await form.locator('input[name="password"]').fill("password-yang-salah");
  await form.getByRole("button", { name: "Masuk", exact: true }).click();

  await expect(page.locator(".auth-card [role='alert']")).toHaveText(
    "Email/nomor HP atau password salah",
  );
  await expect(
    page.locator("nav").getByRole("button", { name: "Keluar" }),
  ).toHaveCount(0);
  await expect(
    page.locator("nav").getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
  await expectResponsiveShell(page);
  expect(consoleErrors).toHaveLength(1);
  expect(consoleErrors[0]).toContain("401 (Unauthorized)");
  await page.screenshot({
    path: testInfo.outputPath("login-ditolak.png"),
    fullPage: true,
  });
});

test("guest dapat menjelajah storefront dan diarahkan login saat memesan", async ({
  page,
}, testInfo) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Banner Warkost", exact: true }),
  ).toBeVisible();
  const menu = await (await page.request.get("/api/menu")).json();
  await page
    .getByRole("button", { name: "Tampilkan semua kategori", exact: true })
    .click();
  await expect(page.locator("article.customer-product")).toHaveCount(
    menu.products.length,
  );
  await expect(
    page.getByRole("searchbox", { name: "Cari makanan atau minuman" }),
  ).toBeVisible();
  await expect(
    page.locator('.filters[aria-label="Kategori produk"]'),
  ).toBeVisible();

  await page
    .locator("article.customer-product")
    .first()
    .getByRole("button", { name: "Pesan", exact: true })
    .click();
  const loginCard = page.locator(".auth-login-card");
  const registerCard = page.locator(".auth-register-card");
  await expect(loginCard).toBeVisible();
  await expect(registerCard).not.toBeVisible();
  await loginCard
    .getByRole("button", { name: "Belum punya akun? Daftar Akun" })
    .click();
  await expect(registerCard).toBeVisible();
  await expect(loginCard).not.toBeVisible();
  await registerCard
    .getByRole("button", { name: "Sudah punya akun? Masuk" })
    .click();
  await expect(loginCard).toBeVisible();
  await expect(registerCard).not.toBeVisible();
  await expect(page.locator(".auth-flow-ready")).toHaveCount(0);
  if (page.viewportSize().width <= 620) {
    const order = await page.evaluate(() => ({
      form: Number(
        getComputedStyle(document.querySelector(".auth-login-card")).order,
      ),
      hero: Number(
        getComputedStyle(document.querySelector(".auth-story-card")).order,
      ),
    }));
    expect(order.form).toBeLessThan(order.hero);
  }
  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("guest-storefront.png"),
    fullPage: true,
  });
});

test("customer dapat membuka menu, pesanan, dan akun", async ({
  page,
}, testInfo) => {
  const consoleErrors = await login(page, "customer@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  const promo = page.getByRole("region", {
    name: "Banner Warkost",
    exact: true,
  });
  await expect(promo).toBeVisible();
  await expect(promo.locator("img")).toHaveAttribute("src", /\.(webp|png|jpg)/);
  await expect(page.locator(".customer-hero")).toContainText(
    /Gratis Ongkir\s*3\s*KM/,
  );
  await expect(
    page
      .getByRole("navigation", { name: "Navigasi pelanggan utama" })
      .getByRole("button", { name: "Keranjang", exact: true }),
  ).toBeVisible();

  await goToCustomerOrders(page);
  await expect(
    page.getByRole("heading", { name: "Pesanan", level: 1 }),
  ).toBeVisible();
  await goToCustomerAccount(page);
  await expect(page.getByRole("heading", { name: "Akun saya" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Alamat pengantaran" }),
  ).toBeVisible();

  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("customer.png"),
    fullPage: true,
  });
});

test("customer homepage mengikuti desain dan cart tetap bekerja", async ({
  page,
}, testInfo) => {
  const consoleErrors = await login(page, "customer@warkost.local");
  const mobile = page.viewportSize().width <= 620;

  const logo = page.getByRole("img", { name: "Warkost Bahagia" });
  await expect(logo).toBeVisible();
  const logoBox = await logo.boundingBox();
  expect(logoBox.width / logoBox.height).toBeGreaterThan(1.2);

  const mainHeading = page.getByRole("heading", {
    name: "Mau makan apa hari ini?",
  });
  const headingSize = await mainHeading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(headingSize).toBeGreaterThanOrEqual(mobile ? 28 : 46);
  expect(headingSize).toBeLessThanOrEqual(mobile ? 38 : 70);
  await expect(page.getByText("Lebih hemat, tetap nikmat.")).toBeVisible();

  const headerNav = page.getByRole("navigation", {
    name: "Navigasi pelanggan utama",
  });
  for (const name of ["Buka notifikasi", "Keranjang", "Akun", "Bantuan"])
    await expect(
      headerNav.getByRole("button", { name, exact: true }),
    ).toBeVisible();

  if (mobile) {
    const bottomNav = page.getByRole("navigation", {
      name: "Navigasi pelanggan",
      exact: true,
    });
    await expect(bottomNav.getByRole("button")).toHaveCount(3);
    for (const name of ["Menu", "Keranjang", "Akun"])
      await expect(
        bottomNav.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  }

  const promo = page.getByRole("region", {
    name: "Banner Warkost",
    exact: true,
  });
  await expect(promo.locator("img")).toBeVisible();
  await expect(promo.locator("img")).toHaveAttribute("src", /promo-warkost/);

  const productImages = page.locator(
    "article.customer-product .food-visual img",
  );
  const publicMenu = await (await page.request.get("/api/menu")).json();
  await page
    .getByRole("button", { name: "Tampilkan semua kategori", exact: true })
    .click();
  await expect(productImages).toHaveCount(publicMenu.products.length);
  for (const image of await productImages.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((element) => element.naturalWidth))
      .toBeGreaterThan(0);
  }

  const search = page.getByRole("searchbox", {
    name: "Cari makanan atau minuman",
  });
  await expect(search).toBeVisible();
  await search.fill("kopi");
  await expect(page.locator("article.customer-product")).toHaveCount(
    publicMenu.products.filter((p) =>
      [p.name, p.description].join(" ").toLowerCase().includes("kopi"),
    ).length,
  );
  await expect(
    page.getByText("Kopi Susu Rumah", { exact: true }),
  ).toBeVisible();
  await search.clear();
  const menu = await (await page.request.get("/api/menu")).json();
  await page
    .getByRole("button", { name: "Tampilkan semua kategori", exact: true })
    .click();
  await expect(page.locator("article.customer-product")).toHaveCount(
    menu.products.length,
  );
  if (mobile) {
    const productGrid = page.locator(".customer-products");
    const cards = productGrid.locator("article.customer-product");
    const [firstCard, secondCard, thirdCard] = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
      cards.nth(2).boundingBox(),
    ]);
    expect(firstCard.width).toBeGreaterThan(130);
    expect(firstCard.width).toBeLessThan(190);
    // Each seeded item belongs to its own subcategory. Group headings span
    // both columns, so distinct groups must start new rows, not share one.
    const columns = await productGrid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length,
    );
    expect(columns).toBe(2);
    await expect(
      productGrid.locator(".catalog-group-subcategory-heading"),
    ).toHaveCount(
      publicMenu.subcategories.filter((s) =>
        publicMenu.products.some((p) => p.subcategory_id === s.id),
      ).length,
    );
    expect(secondCard.y).toBeGreaterThan(firstCard.y + firstCard.height);
    expect(thirdCard.y).toBeGreaterThan(secondCard.y + secondCard.height);
    expect(
      await productGrid.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }

  const categoryFilters = page.locator(
    '.filters[aria-label="Kategori produk"]',
  );
  for (const name of ["Semua", "Makanan", "Minuman"])
    await expect(
      categoryFilters.getByRole("button", {
        name: name === "Semua" ? "Tampilkan semua kategori" : name,
        exact: true,
      }),
    ).toBeVisible();

  const firstProduct = page.locator("article.product").filter({
    hasText: "Nasi Goreng Warkost",
  });
  await firstProduct.click();
  if (mobile)
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  else
    await page
      .locator("header.customer-home-header")
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();

  const cartDialog = page.getByRole("dialog", { name: "Ringkasan keranjang" });
  await expect(cartDialog).toBeVisible();
  await expect(cartDialog).toContainText("Nasi Goreng Warkost");
  await cartDialog.getByRole("button", { name: "Tutup" }).click();
  await expect(cartDialog).toHaveCount(0);

  await page.getByRole("button", { name: "Buka notifikasi" }).click();
  const notificationDialog = page.getByRole("dialog", {
    name: "Notifikasi terbaru",
  });
  await expect(notificationDialog).toBeVisible();
  if (mobile) {
    const notificationBox = await notificationDialog.boundingBox();
    const viewportHeight = page.viewportSize().height;
    expect(notificationBox.height).toBeGreaterThanOrEqual(
      viewportHeight * 0.65,
    );
    expect(notificationBox.height).toBeLessThanOrEqual(viewportHeight * 0.76);
  }
  await notificationDialog.getByRole("button", { name: "Tutup" }).click();
  await expect(notificationDialog).toHaveCount(0);

  const accountDialog = await openCustomerAccountMenu(page);
  await expect(accountDialog).toBeVisible();
  for (const name of [
    "Pesanan Aktif",
    "Riwayat",
    "Tracking",
    "Voucher & Loyalty",
    "Alamat",
    "Pengaturan Akun",
    "Bantuan",
    "Keluar",
  ])
    await expect(
      accountDialog.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await accountDialog.getByRole("button", { name: "Tutup" }).click();

  if (mobile) {
    const menu = await openCustomerAccountMenu(page);
    await menu.getByRole("button", { name: "Bantuan", exact: true }).click();
  } else await headerNav.getByRole("button", { name: "Bantuan" }).click();
  const helpDialog = page.getByRole("dialog", { name: "Bantuan Warkost" });
  await expect(helpDialog).toBeVisible();
  await expect(helpDialog.getByLabel("Topik bantuan")).toBeVisible();
  await expect(helpDialog.getByText("WhatsApp umum")).toBeVisible();
  await expect(
    helpDialog.getByRole("link", { name: "WhatsApp umum", exact: true }),
  ).toBeVisible();
  await helpDialog
    .getByRole("button", { name: "Chat dengan Admin", exact: true })
    .click();
  const generalChat = page.getByRole("dialog", {
    name: "Chat dengan Admin",
    exact: true,
  });
  await expect(generalChat).toBeVisible();
  await expect(
    generalChat.getByRole("textbox", { name: "Tulis pesan", exact: true }),
  ).toBeVisible();
  await expect(
    generalChat.getByRole("button", { name: "Kirim", exact: true }),
  ).toBeDisabled();
  await generalChat.getByRole("button", { name: "Tutup", exact: true }).click();
  await expectResponsiveShell(page);
  if (mobile) {
    await page.setViewportSize({ width: 360, height: 800 });
    await expectResponsiveShell(page);
    const bottomNav = page.getByRole("navigation", {
      name: "Navigasi pelanggan",
      exact: true,
    });
    const navBox = await bottomNav.boundingBox();
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(801);
    const narrowGrid = page.locator(".customer-products");
    expect(
      await narrowGrid.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }
  expect(consoleErrors).toEqual([]);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: testInfo.outputPath("customer-ui-polish.png"),
    fullPage: false,
  });
});

test("customer Batch A checkout tracking notifikasi dan pesanan responsif", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = await login(page, "customer@warkost.local");
  await page
    .locator("article.customer-product")
    .filter({ hasText: "Nasi Goreng Warkost" })
    .click();
  await goToCheckout(page);
  for (const heading of [
    "Checkout Pesanan",
    "Keranjang Anda",
    "Pengiriman",
    "Metode Pembayaran",
    "Rincian Pembayaran",
  ])
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Pilih reward loyalty untuk redeem poin",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pilih Promo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "GRATIS ONGKIR" }),
  ).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/checkout") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Buat Pesanan", exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  const created = await response.json();
  expect(created.payment.status).toBe("PENDING");
  const code = `WB${String(created.id).padStart(6, "0")}`;
  await expect(
    page.getByRole("heading", {
      name: "Pesanan Berhasil Dibuat!",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    `Pesanan #${created.id} berhasil dibuat`,
  );
  await expect(
    page.getByText("Status Pengantaran", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ringkasan Pesanan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hubungi Driver/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Hubungi Admin", exact: true })
    .click();
  const chat = page.getByRole("dialog", {
    name: "Chat dengan Admin",
    exact: true,
  });
  await expect(chat).toBeVisible();
  await expect(chat).toContainText(code);
  await expect(chat).toContainText("QRIS");
  await expect(chat).toContainText("MENUNGGU PEMBAYARAN");
  await expect(
    chat.getByRole("textbox", { name: "Tulis pesan", exact: true }),
  ).toBeVisible();
  await expect(
    chat.getByRole("button", { name: "Kirim", exact: true }),
  ).toBeDisabled();
  await chat.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("header.customer-home-header")
    .getByRole("button", { name: "Bantuan", exact: true })
    .click();
  const help = page.getByRole("dialog", {
    name: "Bantuan Warkost",
    exact: true,
  });
  await expect(
    help.getByRole("link", { name: "WhatsApp umum", exact: true }),
  ).toBeVisible();
  for (const [label, region] of [
    ["Pembayaran", "Bantuan pembayaran"],
    ["Pengiriman & Ongkir", "Bantuan pengantaran"],
  ]) {
    await help.getByRole("button", { name: new RegExp("^" + label) }).click();
    await expect(help.getByLabel(region, { exact: true })).toBeVisible();
    await help
      .getByRole("button", { name: "Kembali ke topik bantuan", exact: true })
      .click();
  }
  await help.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .getByRole("button", { name: "Kembali ke Pesanan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pesanan", exact: true }),
  ).toBeVisible();
  const filters = page.getByLabel("Filter pesanan", { exact: true });
  for (const name of [/Semua/, /Dalam Proses/, /Selesai/, /Dibatalkan/])
    await expect(filters.getByRole("button", { name })).toBeVisible();
  const card = orderCard(page, created.id);
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Lihat item & riwayat", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Lihat item & riwayat", exact: true }),
  ).toHaveText("Tutup Detail");
  await expect(card).toContainText(/1\s*[x\u00d7]\s*Nasi Goreng Warkost/);
  await expect(card.getByText("Riwayat status", { exact: true })).toBeVisible();
  await expect(card.locator("p").filter({ hasText: /PENDING$/ })).toBeVisible();
  await card
    .getByRole("button", { name: "Hubungi Admin", exact: true })
    .click();
  await expect(chat).toContainText(code);
  await chat.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .getByRole("button", { name: "Buka notifikasi", exact: true })
    .click();
  const notifications = page.getByRole("dialog", {
    name: "Notifikasi terbaru",
    exact: true,
  });
  await expect(notifications).toBeVisible();
  for (const name of [/Semua/, /Pesanan/, /Promo/, /Sistem/])
    await expect(
      notifications
        .getByLabel("Filter notifikasi")
        .getByRole("button", { name }),
    ).toBeVisible();
  await expectResponsiveShell(page);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("batch-a-flow.png"),
    fullPage: true,
  });
});

test("admin dapat membuka area operasional utama", async ({
  page,
}, testInfo) => {
  const errors = await login(page, "admin@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Pantau pesanan hari ini", exact: true }),
  ).toBeVisible();
  for (const [label, view] of [
    ["Pelanggan", "customers"],
    ["Stok", "admin-stock"],
    ["Printer", "printing"],
    ["Operasional", "orders"],
  ]) {
    await page
      .locator("header.top nav")
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(page.locator("main")).toHaveAttribute("data-admin-view", view);
  }
  // Baseline Admin workspace exposes operational surfaces; manager/owner
  // catalogue, staff and configuration must remain protected by server RBAC.
  for (const path of [
    "/api/drivers",
    "/api/customers",
    "/api/admin-beverage-stock",
    "/api/print-jobs",
  ])
    expect((await authenticatedGet(page, path)).status()).toBe(200);
  for (const path of ["/api/owner-admin-operators", "/api/audit"])
    expect((await authenticatedGet(page, path)).status()).toBe(403);
  await expectResponsiveShell(page);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("admin.png"),
    fullPage: true,
  });
});

test("driver dapat membuka tugas dan notifikasi", async ({
  page,
}, testInfo) => {
  const errors = await login(page, "driver@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Pengantaran", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByRole("button", { name: "Notifikasi Driver", exact: true })
    .click();
  await expect(page.locator(".driver-v2-popover-head")).toContainText(
    "Notifikasi Driver",
  );
  expect((await authenticatedGet(page, "/api/inventory")).status()).toBe(403);
  await expectResponsiveShell(page);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("driver.png"),
    fullPage: true,
  });
});

test("kitchen dan owner memiliki area terpisah yang responsif", async ({
  page,
}, testInfo) => {
  const errors = captureConsoleErrors(page);
  await signIn(page, "kitchen@warkost.local");
  await expect(
    page.getByRole("region", { name: "Kitchen Dashboard", exact: true }),
  ).toBeVisible();
  const stock = await authenticatedGet(page, "/api/stock");
  expect(stock.status()).toBe(200);
  expect(
    (await stock.json()).products.every((p) => p.prep_station === "KITCHEN"),
  ).toBe(true);
  expect((await authenticatedGet(page, "/api/inventory")).status()).toBe(403);
  await expectResponsiveShell(page);
  await signOut(page);
  await signIn(page, "owner@warkost.local");
  await expect(
    page.getByRole("region", { name: "Owner Control Center", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Produk Stok Habis/ }).click();
  await page.getByRole("button", { name: /^Lihat Semua Stok/ }).click();
  await expect(page.locator(".oso-modal")).toBeVisible();
  await expect(page.locator(".oso-row").first()).toBeVisible();
  await expect(page.locator(".oso-modal").getByRole("spinbutton")).toHaveCount(
    0,
  );
  expect((await authenticatedGet(page, "/api/audit")).status()).toBe(200);
  await expect(page.locator("main[data-kitchen-view]")).toHaveCount(0);
  await expectResponsiveShell(page);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("kitchen-owner.png"),
    fullPage: true,
  });
});

test("OP-UAT-02 QRIS simulasi customer ke admin ke driver memberi poin", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  expect(new URL(process.env.BASE_URL).hostname).toBe("127.0.0.1");
  const errors = captureConsoleErrors(page);
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  expect(secret).toBeTruthy();
  const initialStock = await readLocalStockAsOwner(1);
  await signIn(page, "customer@warkost.local");
  const product = page
    .locator("article.customer-product")
    .filter({ hasText: "Nasi Goreng Warkost" });
  await expect(product).toBeVisible();
  await product.click();
  await goToCheckout(page);
  await expect(
    page.getByRole("radiogroup", { name: "Metode pembayaran" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /BANK_TRANSFER|Transfer Bank/ }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: /^QRIS/ }).check();
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/checkout") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Buat Pesanan", exact: true }).click(),
  ]);
  expect(created.status()).toBe(201);
  const order = await created.json();
  const id = order.id;
  expect(order.payment).toMatchObject({
    method: "QRIS",
    status: "PENDING",
    provider_reference: expect.stringMatching(/^SIM-/),
  });
  await expectOrderStatus(page, id, "PENDING");
  expect((await authenticatedGet(page, "/api/inventory")).status()).toBe(403);
  await page.goto("/");
  await signOut(page);
  await signIn(page, "driver@warkost.local");
  await expect(orderCard(page, id)).toHaveCount(0);
  expect(
    (await authenticatedGet(page, `/api/order-items?id=${id}`)).status(),
  ).toBe(403);
  const body = JSON.stringify({
    status: "PAID",
    event_id: randomUUID(),
    transaction_reference: order.payment.transaction_reference,
    provider_reference: order.payment.provider_reference,
  });
  for (const replayed of [false, true]) {
    const response = await page.request.post("/api/payment/webhook", {
      data: body,
      headers: {
        "Content-Type": "application/json",
        "x-payment-signature": createHmac("sha256", secret)
          .update(body)
          .digest("hex"),
      },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).replayed).toBe(replayed);
  }
  await signOut(page);
  await signIn(page, "admin@warkost.local");
  const adminOrder = orderCard(page, id);
  await expect(adminOrder).toHaveCount(1);
  await expect(adminOrder).toHaveAttribute("data-payment-status", "PAID");
  const orders = await (await authenticatedGet(page, "/api/orders")).json();
  if (orders.orders.find((o) => o.id === id).status === "PENDING")
    await adminOrder
      .getByRole("button", { name: "Lanjutkan ke CONFIRMED", exact: true })
      .click();
  await expectOrderStatus(page, id, "CONFIRMED");
  await expect(
    adminOrder.getByRole("button", { name: "Tandai lunas", exact: true }),
  ).toHaveCount(0);
  expect(await readLocalStockAsOwner(1)).toBe(initialStock - 1);
  await signOut(page);
  await signIn(page, "kitchen@warkost.local");
  const kitchenOrder = orderCard(page, id);
  await expect(kitchenOrder).toHaveCount(1);
  await kitchenOrder
    .getByRole("button", { name: "Mulai Masak", exact: true })
    .click();
  await expectOrderStatus(page, id, "PREPARING");
  await kitchenOrder
    .getByRole("button", { name: "Tandai Ready", exact: true })
    .click();
  await expectOrderStatus(page, id, "READY");
  await signOut(page);
  await signIn(page, "admin@warkost.local");
  await expectOrderStatus(page, id, "READY");
  await expect(
    orderCard(page, id).getByRole("button", {
      name: "Tugaskan driver",
      exact: true,
    }),
  ).toHaveCount(0);
  await signOut(page);
  await signIn(page, "driver@warkost.local");
  const driverOrder = orderCard(page, id);
  await expect(driverOrder).toHaveCount(1);
  await driverOrder
    .getByRole("button", { name: "Ambil Pesanan", exact: true })
    .click();
  await expectOrderStatus(page, id, "ASSIGNED");
  await page
    .getByRole("button", { name: "Notifikasi Driver", exact: true })
    .click();
  await expect(page.locator(".driver-v2-notification-popover")).toContainText(
    `Anda mengambil pengantaran pesanan #${id}`,
  );
  await page
    .getByRole("button", { name: "Notifikasi Driver", exact: true })
    .click();
  const accept = driverOrder.getByRole("button", {
    name: "Terima Tugas",
    exact: true,
  });
  if (await accept.isVisible()) await accept.click();
  await driverOrder
    .getByRole("button", { name: "Sudah Diambil", exact: true })
    .click();
  await expectOrderStatus(page, id, "PICKED_UP");
  await driverOrder
    .getByRole("button", { name: "Mulai Pengantaran", exact: true })
    .click();
  await expectOrderStatus(page, id, "ON_DELIVERY");
  await driverOrder
    .getByRole("button", { name: "Pesanan Diterima", exact: true })
    .click();
  const proof = page.getByRole("dialog", {
    name: `Selesaikan WB${String(id).padStart(6, "0")}`,
  });
  await expect(proof).toBeVisible();
  await expect(
    proof.getByRole("button", {
      name: "Simpan Bukti & Selesaikan",
      exact: true,
    }),
  ).toBeDisabled();
  await proof
    .locator('input[type="file"]')
    .last()
    .setInputFiles("public/demo/nasi-goreng-warkost.webp");
  const [stored] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/delivery-proof") &&
        r.request().method() === "POST",
    ),
    proof
      .getByRole("button", { name: "Simpan Bukti & Selesaikan", exact: true })
      .click(),
  ]);
  expect(stored.status()).toBe(201);
  await expect(proof).toHaveCount(0);
  await expectOrderStatus(page, id, "DELIVERED");
  const replay = await page.request.post("/api/payment/webhook", {
    data: body,
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": createHmac("sha256", secret)
        .update(body)
        .digest("hex"),
    },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  await expectOrderStatus(page, id, "DELIVERED");
  await page
    .locator(".driver-v2-nav-link:visible")
    .filter({ hasText: /^Riwayat$/ })
    .first()
    .click();
  await expect(orderCard(page, id)).toContainText("Selesai");
  await signOut(page);
  await signIn(page, "customer@warkost.local");
  await goToCustomerOrders(page);
  await expect(orderCard(page, id)).toBeVisible();
  await expectOrderStatus(page, id, "DELIVERED");
  await page
    .getByRole("button", { name: "Buka notifikasi", exact: true })
    .click();
  const deliveredNotices = page.getByRole("dialog", {
    name: "Notifikasi terbaru",
    exact: true,
  });
  await expect(deliveredNotices).toContainText(`Pesanan #${id} telah diterima`);
  await deliveredNotices
    .getByRole("button", { name: "Tutup", exact: true })
    .click();
  const account = await (await authenticatedGet(page, "/api/account")).json();
  const earned = account.transactions.filter(
    (t) => t.order_id === id && t.kind === "EARN",
  );
  expect(earned).toHaveLength(1);
  expect(earned[0].amount).toBe(2);
  await goToCustomerAccount(page);
  await expect(page.locator("#account-loyalty")).toContainText(
    `${account.loyalty} poin`,
  );
  await signOut(page);
  await signIn(page, "owner@warkost.local");
  await expect(
    page.getByRole("region", { name: "Owner Control Center", exact: true }),
  ).toBeVisible();
  const dashboard = await (
    await authenticatedGet(page, "/api/dashboard")
  ).json();
  expect(Number(dashboard.today.revenue)).toBeGreaterThanOrEqual(
    Number(order.payment.amount),
  );
  const jobs = (
    await (await authenticatedGet(page, "/api/print-jobs")).json()
  ).jobs.filter((j) => j.order_id === id);
  expect(jobs).toHaveLength(2);
  expect(jobs.map((j) => j.station).sort()).toEqual(["ADMIN", "KITCHEN"]);
  const stock = (
    await (await authenticatedGet(page, "/api/stock")).json()
  ).products.find((p) => p.id === 1);
  expect(stock.stock_quantity).toBe(initialStock - 1);
  await testInfo.attach("operational-uat-evidence.json", {
    body: Buffer.from(
      JSON.stringify({
        orderId: id,
        method: "QRIS_LOCAL_SIMULATION",
        paymentReplay: "PASS",
        status: "DELIVERED",
        deliveryProof: "PASS",
        loyaltyEntries: 1,
        printJobs: 2,
      }),
    ),
    contentType: "application/json",
  });
  await expectResponsiveShell(page);
  expect(errors).toEqual([]);
});
