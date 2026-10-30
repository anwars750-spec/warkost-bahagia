import { expect, test } from "@playwright/test";

// Browser-only API fixtures: no database, real user account, payment, shift,
// notification or print job is mutated by this UI regression suite.
async function installFixture(page, { failCustomers = false } = {}) {
  const writes = [];
  const order = {
    id: 101,
    customer_id: 2,
    customer_name: "Pelanggan UI",
    address: "Alamat uji lokal",
    status: "PENDING",
    method: "QRIS",
    payment_status: "PAID",
    total: 25000,
    subtotal: 25000,
    delivery_fee: 0,
    distance_meters: 0,
    fulfillment_type: "DELIVERY",
    created_at: "2026-10-27 03:00:00",
    cashier_status: "QUEUED",
    kitchen_status: null,
  };
  const customer = {
    id: 2,
    name: "Pelanggan UI",
    email: "ui@example.test",
    active: 1,
    order_count: 1,
    points: 5,
    created_at: "2026-10-01 00:00:00",
  };
  const products = [
    {
      id: 1,
      name: "Kopi Susu",
      category_id: 1,
      category_name: "Minuman",
      price: 25000,
      stock_unit: "PCS",
      prep_station: "CASHIER",
      stock_quantity: 10,
      available_quantity: 8,
      reserved_quantity: 2,
      stock_status: "OK",
      active: 1,
      image_url: "/demo/kopi-susu-rumah.webp",
    },
  ];
  const jobs = [
    {
      id: 7,
      order_id: 101,
      station: "CASHIER",
      status: "FAILED",
      attempts: 1,
      retry_count: 0,
      created_at: "2026-10-27 03:00:00",
    },
  ];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const key = url.pathname.slice(5);
    if (request.method() === "POST") {
      writes.push(key);
      if (key === "status") order.status = request.postDataJSON().status;
      if (key === "print-retry") jobs[0] = { ...jobs[0], status: "QUEUED" };
    }
    if (
      key === "me" ||
      key === "order-items" ||
      key === "customers" ||
      key === "admin-beverage-stock"
    )
      await new Promise((resolve) => setTimeout(resolve, 180));
    if (page.isClosed()) return;
    if (key === "customers" && failCustomers)
      return route.fulfill({
        status: 503,
        json: { error: "Fixture: pelanggan tidak tersedia" },
      });
    if (key === "realtime")
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: ": fixture\n\n",
      });
    const payload = {
      me: {
        user: {
          id: 1,
          role: "ADMIN",
          name: "Admin UI",
          email: "admin@warkost.local",
        },
      },
      menu: {
        brand: "Warkost Bahagia",
        products,
        categories: [{ id: 1, name: "Minuman" }],
      },
      "store-hours": {
        isOpen: true,
        effectiveStatus: "OPEN",
        qrisAvailable: true,
      },
      orders: { orders: [order], nextCursor: null },
      "order-items": {
        items: [
          {
            name: "Kopi Susu",
            quantity: 1,
            price: 25000,
            prep_station: "CASHIER",
            stock_unit: "PCS",
          },
        ],
        events: [{ next_status: "PENDING", created_at: order.created_at }],
      },
      dashboard: {
        today: { orders: 1, revenue: 25000 },
        statuses: [{ status: order.status, count: 1 }],
        paymentStatuses: [{ status: "PAID", count: 1 }],
        customers: 1,
        drivers: 1,
        loyalty: 5,
      },
      customers: { customers: [customer], nextCursor: null },
      stock: { products, movements: [] },
      "admin-beverage-stock": { products },
      "print-jobs": { jobs },
      notifications: {
        notifications: [
          {
            id: 1,
            message: "Pesanan baru #101",
            created_at: order.created_at,
            read_at: null,
          },
        ],
        unread: 1,
      },
      "cod-batches": { batches: [], totals: {} },
      "admin-cash-control": {
        current_shift: {
          id: 1,
          operator_name: "Operator UI",
          started_at: order.created_at,
          cash_custody: 0,
          receipt_count: 0,
        },
        operators: [{ id: 1, name: "Operator UI" }],
        recent_receipts: [],
        pending_driver: { count: 0, actual_amount: 0 },
        issues: { count: 0 },
      },
      "chat-inbox": { conversations: [], totals: {} },
      "preparing-eta": { orders: [] },
    }[key] || { ok: true };
    await route.fulfill({ status: 200, json: payload });
  });
  return { writes, updateOrder: (patch) => Object.assign(order, patch) };
}

