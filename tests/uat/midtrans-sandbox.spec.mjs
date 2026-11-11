import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  fixtureMerchant,
  signedMidtrans,
} from "../helpers/midtrans-fixture.mjs";

test.describe.configure({ timeout: 120_000 });

async function login(request, origin, role) {
  const response = await request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: {
      identifier: role + "@warkost.local",
      password: process.env.SEED_DEMO_PASSWORD,
    },
  });
  expect(response.ok()).toBeTruthy();
  const cookie = response
    .headers()
    ["set-cookie"]?.match(/wb_session=([^;]+)/)?.[1];
  expect(cookie).toBeTruthy();
  return cookie;
}

async function checkout(page, mobile) {
  const product = page
    .locator(".customer-product")
    .filter({ hasText: "Nasi Goreng Warkost" });
  await product.click();
  if (mobile) {
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  } else {
    await page
      .getByRole("button", { name: "Buka keranjang", exact: true })
      .click();
  }
  await page
    .getByRole("dialog", { name: "Ringkasan keranjang" })
    .getByRole("button", { name: "Lanjut ke checkout" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Checkout Pesanan" }),
  ).toBeVisible();
  const submit = page.getByRole("button", { name: "Buat Pesanan" });
  await expect(submit).toBeEnabled();
  await submit.click();
}

test("sandbox QRIS survives a lost checkout response and reconciles after reload with new payments stopped", async ({
  page,
  request,
  baseURL,
}, info) => {
  const file = process.env.WARKOST_MIDTRANS_FIXTURE_SETTLEMENT_FILE;
  const origin = new URL(baseURL).origin;
  test.skip(
    !file || new URL(origin).hostname !== "127.0.0.1",
    "Only the disposable Midtrans transport fixture may run this test.",
  );

  const owner = await login(request, origin, "owner");
  const toggle = async (enabled) => {
    const response = await request.post(
      origin + "/api/payment/midtrans/operations",
      {
        headers: { Origin: origin, Cookie: "wb_session=" + owner },
        data: { action: "set-new-payments", enabled },
      },
    );
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).enabled).toBe(enabled);
  };
  await toggle(true);
  const customer = await login(page.request, origin, "customer");
  await page.context().addCookies([
    {
      name: "wb_session",
      value: customer,
      url: origin,
      httpOnly: true,
      secure: false,
    },
  ]);
  const outside = [];
  page.on("request", (event) => {
    if (new URL(event.url()).hostname.endsWith(".midtrans.com"))
      outside.push(event.url());
  });
  const attempts = [];
  await page.route("**/api/checkout", async (route) => {
    const submitted = route.request().postDataJSON();
    const response = await route.fetch({ maxRetries: 0 });
    const result = await response.json();
    attempts.push({ submitted, result, ok: response.ok() });
    if (attempts.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });

  await page.goto("/");
  const mobile = Boolean(info.project.use.isMobile);
  await checkout(page, mobile);
  await expect.poll(() => attempts.length).toBe(1);
  expect(attempts[0].ok).toBe(true);
  await expect(
    page.getByRole("alert").filter({ hasText: /failed to fetch|load failed/i }),
  ).toBeVisible();

  await page.reload();
  await checkout(page, mobile);
  await expect.poll(() => attempts.length).toBe(2);
  const [lost, replay] = attempts;
  expect(replay.ok).toBe(true);
  expect(replay.submitted.idempotencyKey).toBe(lost.submitted.idempotencyKey);
  expect(replay.result.id).toBe(lost.result.id);
  expect(replay.result.replayed).toBe(true);
  expect(replay.result.payment.transaction_reference).toBe(
    lost.result.payment.transaction_reference,
  );

  const qr = page.getByAltText("Kode QRIS Midtrans sandbox");
  await expect(qr).toBeVisible();
  await expect
    .poll(() =>
      qr.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(
    page.getByText("Menunggu konfirmasi aman dari provider pembayaran."),
  ).toBeVisible();
  const statusPath = origin + "/api/payment-status?orderId=" + replay.result.id;
  const pending = await (await page.request.get(statusPath)).json();
  const signed = signedMidtrans(
    {
      order_id: pending.transaction_reference,
      transaction_id: pending.provider_reference,
      merchant_id: fixtureMerchant,
      gross_amount: pending.amount + ".0000",
      status_code: "201",
      transaction_status: "pending",
      currency: "IDR",
      payment_type: "qris",
    },
    process.env.MIDTRANS_SANDBOX_SERVER_KEY,
  );
  const webhook = origin + "/api/payment/midtrans/webhook";
  expect(
    (
      await page.request.post(webhook, {
        data: { ...signed, signature_key: "0".repeat(128) },
      })
    ).status(),
  ).toBe(401);
  expect((await page.request.post(webhook, { data: signed })).status()).toBe(
    200,
  );

  await toggle(false);
  await page.reload();
  await fs.appendFile(file, replay.result.payment.transaction_reference + "\n");
  const status = async () => {
    const response = await page.request.get(statusPath);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).status;
  };
  await expect.poll(status, { timeout: 35_000 }).toBe("PAID");
  const navigation = mobile
    ? page.getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
    : page.locator("header");
  await navigation.getByRole("button", { name: "Akun", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Menu akun" })
    .getByRole("button", { name: "Pesanan Aktif", exact: true })
    .click();
  await page
    .locator(".customer-order-card")
    .filter({ hasText: "#" + replay.result.id })
    .getByRole("button", { name: "Lacak Pesanan" })
    .click();
  await expect(
    page.getByText("Pembayaran berhasil diverifikasi."),
  ).toBeVisible();
  await expect(qr).toHaveCount(0);
  expect(outside).toEqual([]);
});
