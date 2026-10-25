import { expect, test } from "@playwright/test";

const password = process.env.STAGING_UAT_PASSWORD || process.env.SEED_DEMO_PASSWORD;

if (!password) throw new Error("STAGING_UAT_PASSWORD wajib untuk staging browser gate");

function capturePageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
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

async function signIn(page, email) {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();

  const form = page.locator(".auth-login-card form");
  await form.getByLabel("Email atau Nomor HP").fill(email);
  await form.locator('input[type="password"]').fill(password);
  await form.getByRole("button", { name: "Masuk", exact: true }).click();

  await expect(page.getByRole("img", { name: "Warkost Bahagia" })).toBeVisible();
  await expectResponsiveShell(page);
}

test("guest storefront release shell responsif dan auth dapat dibuka", async ({
  page,
}) => {
  const pageErrors = capturePageErrors(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Cari makanan atau minuman" }),
  ).toBeVisible();
  await expect(page.getByLabel("Kategori menu")).toBeVisible();

  await page
    .locator("nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  const loginCard = page.locator(".auth-login-card");
  await expect(loginCard).toBeVisible();
  await expect(loginCard.getByLabel("Email atau Nomor HP")).toBeVisible();
  await expect(loginCard.locator('input[type="password"]')).toBeVisible();

  await expectResponsiveShell(page);
  expect(pageErrors).toEqual([]);
});

test("customer release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "customer@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Mau makan apa hari ini?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navigasi pelanggan utama" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("admin release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "admin@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Pantau pesanan hari ini" }),
  ).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "Operasional", exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("manager release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "manager@warkost.local");
  await expect(
    page.locator("nav").getByRole("button", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "Produk & Menu", exact: true }),
  ).toBeVisible();
  await expectResponsiveShell(page);
  expect(pageErrors).toEqual([]);
});

test("kitchen release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "kitchen@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Antrean makanan" }),
  ).toBeVisible();
  await expect(page.getByText("STASIUN DAPUR", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("driver release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "driver@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Tugas pengantaran" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbarui status" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("owner release shell responsif", async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await signIn(page, "owner@warkost.local");
  await expect(
    page.getByRole("heading", { name: "Ringkasan usaha" }),
  ).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "Audit log", exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
