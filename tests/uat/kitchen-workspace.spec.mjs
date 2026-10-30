import { expect, test } from "@playwright/test";

async function fixture(page, { stockDelay = 120, failStock = false } = {}) {
  let authenticated = false,
    read = false;
  const writes = [];
  const user = {
    id: 3,
    role: "KITCHEN",
    name: "Kitchen UI",
    email: "kitchen@warkost.local",
  };
  const food = {
    id: 1,
    name: "Nasi Goreng Warkost",
    category_id: 1,
    category_name: "Makanan",
    prep_station: "KITCHEN",
    stock_quantity: 10,
    reserved_quantity: 2,
    available_quantity: 8,
    stock_status: "OK",
    stock_unit: "PCS",
    price: 25000,
    active: 1,
    image_url: "/demo/nasi-goreng-warkost.webp",
  };
  const drink = {
    ...food,
    id: 2,
    name: "Kopi Susu",
    category_id: 2,
    category_name: "Minuman",
    prep_station: "CASHIER",
  };
  const order = {
    id: 101,
    customer_id: 2,
    status: "PREPARING",
    kitchen_status: "QUEUED",
    method: "QRIS",
    payment_status: "PAID",
    total: 25000,
    created_at: "2026-10-29 03:00:00",
  };
  const jobs = [
    {
      id: 1,
      order_id: 101,
      station: "KITCHEN",
      status: "FAILED",
      attempts: 1,
      created_at: order.created_at,
    },
    {
      id: 2,
      order_id: 102,
      station: "CASHIER",
      status: "FAILED",
      attempts: 1,
      created_at: order.created_at,
    },
  ];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      key = new URL(request.url()).pathname.slice(5);
    if (request.method() === "POST") {
      writes.push({ key, body: request.postDataJSON() });
      if (key === "login") authenticated = true;
      if (key === "logout") authenticated = false;
      if (key === "station-status")
        order.kitchen_status = request.postDataJSON().status;
      if (key === "notification-read") read = true;
      if (key === "print-retry") jobs[0].status = "QUEUED";
    }
    if (key === "me") await new Promise((resolve) => setTimeout(resolve, 120));
    if (key === "stock")
      await new Promise((resolve) => setTimeout(resolve, stockDelay));
    if (page.isClosed()) return;
    if (key === "stock" && failStock)
      return route.fulfill({
        status: 503,
        json: { error: "Fixture: stok gagal dimuat" },
      });
    if (key === "realtime")
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: ": fixture\n\n",
      });
    const payload = {
      me: { user: authenticated ? user : null },
      login: { user },
      menu: {
        brand: "Warkost Bahagia",
        products: [food, drink],
        categories: [
          { id: 1, name: "Makanan" },
          { id: 2, name: "Minuman" },
        ],
      },
      "store-hours": {
        isOpen: true,
        effectiveStatus: "OPEN",
        qrisAvailable: true,
      },
      orders: { orders: [order], nextCursor: null },
      "order-items": {
        items: [
          { ...food, quantity: 1 },
          { ...drink, quantity: 1 },
        ],
        events: [],
      },
      // Deliberately include a drink to verify the Kitchen UI does not fall back
      // to displaying unscoped stock or printer rows. Real APIs remain scoped.
      stock: { products: [food, drink], movements: [] },
      "print-jobs": { jobs },
      notifications: {
        notifications: [
          {
            id: 1,
            message: "Pesanan makanan baru #101",
            created_at: order.created_at,
            read_at: read ? order.created_at : null,
          },
        ],
        unread: read ? 0 : 1,
      },
      "preparing-eta": { orders: [] },
    }[key] || { ok: true };
    await route.fulfill({ status: 200, json: payload });
  });
  return { writes, food, order };
}

