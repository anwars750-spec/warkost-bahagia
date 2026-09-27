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

test("alur UI customer ke admin ke driver memberi poin loyalitas", async ({
  page,
}, testInfo) => {
  const consoleErrors = captureConsoleErrors(page);

  await signIn(page, "customer@warkost.local");
  const firstProduct = page.locator("article.product").first();
  await expect(firstProduct).toBeVisible();
  await firstProduct.getByRole("button", { name: /^Tambah / }).click();
  await page.getByRole("button", { name: /^Keranjang · 1 ·/ }).click();
  await page.getByRole("button", { name: /^Buat pesanan ·/ }).click();

  const checkoutMessage = page.getByRole("status");
  await expect(checkoutMessage).toContainText(/Pesanan #\d+ berhasil dibuat/);
  const match = (await checkoutMessage.textContent()).match(/Pesanan #(\d+)/);
  expect(match).not.toBeNull();
  const orderId = Number(match[1]);
  await expect(orderCard(page, orderId).locator(".badge")).toHaveText(
    "PENDING",
  );

  await signOut(page);
  await signIn(page, "admin@warkost.local");
  const adminOrder = orderCard(page, orderId);
  await expect(adminOrder).toHaveCount(1);
  await adminOrder.getByRole("button", { name: "Tandai lunas" }).click();
  await expect(adminOrder.getByText("PAID", { exact: true })).toBeVisible();

  for (const status of ["CONFIRMED", "PREPARING", "READY"]) {
    await adminOrder
      .getByRole("button", { name: `Lanjutkan ke ${status}` })
      .click();
    await expect(adminOrder.locator(".badge")).toHaveText(status);
  }
  await adminOrder.locator("select").selectOption({ label: "Driver Warkost" });
  await adminOrder.getByRole("button", { name: "Tugaskan driver" }).click();
  await expect(adminOrder.locator(".badge")).toHaveText("ASSIGNED");

  await signOut(page);
  await signIn(page, "driver@warkost.local");
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

  await signOut(page);
  await signIn(page, "customer@warkost.local");
  await page
    .locator("nav")
    .getByRole("button", { name: "Akun", exact: true })
    .click();
  const loyaltyEntry = page.locator(".line").filter({
    hasText: `Pesanan #${orderId}`,
  });
  await expect(loyaltyEntry).toHaveCount(1);
  await expect(loyaltyEntry.locator("strong")).toHaveText(/^\+\d+$/);

  await expectResponsiveShell(page);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`vertical-flow-${orderId}.png`),
    fullPage: true,
  });
});