async function recordLifecycle(page) {
  await page.addInitScript(() => {
    window.adminPaintViolations = [];
    const add = (reason) => {
      if (!window.adminPaintViolations.includes(reason))
        window.adminPaintViolations.push(reason);
    };
    const check = () => {
      // The fixture is an authenticated Admin from the first request. Guest
      // storefront markup must never be committed while /api/me is pending.
      if (document.querySelector("main.customer-home-main"))
        add("guest workspace before Admin session resolution");
      const main = document.querySelector("main[data-admin-view]");
      if (!main) return;
      if (!document.querySelector("header.admin-ui-header nav.admin-nav"))
        add("basic navigation");
      if (document.querySelector(".admin-stock-native-placeholder"))
        add("legacy stock placeholder");
      if (
        [...main.querySelectorAll("h2")].some((node) =>
          ["Daftar pelanggan", "Antrean cetak struk 80mm"].includes(
            node.textContent.trim(),
          ),
        )
      )
        add("legacy native panel");
      if (main.dataset.adminView === "orders") {
        if (!main.querySelector("#admin-daily-summary"))
          add("operations without final summary");
        if (
          main.querySelector(
            ".order:not(.admin-order-card-v2), .order:not(:has(.admin-card-preview-v2))",
          )
        )
          add("basic order card");
      }
      if (
        main.dataset.adminView === "customers" &&
        !main.querySelector('#admin-customers-v1[data-admin-ui-owner="react"]')
      )
        add("customers without React workspace");
      if (
        main.dataset.adminView === "admin-stock" &&
        !main.querySelector(
          '#admin-beverage-stock-v1[data-admin-ui-owner="react"]',
        )
      )
        add("stock without React workspace");
      if (
        main.dataset.adminView === "printing" &&
        !main.querySelector(
          '#admin-printer-center-v1[data-admin-ui-owner="react"]',
        )
      )
        add("printer without React workspace");
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-admin-view"],
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
async function openView(page, label, view) {
  await nav(page, label).click();
  await expect(page.locator("main")).toHaveAttribute("data-admin-view", view);
  await expect(page.locator("header.top nav .admin-nav-active")).toHaveCount(1);
  await expect(nav(page, label)).toHaveClass(/admin-nav-active/);
}

test("Admin first paint, refresh and repeated navigation never commit a legacy workspace", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { writes } = await installFixture(page);
  await recordLifecycle(page);
  await page.goto("/");
  await expect(page.locator("#admin-daily-summary")).toHaveCount(1);
  await expect(page.locator(".admin-card-item-row")).toContainText("Kopi Susu");
  for (let i = 0; i < 3; i++) {
    await openView(page, "Pelanggan", "customers");
    await expect(page.locator(".admin-customer-card")).toHaveCount(1);
    await openView(page, "Stok", "admin-stock");
    await expect(page.locator(".admin-beverage-stock-card")).toHaveCount(1);
    await openView(page, "Printer", "printing");
    await expect(page.locator(".admin-printer-tabs")).toBeVisible();
    await page
      .getByRole("button", { name: "Status Printer", exact: true })
      .click();
    await expect(page.locator(".admin-printer-device-card")).toHaveCount(2);
    await openView(page, "Operasional", "orders");
  }
  await page.reload();
  await expect(page.locator(".admin-card-item-row")).toContainText("Kopi Susu");
  await expect(page.locator(".admin-order-number-v3")).toContainText(
    "WB000101",
  );
  await expect(page.locator(".admin-kpi-grid .admin-kpi-icon")).toHaveCount(10);
  await expect(page.locator(".admin-cod-launcher-button")).toBeVisible();
  expect(await page.evaluate(() => window.adminPaintViolations)).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("admin-operations.png"),
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("Admin existing controls retain order, customer, stock, printer, notification and settlement behavior", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { writes } = await installFixture(page);
  await recordLifecycle(page);
  await page.goto("/");
  await expect(page.locator(".admin-card-preview-v2")).toBeVisible();
  await page.getByRole("button", { name: "Lihat detail", exact: true }).click();
  await expect(page.locator(".admin-order-modal")).toBeVisible();
  await expect(page.locator(".admin-order-modal")).toContainText("Kopi Susu");
  await page.getByRole("button", { name: "Tutup detail", exact: true }).click();
  await page
    .getByRole("button", { name: "Lanjutkan ke CONFIRMED", exact: true })
    .click();
  await expect(page.locator(".order")).toHaveAttribute(
    "data-order-status",
    "CONFIRMED",
  );
  await openView(page, "Pelanggan", "customers");
  await expect(page.locator(".admin-customer-card")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Cari pelanggan", exact: true })
    .fill("Pelanggan");
  await page.getByRole("button", { name: "Ada Poin", exact: true }).click();
  await page.getByRole("button", { name: "Lihat detail", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Pelanggan UI" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Buka Customer Service", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Customer Service Admin" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Customer Service Admin" })
    .getByRole("button", { name: "Tutup", exact: true })
    .click();
  await openView(page, "Stok", "admin-stock");
  await expect(page.locator(".admin-beverage-stock-card")).toContainText(
    "8 pcs",
  );
  await page.getByRole("button", { name: "Bahan Baku", exact: true }).click();
  await expect(page.locator(".admin-beverage-stock-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Minuman", exact: true }).click();
  await expect(
    page.locator(".admin-beverage-stock-product-media img"),
  ).toHaveAttribute("src", "/demo/kopi-susu-rumah.webp");
  await page.screenshot({
    path: testInfo.outputPath("admin-stock.png"),
    fullPage: true,
  });
  await openView(page, "Printer", "printing");
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(page.locator(".admin-printer-job")).toContainText("WB000101");
  await page.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Detail cetakan" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Detail cetakan" })
    .getByRole("button", { name: "Cetak ulang", exact: true })
    .click();
  await page.getByRole("button", { name: /^Antrean/ }).click();
  await expect(page.locator(".admin-printer-job")).toContainText("MENUNGGU");
  await openView(page, "Operasional", "orders");
  await page.locator('button[data-admin-nav="Notifikasi"]').click();
  await expect(
    page.getByRole("dialog", { name: "Notifikasi Admin" }),
  ).toBeVisible();
  await openView(page, "Pelanggan", "customers");
  await expect(page.locator(".admin-notification-popover")).toHaveCount(0);
  await openView(page, "Operasional", "orders");
  await page.locator('button[data-admin-nav="Setoran"]').click();
  await expect(
    page.getByRole("dialog", { name: "Setoran dan Shift Admin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Setoran dan Shift Admin" }),
  ).toContainText("Operator UI");
  await page
    .getByRole("dialog", { name: "Setoran dan Shift Admin" })
    .getByRole("button", { name: "Tutup", exact: true })
    .click();
  expect(await page.evaluate(() => window.adminPaintViolations)).toEqual([]);
  expect(writes).toEqual(["status", "print-retry"]);
  expect(errors).toEqual([]);
});

test("late and failed customer requests cannot resurrect a workspace after navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installFixture(page, { failCustomers: true });
  await recordLifecycle(page);
  await page.goto("/");
  await expect(page.locator("#admin-daily-summary")).toHaveCount(1);
  await openView(page, "Pelanggan", "customers");
  await expect(page.locator(".admin-customer-empty.error")).toContainText(
    "Fixture: pelanggan tidak tersedia",
  );
  await openView(page, "Stok", "admin-stock");
  await expect(page.locator(".admin-beverage-stock-card")).toHaveCount(1);
  await expect(page.locator("#admin-customers-v1")).toHaveCount(0);
  await openView(page, "Pelanggan", "customers");
  await openView(page, "Printer", "printing");
  await expect(page.locator(".admin-printer-tabs")).toBeVisible();
  await expect(page.locator("#admin-customers-v1")).toHaveCount(0);
  expect(await page.evaluate(() => window.adminPaintViolations)).toEqual([]);
  expect(errors).toEqual([]);
});

test("realtime order metadata refresh keeps the final React preview in place", async ({
  page,
}) => {
  const { updateOrder, writes } = await installFixture(page);
  await recordLifecycle(page);
  await page.goto("/");
  await expect(page.locator(".admin-card-preview-v2")).toBeVisible();
  updateOrder({ status: "PREPARING", payment_status: "PAID", total: 30000 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("warkost:realtime", {
        detail: { type: "ORDER_STATUS_CHANGED" },
      }),
    ),
  );
  await expect(page.locator(".order")).toHaveAttribute(
    "data-order-status",
    "PREPARING",
  );
  await expect(page.locator(".admin-card-total strong")).toHaveText("Rp30.000");
  await expect(page.locator(".admin-card-payment-status")).toHaveText("PAID");
  expect(await page.evaluate(() => window.adminPaintViolations)).toEqual([]);
  expect(writes).toEqual([]);
});

for (const role of [null, "CUSTOMER"]) {
  test(`shared session boundary preserves ${role || "guest"} storefront first load`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installFixture(page);
    await page.route("**/api/me", (route) => route.fulfill({ json: { user: role ? { id: 2, role, name: "Pelanggan UI", email: "ui@example.test" } : null } }));
    await page.route("**/api/account", (route) => route.fulfill({ json: { profile: { id: 2, name: "Pelanggan UI", email: "ui@example.test" }, addresses: [], loyalty: 0, transactions: [], vouchers: [], promotions: [], rewards: [] } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Mau makan apa hari ini?", exact: true })).toBeVisible();
    if (role) await expect(page.getByRole("navigation", { name: "Navigasi pelanggan utama" })).toBeVisible();
    else await expect(page.locator("header.top nav").getByRole("button", { name: "Masuk", exact: true })).toBeVisible();
    await expect(page.locator("main[data-admin-view]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}