async function monitor(page) {
  await page.addInitScript(() => {
    window.kitchenViolations = [];
    const record = (text) => {
      if (!window.kitchenViolations.includes(text))
        window.kitchenViolations.push(text);
    };
    const check = () => {
      const main = document.querySelector("main[data-kitchen-view]");
      if (!main) return;
      const view = main.dataset.kitchenView;
      const expected = {
        orders: "kitchen",
        stock: "stock",
        printing: "printer",
      }[view];
      const active = [
        ...document.querySelectorAll(
          "header.top nav [data-kitchen-nav].kitchen-nav-active",
        ),
      ];
      if (
        active.length !== 1 ||
        active[0]?.dataset.kitchenNav !== expected ||
        active[0]?.getAttribute("aria-current") !== "page"
      )
        record(`navigation/content mismatch: ${view}`);
      const markers = {
        orders: ".kitchen-dashboard-shell",
        stock: '[aria-label="Stok Makanan Kitchen"]',
        printing: '[data-kitchen-printer="true"]',
      };
      if (!main.querySelector(markers[view]))
        record(`missing modern workspace: ${view}`);
      if (
        main.querySelector(".order-list, .stock-row") ||
        main.textContent.includes(
          "Tampilan stok read-only sesuai tanggung jawab role.",
        )
      )
        record("legacy Kitchen markup committed");
      if (main.textContent.includes("Menyiapkan stok makanan..."))
        record("artificial stock placeholder");
      if (document.body.hasAttribute("data-kitchen-nav-target"))
        record("DOM-derived navigation intent remains");
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-kitchen-view", "aria-current"],
    });
    const frame = () => {
      check();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
const nav = (page, label) =>
  page
    .locator("header.top nav")
    .getByRole("button", { name: label, exact: true });
async function login(page) {
  await page.goto("/");
  await nav(page, "Masuk").click();
  const form = page.locator(".auth-login-card form");
  await form.getByLabel("Email atau Nomor HP").fill("kitchen@warkost.local");
  await form.locator('input[name="password"]').fill("fixture-password-2026");
  await form.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Kitchen Dashboard" }),
  ).toBeVisible();
}
async function workspace(page, label, view) {
  await nav(page, label).click();
  await expect(page.locator("main[data-kitchen-view]")).toHaveAttribute(
    "data-kitchen-view",
    view,
  );
  await expect(page.locator("header.top nav .kitchen-nav-active")).toHaveCount(
    1,
  );
  await expect(nav(page, label)).toHaveAttribute("aria-current", "page");
}
async function healthy(page) {
  expect(await page.evaluate(() => window.kitchenViolations)).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

test("Kitchen login, repeated navigation and cache-bypass hard refresh use only modern workspaces", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  await monitor(page);
  await login(page);
  for (let cycle = 0; cycle < 4; cycle++) {
    await workspace(page, "Stok Makanan", "stock");
    await expect(
      page.getByRole("region", { name: "Stok Makanan Kitchen" }),
    ).toBeVisible();
    await workspace(page, "Printer", "printing");
    await expect(
      page.getByRole("heading", { name: "Printer Kitchen", exact: true }),
    ).toBeVisible();
    await workspace(page, "Dapur", "orders");
    await expect(
      page.getByRole("region", { name: "Kitchen Dashboard" }),
    ).toBeVisible();
  }
  await workspace(page, "Stok Makanan", "stock");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Stok Makanan Kitchen" }),
  ).toBeVisible();
  await expect(nav(page, "Stok Makanan")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".kitchen-stock-row")).toHaveCount(1);
  await expect(page.locator(".kitchen-stock-product-icon")).toHaveAttribute(
    "data-synced-image",
    "true",
  );
  await healthy(page);
  await page.screenshot({
    path: testInfo.outputPath("kitchen-stock-hard-refresh.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Kitchen stock stays food-only and read-only while notification popover preserves active workspace", async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await monitor(page);
  await login(page);
  await workspace(page, "Stok Makanan", "stock");
  await expect(page.locator(".kitchen-stock-row")).toContainText(
    "Nasi Goreng Warkost",
  );
  await expect(page.locator(".kitchen-stock-row")).not.toContainText(
    "Kopi Susu",
  );
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await nav(page, "Buka notifikasi").click();
  const popover = page.getByRole("dialog", { name: "Notifikasi Kitchen" });
  await expect(popover).toBeVisible();
  await expect(nav(page, "Stok Makanan")).toHaveClass(/kitchen-nav-active/);
  await popover.locator('[data-kitchen-notif-read="1"]').click();
  await expect(
    page.locator(
      'header.top nav [data-kitchen-nav="notification"] .notification-count',
    ),
  ).toHaveCount(0);
  await workspace(page, "Printer", "printing");
  await expect(popover).toHaveCount(0);
  await healthy(page);
  expect(writes.filter((item) => item.key === "stock")).toEqual([]);
});

test("Kitchen station transitions and food-only Printer retry retain existing request contracts", async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await monitor(page);
  await login(page);
  await expect(page.locator(".kitchen-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Mulai Masak", exact: true }).click();
  await page.getByRole("button", { name: "Tandai Ready", exact: true }).click();
  await expect(page.locator(".kitchen-ready-state")).toBeVisible();
  await workspace(page, "Printer", "printing");
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(page.locator(".admin-printer-job")).toHaveCount(1);
  await expect(page.locator(".admin-printer-job")).toContainText(
    "Kitchen Ticket",
  );
  await page.getByRole("button", { name: "Cetak ulang", exact: true }).click();
  await page.getByRole("button", { name: /^Antrean/ }).click();
  await expect(page.locator(".admin-printer-job")).toContainText("MENUNGGU");
  await page
    .getByRole("button", { name: "Status Printer", exact: true })
    .click();
  await expect(page.locator(".admin-printer-device-card")).toHaveCount(1);
  await healthy(page);
  expect(
    writes
      .filter((item) => item.key === "station-status")
      .map((item) => item.body),
  ).toEqual([
    { orderId: 101, status: "PREPARING" },
    { orderId: 101, status: "READY" },
  ]);
  expect(
    writes
      .filter((item) => item.key === "print-retry")
      .map((item) => item.body),
  ).toEqual([{ id: 1 }]);
});

test("late/failed stock requests cannot restore legacy content or overwrite current navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page, { stockDelay: 700, failStock: true });
  await monitor(page);
  await login(page);
  await workspace(page, "Stok Makanan", "stock");
  await workspace(page, "Printer", "printing");
  await expect(page.locator('[data-kitchen-printer="true"]')).toBeVisible();
  await workspace(page, "Stok Makanan", "stock");
  await expect(page.locator(".kitchen-stock-error")).toContainText(
    "Fixture: stok gagal dimuat",
  );
  await workspace(page, "Dapur", "orders");
  await expect(page.locator(".kitchen-stock-center")).toHaveCount(0);
  await healthy(page);
  expect(errors).toEqual([]);
});

test("Kitchen stock realtime refresh keeps the modern workspace and correct active nav", async ({
  page,
}) => {
  const { food } = await fixture(page);
  await monitor(page);
  await login(page);
  await workspace(page, "Stok Makanan", "stock");
  await expect(
    page.locator(".kitchen-stock-metric.available strong"),
  ).toHaveText("8 pcs");
  food.available_quantity = 3;
  food.stock_status = "LOW";
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("warkost:realtime", {
        detail: { type: "STOCK_CHANGED" },
      }),
    ),
  );
  await expect(
    page.locator(".kitchen-stock-metric.available strong"),
  ).toHaveText("3 pcs");
  await expect(page.locator(".kitchen-stock-status")).toHaveText("Menipis");
  await healthy(page);
});
