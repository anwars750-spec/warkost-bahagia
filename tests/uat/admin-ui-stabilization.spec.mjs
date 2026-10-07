import { expect, test } from "@playwright/test";

const password = process.env.SEED_DEMO_PASSWORD;

if (!password) throw new Error("SEED_DEMO_PASSWORD wajib untuk browser UAT");

async function loginAdmin(page) {
  await page.goto("/");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  const form = page.locator(".auth-login-card form");
  await form.getByLabel("Email atau Nomor HP").fill("admin@warkost.local");
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", "orders");
}

function adminNav(page) {
  return page.locator("header.top nav");
}

async function expectOnlyActive(page, label) {
  const nav = adminNav(page);
  await expect(nav.locator("button.admin-nav-active")).toHaveCount(1);
  await expect(
    nav.getByRole("button", { name: label, exact: true }),
  ).toHaveClass(/admin-nav-active/);
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function openOperations(page) {
  await adminNav(page)
    .getByRole("button", { name: "Operasional", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", "orders");
  await expect(
    page.getByRole("heading", { name: "Pantau pesanan hari ini", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#admin-daily-summary")).toHaveCount(1);
  await expect(page.locator("#admin-order-tools")).toHaveCount(1);
  await expect(page.locator("#admin-customers-v1")).toHaveCount(0);
  await expect(page.locator("#admin-beverage-stock-v1")).toHaveCount(0);
  await expect(page.locator("#admin-printer-center-v1")).toHaveCount(0);
  await expectOnlyActive(page, "Operasional");
}

async function openCustomers(page) {
  await adminNav(page)
    .getByRole("button", { name: "Pelanggan", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", "customers");
  await expect(
    page.getByRole("heading", { name: "Kelola pelanggan", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#admin-customers-v1")).toHaveCount(1);
  await expect(page.locator("#admin-daily-summary")).toHaveCount(0);
  await expect(page.locator("#admin-order-tools")).toHaveCount(0);
  await expect(page.locator("#admin-beverage-stock-v1")).toHaveCount(0);
  await expect(page.locator("#admin-printer-center-v1")).toHaveCount(0);
  await expectOnlyActive(page, "Pelanggan");
}

async function openStock(page) {
  await adminNav(page)
    .getByRole("button", { name: "Stok", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", "admin-stock");
  await expect(page.locator("#admin-beverage-stock-v1")).toBeVisible();
  await expect(
    page.locator("#admin-beverage-stock-v1").getByRole("heading", {
      name: "Stok Minuman",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#admin-customers-v1")).toHaveCount(0);
  await expect(page.locator("#admin-printer-center-v1")).toHaveCount(0);
  await expectOnlyActive(page, "Stok");
}

async function openPrinter(page) {
  await adminNav(page)
    .getByRole("button", { name: "Printer", exact: true })
    .click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", "printing");
  await expect(page.locator("#admin-printer-center-v1")).toBeVisible();
  await expect(
    page.locator("#admin-printer-center-v1").getByRole("heading", {
      name: "Printer Center",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#admin-customers-v1")).toHaveCount(0);
  await expect(page.locator("#admin-beverage-stock-v1")).toHaveCount(0);
  await expectOnlyActive(page, "Printer");
}

async function openNotifications(page) {
  await adminNav(page)
    .getByRole("button", { name: /Buka notifikasi/i })
    .click();
  const dialog = page.getByRole("dialog", { name: "Notifikasi Admin" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Notifikasi" })).toBeVisible();
  await expect(page.locator(".admin-notification-popover")).toHaveCount(1);
}

test("Admin view lifecycle remains isolated through three repeated cycles", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await loginAdmin(page);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await openOperations(page);
    await openCustomers(page);
    await openOperations(page);
    await openStock(page);
    await openOperations(page);
    await openPrinter(page);
    await openOperations(page);
    await openCustomers(page);
    await openStock(page);
    await openPrinter(page);
    await openNotifications(page);
    await openOperations(page);
    await expect(page.locator(".admin-notification-popover")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  expect(errors).toEqual([]);
});
