import { expect, test } from "@playwright/test";

const password =
  process.env.STAGING_UAT_PASSWORD || process.env.SEED_DEMO_PASSWORD;
test.skip(!password, "Requires dedicated browser UAT accounts");

async function signIn(page, role) {
  await page.context().clearCookies();
  await page.goto("/");
  await page
    .locator("header.top nav")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  const form = page.locator(".auth-login-card form");
  await form.getByLabel("Email atau Nomor HP").fill(`${role}@warkost.local`);
  await form.locator('input[name="password"]').fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/login") &&
        response.request().method() === "POST",
    ),
    form.getByRole("button", { name: "Masuk", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  const cookie = (await response.headerValue("set-cookie"))?.match(
    /(?:^|,\s*)wb_session=([^;]+)/,
  )?.[1];
  const origin = new URL(page.url());
  if (
    origin.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(origin.hostname)
  ) {
    expect(cookie).toBeTruthy();
    await page.context().clearCookies();
    // Same transport-only loopback bridge as the existing staging release gate.
    await page
      .context()
      .addCookies([
        {
          name: "wb_session",
          value: cookie,
          url: origin.origin,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    await page.reload();
  }
}

test("real Kitchen session restores modern food-only stock after cache-bypass refresh", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "kitchen");
  await expect(
    page.getByRole("region", { name: "Kitchen Dashboard" }),
  ).toBeVisible();
  await page.locator('header.top nav [data-kitchen-nav="stock"]').click();
  await expect(
    page.getByRole("region", { name: "Stok Makanan Kitchen" }),
  ).toBeVisible();
  const stock = await page.evaluate(async () => {
    const response = await fetch("/api/stock");
    return { status: response.status, data: await response.json() };
  });
  expect(stock.status).toBe(200);
  expect(
    stock.data.products.every((product) => product.prep_station === "KITCHEN"),
  ).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Stok Makanan Kitchen" }),
  ).toBeVisible();
  await expect(
    page.locator('header.top nav [data-kitchen-nav="stock"]'),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".kitchen-stock-row")).toHaveCount(
    stock.data.products.length,
  );
  await expect(page.locator("main")).not.toContainText(
    "Tampilan stok read-only sesuai tanggung jawab role.",
  );
  await expect(page.locator("header.top nav .kitchen-nav-active")).toHaveCount(
    1,
  );
  await page.screenshot({
    path: testInfo.outputPath("kitchen-real-stock.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("real Manager stock controls remain separate from Kitchen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "manager");
  await expect(
    page.getByRole("heading", { name: "Dashboard Manager", exact: true }),
  ).toBeVisible();
  const stockButtons = page.getByRole("button", { name: /^(?:◇\s*)?Stok$/ });
  let opened = false;
  for (const button of await stockButtons.all()) {
    if (await button.isVisible()) {
      await button.click();
      opened = true;
      break;
    }
  }
  expect(opened).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Kontrol Stok", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Cari stok produk" }),
  ).toBeVisible();
  await expect(page.locator("main[data-kitchen-view]")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/kitchen-shell-active/);

  expect(errors).toEqual([]);
});

test("real Owner read-only stock remains separate from Kitchen", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "owner");
  await expect(
    page.getByRole("region", { name: "Owner Control Center" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Produk Stok Habis/ }).click();
  await page.getByRole("button", { name: /^Lihat Semua Stok/ }).click();
  await expect(page.locator(".oso-modal")).toBeVisible();
  await expect(page.locator(".oso-row").first()).toBeVisible();
  await expect(page.locator(".oso-modal").getByRole("spinbutton")).toHaveCount(
    0,
  );
  await expect(page.locator("main[data-kitchen-view]")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/kitchen-shell-active/);
  expect(errors).toEqual([]);
});
