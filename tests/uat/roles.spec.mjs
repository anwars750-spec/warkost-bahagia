import { expect, test } from "@playwright/test";

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

async function signIn(page, email) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  const form = page.locator("form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Masuk", exact: true }).click();
  if (email === "customer@warkost.local")
    await expect(
      page.getByRole("navigation", { name: "Navigasi pelanggan utama" }),
    ).toBeVisible();
  else
    await expect(
      page.locator("nav").getByRole("button", { name: "Keluar" }),
    ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Warkost Bahagia" }),
  ).toBeVisible();
}

async function login(page, email) {
  const consoleErrors = captureConsoleErrors(page);
  await signIn(page, email);
  return consoleErrors;
}

async function signOut(page) {
  const desktopLogout = page
    .locator("nav")
    .getByRole("button", { name: "Keluar", exact: true });
  if (await desktopLogout.isVisible()) await desktopLogout.click();
  else {
    const headerAccount = page
      .locator("header")
      .getByRole("button", { name: "Akun", exact: true });
    if (await headerAccount.isVisible()) await headerAccount.click();
    else
      await page
        .getByRole("navigation", {
          name: "Navigasi pelanggan",
          exact: true,
        })
        .getByRole("button", { name: "Akun", exact: true })
        .click();
    await page
      .getByRole("dialog", { name: "Menu akun" })
      .getByRole("button", { name: "Keluar", exact: true })
      .click();
  }
  await expect(
    page.locator("nav").getByRole("button", { name: "Masuk", exact: true }),
  ).toBeVisible();
}

