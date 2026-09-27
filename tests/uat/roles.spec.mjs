import { expect, test } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD;

if (!password) throw new Error("SEED_DEMO_PASSWORD wajib untuk browser UAT");

async function login(page, email) {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

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

  return consoleErrors;
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
