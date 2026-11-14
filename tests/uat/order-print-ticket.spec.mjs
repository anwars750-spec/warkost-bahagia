import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const password = process.env.SEED_DEMO_PASSWORD;
const secret = process.env.PAYMENT_WEBHOOK_SECRET;
test.skip(!password || !secret, "Requires isolated local payment simulation.");

test("persisted order tickets print from Admin and Kitchen workspaces", async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(new URL(baseURL).hostname !== "127.0.0.1", "Loopback UAT only");
  test.setTimeout(90000);
  const headers = async (role) => {
    const res = await request.post("/api/login", {
      data: { identifier: role + "@warkost.local", password },
    });
    expect(res.status()).toBe(200);
    return { Cookie: res.headers()["set-cookie"].split(";")[0] };
  };
  const customer = await headers("customer");
  const pickup = await request.post("/api/pickup-address", {
    headers: customer,
  });
  expect(pickup.status()).toBe(200);
  const address = await pickup.json();
  const orders = [];
  for (const type of ["PICKUP", "DELIVERY"]) {
    const res = await request.post("/api/checkout", {
      headers: customer,
      data: {
        fulfillmentType: type,
        addressId: type === "PICKUP" ? address.id : 1,
        items: [
          { productId: 1, quantity: 1 },
          { productId: 3, quantity: 1 },
        ],
        method: "QRIS",
        idempotencyKey: randomUUID(),
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    expect(order.payment.provider).toBe("LOCAL_SIMULATION");
    const body = JSON.stringify({
      status: "PAID",
      event_id: randomUUID(),
      transaction_reference: order.payment.transaction_reference,
      provider_reference: order.payment.provider_reference,
    });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    for (const replay of [false, true]) {
      const paid = await request.post("/api/payment/webhook", {
        data: body,
        headers: {
          "Content-Type": "application/json",
          "x-payment-signature": signature,
        },
      });
      expect(paid.status()).toBe(200);
      expect((await paid.json()).replayed).toBe(replay);
    }
    orders.push({ id: order.id, type });
  }
  const admin = await headers("admin");
  const state = await request.get("/api/admin-cash-control", {
    headers: admin,
  });
  expect(state.status()).toBe(200);
  const cash = await state.json();
  if (!cash.current_shift) {
    const pin = "173682";
    const operator = await request.post("/api/owner-admin-operators", {
      headers: await headers("owner"),
      data: {
        action: "CREATE",
        name: "Print UAT " + randomUUID().slice(0, 8),
        pin,
      },
    });
    expect(operator.status()).toBe(201);
    const { id } = await operator.json();
    const shift = await request.post("/api/admin-cash-control", {
      headers: admin,
      data: { action: "START_SHIFT", operatorId: id, pin },
    });
    expect(shift.status()).toBe(200);
  }
  const kitchen = await headers("kitchen");
  await page.addInitScript(() => {
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      const label = document.querySelector(
        ".admin-printer-modal [data-fulfillment-type] .warkost-print-brand span",
      );
      document.documentElement.dataset.printedTicketLabel = label?.textContent;
    };
  });
  let adminJob;
  let kitchenJob;
  for (const [station, session] of [
    ["ADMIN", admin],
    ["KITCHEN", kitchen],
  ]) {
    const list = await request.get("/api/print-jobs", { headers: session });
    expect(list.status()).toBe(200);
    const jobs = (await list.json()).jobs.filter((job) =>
      orders.some((order) => order.id === job.order_id),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.station === station)).toBe(true);
    if (station === "ADMIN") adminJob = jobs[0].id;
    else kitchenJob = jobs[0].id;

    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: "wb_session",
        value: session.Cookie.split("=")[1],
        url: baseURL,
        httpOnly: true,
      },
    ]);
    await page.goto("/");
    await page
      .locator("header.top nav")
      .getByRole("button", { name: "Printer", exact: true })
      .click({ timeout: 15000 });
    await page.getByRole("button", { name: "Riwayat", exact: true }).click();
    for (const { id, type } of orders) {
      const row = page
        .locator(".admin-printer-job")
        .filter({ hasText: "WB" + String(id).padStart(6, "0") });
      await row
        .getByRole("button", { name: "Detail", exact: true })
        .click({ timeout: 15000 });
      const dialog = page.getByRole("dialog", { name: "Detail cetakan" });
      const sheet = page.locator(
        ".admin-printer-modal > [data-fulfillment-type]",
      );
      await expect(sheet).toHaveAttribute("data-fulfillment-type", type);
      await expect(sheet.locator("li")).toHaveCount(1);
      await expect(sheet.locator("li")).toContainText(
        station === "ADMIN" ? "Kopi Susu Rumah" : "Nasi Goreng Warkost",
      );
      await dialog
        .getByRole("button", { name: "Cetak tiket", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-printed-ticket-label",
        type,
      );
      await page.emulateMedia({ media: "print" });
      await expect(sheet).toBeVisible();
      await expect(sheet.locator(".warkost-print-brand span")).toHaveText(type);
      await page.emulateMedia({ media: "screen" });
      await dialog.getByRole("button", { name: "Tutup" }).click();
    }
  }
  for (const [id, session, status] of [
    [adminJob, kitchen, 404],
    [kitchenJob, admin, 404],
    [kitchenJob, customer, 403],
  ]) {
    expect(
      (
        await request.get("/api/print-ticket?id=" + id, { headers: session })
      ).status(),
    ).toBe(status);
  }
});