function orderCard(page, orderId) {
  return page.locator("article.order").filter({ hasText: `#${orderId} ·` });
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
    .getByRole("button", { name: "Pesanan", exact: true })
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
    await page.getByRole("button", { name: /Buka keranjang, 1 item/ }).click();
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

  const form = page.locator("form");
  await form
    .getByLabel("Email")
    .fill(`invalid-${testInfo.project.name}@example.test`);
  await form.getByLabel("Password").fill("password-yang-salah");
  await form.getByRole("button", { name: "Masuk", exact: true }).click();

  await expect(page.locator(".alert[role='alert']")).toHaveText(
    "Email atau password salah",
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

test("customer dapat membuka menu, pesanan, dan akun", async ({
  page,
}, testInfo) => {
  const consoleErrors = await login(page, "customer@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  const promo = page.getByRole("region", { name: "Promo berlangsung" });
  await expect(promo).toBeVisible();
  await expect(promo).toContainText("Gratis Ongkir 5 KM");
  await expect(promo.getByRole("button", { name: "Pilih Menu" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Navigasi pelanggan utama" })
      .getByRole("button", { name: "Keranjang", exact: true }),
  ).toBeVisible();

  await goToCustomerOrders(page);
  await expect(
    page.getByRole("heading", { name: "Pesanan saya", level: 1 }),
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
    await expect(bottomNav.getByRole("button")).toHaveCount(4);
    for (const name of ["Menu", "Keranjang", "Akun", "Bantuan"])
      await expect(
        bottomNav.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  }

  const promo = page.getByRole("region", { name: "Promo berlangsung" });
  await expect(promo.locator("img")).toBeVisible();
  await expect(promo.locator("img")).toHaveAttribute("src", /promo-warkost/);

  const productImages = page.locator("article.product .food-visual img");
  await expect(productImages).toHaveCount(3);
  for (const image of await productImages.all()) {
    expect(
      await image.evaluate((element) => element.naturalWidth),
    ).toBeGreaterThan(0);
  }

  const search = page.getByRole("searchbox", {
    name: "Cari makanan atau minuman",
  });
  await expect(search).toBeVisible();
  await search.fill("kopi");
  await expect(page.locator("article.customer-product")).toHaveCount(1);
  await expect(
    page.getByText("Kopi Susu Rumah", { exact: true }),
  ).toBeVisible();
  await search.clear();
  await expect(page.locator("article.customer-product")).toHaveCount(3);
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
    expect(Math.abs(firstCard.y - secondCard.y)).toBeLessThan(2);
    expect(thirdCard.y).toBeGreaterThan(firstCard.y + firstCard.height);
    expect(
      await productGrid.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }

  const categoryFilters = page.getByLabel("Kategori menu");
  for (const name of ["Semua", "Makanan", "Minuman"])
    await expect(
      categoryFilters.getByRole("button", { name, exact: true }),
    ).toBeVisible();

  const firstProduct = page.locator("article.product").filter({
    hasText: "Nasi Goreng Warkost",
  });
  await firstProduct.getByRole("button", { name: /^Tambah / }).click();
  if (mobile)
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  else
    await page.getByRole("button", { name: /Buka keranjang, 1 item/ }).click();

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
    expect(notificationBox.height).toBeGreaterThanOrEqual(viewportHeight * 0.65);
    expect(notificationBox.height).toBeLessThanOrEqual(viewportHeight * 0.76);
  }
  await notificationDialog.getByRole("button", { name: "Tutup" }).click();
  await expect(notificationDialog).toHaveCount(0);

  const accountDialog = await openCustomerAccountMenu(page);
  await expect(accountDialog).toBeVisible();
  for (const name of [
    "Pesanan",
    "Riwayat",
    "Tracking",
    "Pengaturan Akun",
    "Keluar",
  ])
    await expect(
      accountDialog.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await accountDialog.getByRole("button", { name: "Tutup" }).click();

  if (mobile)
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Bantuan", exact: true })
      .click();
  else await headerNav.getByRole("button", { name: "Bantuan" }).click();
  const helpDialog = page.getByRole("dialog", { name: "Customer Support" });
  await expect(helpDialog).toBeVisible();
  await expect(helpDialog.getByLabel("Topik bantuan")).toBeVisible();
  await expect(helpDialog.getByText("WhatsApp umum")).toBeVisible();
  await helpDialog.getByRole("button", { name: "Hubungi Admin" }).click();
  await expect(helpDialog.getByLabel("Bantuan Admin")).toBeVisible();
  await expect(helpDialog.getByRole("link", { name: "WhatsApp umum" })).toBeVisible();
  await helpDialog.getByRole("button", { name: "Tutup" }).click();
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
  const consoleErrors = await login(page, "customer@warkost.local");
  const product = page.locator("article.product").filter({
    hasText: "Nasi Goreng Warkost",
  });
  await product.getByRole("button", { name: /^Tambah / }).click();
  await goToCheckout(page);

  await expect(
    page.getByRole("heading", { name: "Checkout Pesanan" }),
  ).toBeVisible();
  for (const heading of [
    "Keranjang Anda",
    "Poin Loyalty",
    "Voucher",
    "Pengiriman",
    "Metode Pembayaran",
    "Rincian Pembayaran",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText("Dihitung server", { exact: true })).toBeVisible();
  await expectResponsiveShell(page);
  await page.screenshot({
    path: testInfo.outputPath("batch-a-checkout.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Buat Pesanan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pesanan Berhasil Dibuat!" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /Pesanan #\d+ berhasil dibuat/,
  );
  await expect(page.getByText("Status Pengantaran")).toBeVisible();
  await expect(page.getByText("Ringkasan Pesanan")).toBeVisible();
  const adminSupport = page.getByRole("button", { name: "Hubungi Admin" });
  await expect(adminSupport).toBeVisible();
  await adminSupport.click();
  const supportDialog = page.getByRole("dialog", { name: "Customer Support" });
  await expect(supportDialog).toBeVisible();
  await expect(supportDialog.getByLabel("Konteks pesanan")).toContainText(
    /WB\d{6}/,
  );
  await expect(supportDialog.getByLabel("Bantuan Admin")).toContainText(
    /Status pembayaran|Belum tersedia/,
  );
  await expect(supportDialog.getByText("WhatsApp umum")).toBeVisible();
  await supportDialog.getByRole("button", { name: "Kembali ke topik bantuan" }).click();
  await supportDialog.getByRole("button", { name: "Pembayaran" }).click();
  await expect(supportDialog.getByLabel("Bantuan pembayaran")).toContainText(
    /Status pembayaran|Belum tersedia/,
  );
  await supportDialog.getByRole("button", { name: "Kembali ke topik bantuan" }).click();
  await supportDialog.getByRole("button", { name: "Pengantaran" }).click();
  await expect(supportDialog.getByLabel("Bantuan pengantaran")).toContainText(
    /Driver/,
  );
  await expect(supportDialog.getByRole("button", { name: "Hubungi Driver" })).toBeDisabled();
  await supportDialog.getByRole("button", { name: "Kembali ke topik bantuan" }).click();
  await supportDialog.getByRole("button", { name: "Status pesanan" }).click();
  await expect(supportDialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Hubungi Driver/ }),
  ).toBeDisabled();
  await expectResponsiveShell(page);
  await page.screenshot({
    path: testInfo.outputPath("batch-a-tracking.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "Kembali ke Pesanan" })
    .click();
  await expect(page.getByRole("heading", { name: "Pesanan" })).toBeVisible();
  const filters = page.getByLabel("Filter pesanan");
  for (const name of [/Semua/, /Dalam Proses/, /Selesai/, /Dibatalkan/])
    await expect(filters.getByRole("button", { name })).toBeVisible();
  const firstOrderCard = page.locator("article.customer-order-card").first();
  await expect(firstOrderCard).toBeVisible();
  await firstOrderCard.getByRole("button", { name: "Lihat item & riwayat" }).click();
  await firstOrderCard.getByRole("button", { name: "Hubungi Admin" }).click();
  const detailSupportDialog = page.getByRole("dialog", { name: "Customer Support" });
  await expect(detailSupportDialog.getByLabel("Bantuan Admin")).toBeVisible();
  await detailSupportDialog.getByRole("button", { name: "Tutup" }).click();

  await page
    .getByRole("navigation", { name: "Navigasi pelanggan utama" })
    .getByRole("button", { name: "Buka notifikasi" })
    .click();
  const notificationDialog = page.getByRole("dialog", {
    name: "Notifikasi terbaru",
  });
  await expect(notificationDialog.getByRole("heading", { name: "Notifikasi" })).toBeVisible();
  const notificationFilters = notificationDialog.getByLabel("Filter notifikasi");
  for (const name of [/Semua/, /Pesanan/, /Promo/, /Sistem/])
    await expect(notificationFilters.getByRole("button", { name })).toBeVisible();
  await expectResponsiveShell(page);
  await page.screenshot({
    path: testInfo.outputPath("batch-a-orders-notifications.png"),
    fullPage: false,
  });
  expect(consoleErrors).toEqual([]);
});

test("admin dapat membuka area operasional utama", async ({
  page,
}, testInfo) => {
  const consoleErrors = await login(page, "admin@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Pantau pesanan hari ini" }),
  ).toBeVisible();
  await expect(page.getByText("Order hari ini", { exact: true })).toBeVisible();

  await page
    .locator("nav")
    .getByRole("button", { name: "Driver", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kelola driver" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pelanggan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kelola pelanggan" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Promo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Promo customer", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".promo-editor").first()).toContainText("ACTIVE");
  await page
    .locator("nav")
    .getByRole("button", { name: "Laporan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Laporan harian" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pengaturan café" }),
  ).toBeVisible();

  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("admin.png"),
    fullPage: true,
  });
});

test("driver dapat membuka tugas dan notifikasi", async ({
  page,
}, testInfo) => {
  const consoleErrors = await login(page, "driver@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Tugas pengantaran" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbarui status" }),
  ).toBeVisible();

  await page
    .locator("nav")
    .getByRole("button", { name: /notifikasi/i })
    .click();
  await expect(page.getByRole("heading", { name: "Notifikasi" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kabar terbaru" }),
  ).toBeVisible();

  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("driver.png"),
    fullPage: true,
  });
});

test("kitchen dan owner memiliki area terpisah yang responsif", async ({
  page,
}, testInfo) => {
  const consoleErrors = captureConsoleErrors(page);
  await signIn(page, "kitchen@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Antrean makanan" }),
  ).toBeVisible();
  await expect(page.getByText("STASIUN DAPUR", { exact: true })).toBeVisible();
  await expect((await authenticatedGet(page, "/api/stock")).status()).toBe(403);
  await expectResponsiveShell(page);

  await signOut(page);
  await signIn(page, "owner@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Ringkasan usaha" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Stok", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kontrol stok" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Stok produk" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Audit log", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Audit aktivitas" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect((await authenticatedGet(page, "/api/audit")).status()).toBe(200);
  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("kitchen-owner.png"),
    fullPage: true,
  });
});

test("OP-UAT-02 transfer customer ke admin ke driver memberi poin", async ({
  page,
}, testInfo) => {
  const consoleErrors = captureConsoleErrors(page);

  await signIn(page, "customer@warkost.local");
  const firstProduct = page.locator("article.product").filter({
    hasText: "Nasi Goreng Warkost",
  });
  await expect(firstProduct).toBeVisible();
  await firstProduct.getByRole("button", { name: /^Tambah / }).click();
  await goToCheckout(page);
  await page.getByLabel("Metode pembayaran").selectOption("BANK_TRANSFER");
  await page.getByRole("button", { name: "Buat Pesanan", exact: true }).click();

  const checkoutMessage = page.getByRole("status");
  await expect(checkoutMessage).toContainText(/Pesanan #\d+ berhasil dibuat/);
  const match = (await checkoutMessage.textContent()).match(/Pesanan #(\d+)/);
  expect(match).not.toBeNull();
  const orderId = Number(match[1]);
  await expect(orderCard(page, orderId).locator(".badge")).toHaveText(
    "PENDING",
  );

  const customerOrdersResponse = await authenticatedGet(page, "/api/orders");
  expect(customerOrdersResponse.status()).toBe(200);
  const customerOrders = await customerOrdersResponse.json();
  expect(
    customerOrders.orders.find((order) => order.id === orderId)?.method,
  ).toBe("BANK_TRANSFER");
  expect((await authenticatedGet(page, "/api/inventory")).status()).toBe(403);
  await page.screenshot({
    path: testInfo.outputPath(`customer-order-${orderId}.png`),
    fullPage: true,
  });

  await signOut(page);
  await signIn(page, "driver@warkost.local");
  await expect(orderCard(page, orderId)).toHaveCount(0);
  expect(
    (await authenticatedGet(page, `/api/order-items?id=${orderId}`)).status(),
  ).toBe(403);

  await signOut(page);
  await signIn(page, "admin@warkost.local");
  const adminOrder = orderCard(page, orderId);
  await expect(adminOrder).toHaveCount(1);
  await expect(
    adminOrder.getByText("PENDING", { exact: true }).last(),
  ).toBeVisible();
  await adminOrder.getByRole("button", { name: "Tandai lunas" }).click();
  await expect(adminOrder.getByText("PAID", { exact: true })).toBeVisible();

  await adminOrder
    .getByRole("button", { name: "Lanjutkan ke CONFIRMED" })
    .click();
  await expect(adminOrder.locator(".badge").first()).toHaveText("CONFIRMED");

  await signOut(page);
  await signIn(page, "kitchen@warkost.local");
  const kitchenOrder = orderCard(page, orderId);
  await expect(kitchenOrder).toHaveCount(1);
  await kitchenOrder.getByRole("button", { name: "Mulai masak" }).click();
  await expect(kitchenOrder.locator(".badge").first()).toHaveText("PREPARING");
  await kitchenOrder.getByRole("button", { name: "Makanan siap" }).click();
  await expect(kitchenOrder.locator(".badge").first()).toHaveText("READY");

  await signOut(page);
  await signIn(page, "admin@warkost.local");
  const readyAdminOrder = orderCard(page, orderId);
  await readyAdminOrder.locator("select").selectOption({ index: 1 });
  await readyAdminOrder
    .getByRole("button", { name: "Tugaskan driver" })
    .click();
  await expect(readyAdminOrder.locator(".badge").first()).toHaveText(
    "ASSIGNED",
  );
  await page.screenshot({
    path: testInfo.outputPath(`admin-assigned-${orderId}.png`),
    fullPage: true,
  });

  await signOut(page);
  await signIn(page, "driver@warkost.local");
  await page
    .locator("nav")
    .getByRole("button", { name: /notifikasi/i })
    .click();
  await expect(
    page.getByText(`Pengantaran pesanan #${orderId} ditugaskan kepada Anda`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Tugas saya", exact: true })
    .click();
  const driverOrder = orderCard(page, orderId);
  await expect(driverOrder).toHaveCount(1);
  await driverOrder.getByRole("button", { name: "Terima tugas" }).click();
  await expect(
    driverOrder.getByRole("button", { name: "Sudah diambil · Pickup" }),
  ).toBeVisible();
  await driverOrder
    .getByRole("button", { name: "Sudah diambil · Pickup" })
    .click();
  await expect(driverOrder.locator(".badge")).toHaveText("PICKED UP");
  await driverOrder.getByRole("button", { name: "Mulai pengantaran" }).click();
  await expect(driverOrder.locator(".badge")).toHaveText("ON DELIVERY");
  await driverOrder
    .getByRole("button", { name: "Selesaikan pengantaran" })
    .click();
  await expect(driverOrder.locator(".badge")).toHaveText("DELIVERED");
  await driverOrder
    .getByRole("button", { name: "Lihat item & riwayat" })
    .click();
  await expect(driverOrder.locator(".order-details")).toContainText(
    "DELIVERED",
  );
  await page.screenshot({
    path: testInfo.outputPath(`driver-delivered-${orderId}.png`),
    fullPage: true,
  });

  await signOut(page);
  await signIn(page, "customer@warkost.local");
  await goToCustomerOrders(page);
  await expect(orderCard(page, orderId).locator(".badge")).toHaveText(
    "DELIVERED",
  );
  await page
    .getByRole("navigation", { name: "Navigasi pelanggan utama" })
    .getByRole("button", { name: "Buka notifikasi" })
    .click();
  await expect(
    page.getByText(`Pesanan #${orderId} telah diterima`, { exact: true }),
  ).toBeVisible();
  const notificationDialog = page.getByRole("dialog", {
    name: "Notifikasi terbaru",
  });
  await notificationDialog.getByRole("button", { name: "Tutup" }).click();
  await goToCustomerAccount(page);
  const loyaltyEntry = page.locator(".line").filter({
    hasText: `Pesanan #${orderId}`,
  });
  await expect(loyaltyEntry).toHaveCount(1);
  await expect(loyaltyEntry.locator("strong")).toHaveText(/^\+\d+$/);
  await page.screenshot({
    path: testInfo.outputPath(`vertical-flow-${orderId}.png`),
    fullPage: true,
  });

  await signOut(page);
  await signIn(page, "admin@warkost.local");
  await page
    .locator("nav")
    .getByRole("button", { name: "Laporan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ringkasan operasional" }),
  ).toBeVisible();
  const paidStat = page
    .locator(".stat")
    .filter({ hasText: "Pembayaran lunas" });
  const revenueStat = page
    .locator(".stat")
    .filter({ hasText: "Revenue terverifikasi" });
  await expect(paidStat.locator("strong")).not.toHaveText("0");
  await expect(revenueStat.locator("strong")).not.toHaveText("Rp0");
  await expect(
    page.getByRole("heading", { name: "Produk terlaris" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`owner-report-${orderId}.png`),
    fullPage: true,
  });

  await testInfo.attach("operational-uat-evidence.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          scenario: "OP-UAT-02",
          orderId,
          paymentMethod: "BANK_TRANSFER",
          paymentStatus: "PAID",
          orderStatus: "DELIVERED",
          loyaltyLedgerEntries: 1,
          roleIsolationBeforeAssignment: "PASS",
          ownerReportObserved: "PASS",
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });

  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
});
