import { expect, test } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD;

if (!password) throw new Error("SEED_DEMO_PASSWORD wajib untuk browser UAT");

function captureConsoleErrors(page) {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
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
  await page
    .locator("nav")
    .getByRole("button", { name: "Keluar", exact: true })
    .click();
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
  await expect(page.getByRole("button", { name: /Keranjang/ })).toBeVisible();

  await page
    .locator("nav")
    .getByRole("button", { name: "Pesanan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pesanan saya" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Akun", exact: true })
    .click();
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
    .getByRole("button", { name: /Notifikasi/ })
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
  await page.getByRole("button", { name: /^Keranjang · 1 ·/ }).click();
  await page.getByLabel("Metode pembayaran").selectOption("BANK_TRANSFER");
  await page.getByRole("button", { name: /^Buat pesanan ·/ }).click();

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
  await expect(adminOrder.getByText("UNPAID", { exact: true })).toBeVisible();
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
    .getByRole("button", { name: /Notifikasi/ })
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
  await page
    .locator("nav")
    .getByRole("button", { name: "Pesanan", exact: true })
    .click();
  await expect(orderCard(page, orderId).locator(".badge")).toHaveText(
    "DELIVERED",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /Notifikasi/ })
    .click();
  await expect(
    page.getByText(`Pesanan #${orderId} telah diterima`, { exact: true }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Akun", exact: true })
    .click();
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
