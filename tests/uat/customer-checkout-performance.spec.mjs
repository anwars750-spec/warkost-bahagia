import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });
test.use({ video: "off", trace: "off", screenshot: "off" });

test("Customer session and Checkout address traffic stay bounded", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  test.skip(
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
    "Use a disposable local database.",
  );
  const baseline = process.env.WARKOST_PERF_BASELINE === "1";
  await page.addInitScript(() => {
    window.checkoutPerf = { me: [], click: null, close: null };
    performance.setResourceTimingBufferSize(5000);
    const fetchFromPage = window.fetch;
    window.fetch = function (input, ...options) {
      const url = new URL(
        typeof input === "string" ? input : input.url || input.href,
        location.href,
      );
      if (url.pathname === "/api/me")
        window.checkoutPerf.me.push({
          at: performance.now(),
          caller: new Error().stack?.split("\n").slice(2, 5).join("\n"),
        });
      return fetchFromPage.call(this, input, ...options);
    };
    navigator.geolocation.getCurrentPosition = (success) =>
      queueMicrotask(() =>
        success({ coords: { latitude: -6.8813456, longitude: 106.9309032 } }),
      );
  });
  const login = await page.request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: {
      identifier: "customer@warkost.local",
      password: process.env.SEED_DEMO_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  const cookie = login
    .headers()
    ["set-cookie"]?.match(/wb_session=([^;]+)/)?.[1];
  expect(cookie).toBeTruthy();
  await page.context().addCookies([
    {
      name: "wb_session",
      value: cookie,
      url: origin,
      httpOnly: true,
      secure: false,
    },
  ]);
  let streamStarts = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/realtime") streamStarts++;
  });
  const accountBoot = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/account" && r.ok(),
  );
  await page.goto("/");
  await accountBoot;
  const product = page
    .locator(".customer-product")
    .filter({ hasText: "Nasi Goreng Warkost" });
  await expect(product).toBeVisible();
  const traffic = await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const start = window.checkoutPerf.me.length;
    await delay(5000);
    const idle = window.checkoutPerf.me.slice(start);
    const startChurn = window.checkoutPerf.me.length;
    const transient = document.createElement("div");
    transient.hidden = true;
    document.body.append(transient);
    const churn = setInterval(
      () =>
        requestAnimationFrame(() => {
          transient.toggleAttribute("data-admin-nav");
          transient.replaceChildren(document.createElement("span"));
        }),
      50,
    );
    await delay(2000);
    clearInterval(churn);
    transient.remove();
    await delay(200);
    const byCaller = (calls) =>
      Object.fromEntries(
        Object.entries(
          calls.reduce((out, event) => {
            out[event.caller] = (out[event.caller] || 0) + 1;
            return out;
          }, {}),
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
      );
    return {
      startup: start,
      idle5s: idle.length,
      churn2s: window.checkoutPerf.me.length - startChurn,
      idleCallers: byCaller(idle),
      churnCallers: byCaller(window.checkoutPerf.me.slice(startChurn)),
    };
  });

  await product.click();
  if (page.viewportSize().width <= 620)
    await page
      .getByRole("navigation", { name: "Navigasi pelanggan", exact: true })
      .getByRole("button", { name: "Keranjang", exact: true })
      .click();
  else
    await page
      .getByRole("button", { name: "Buka keranjang", exact: true })
      .click();
  await page
    .getByRole("dialog", { name: "Ringkasan keranjang" })
    .getByRole("button", { name: "Lanjut ke checkout" })
    .click();
  await page
    .getByRole("button", { name: "+ Tambah lokasi lain", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Pilih lokasi pengantaran" });
  await dialog.getByRole("button", { name: /Gunakan lokasi saat ini/ }).click();
  const detail = `Jl. Fixture checkout perf ${info.project.name} ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "Alamat lengkap" }).fill(detail);
  const confirm = dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" });
  await expect(confirm).toBeEnabled();

  // Hold only the first address POST long enough to assert feedback and the
  // duplicate-click guard. Use the same delay for baseline and candidate.
  let posts = 0;
  await page.route("**/api/address", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return route.continue();
  });
  const quote = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/delivery/quote" && r.ok(),
  );
  await confirm.evaluate((button) => {
    const dialog = button.closest('[role="dialog"]');
    window.checkoutPerf.click = performance.now();
    const observer = new MutationObserver(() => {
      if (!dialog.isConnected) {
        window.checkoutPerf.close = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(dialog.parentNode, { childList: true });
    for (let i = 0; i < 5; i++) button.click();
  });
  await expect(
    dialog.getByRole("button", { name: "Menyimpan…" }),
  ).toBeDisabled();
  await expect(dialog).toHaveCount(0);
  const response = await quote;
  const fee = await response.json();
  expect(fee.available).toBe(true);
  expect(fee.delivery_fee).toBeGreaterThan(0);
  await expect(page.locator(".delivery-summary")).toContainText(detail);
  expect(posts).toBe(1);

  const timing = await page.evaluate(() => {
    const { click, close } = window.checkoutPerf;
    const paths = new Set([
      "/api/address",
      "/api/account",
      "/api/delivery/quote",
    ]);
    const requests = performance
      .getEntriesByType("resource")
      .filter(
        (entry) =>
          entry.startTime >= click && paths.has(new URL(entry.name).pathname),
      )
      .map((entry) => {
        const server = Object.fromEntries(
          entry.serverTiming.map(({ name, duration }) => [name, duration]),
        );
        const networkAndQueue =
          entry.duration - (server["checkout.total"] ?? 0);
        return {
          path: new URL(entry.name).pathname,
          startAfterClickMs: Math.round(entry.startTime - click),
          browserMs: Math.round(entry.duration),
          serverMs: server["checkout.total"],
          dataMs: server["checkout.data"],
          networkAndQueueMs: Math.round(networkAndQueue),
        };
      });
    return { closeMs: Math.round(close - click), requests };
  });
  const measurement = { ...traffic, ...timing, posts, streamStarts };
  console.log(
    `CHECKOUT_PERF ${info.project.name} ${JSON.stringify(measurement)}`,
  );
  await info.attach("checkout-performance", {
    body: JSON.stringify(measurement, null, 2),
    contentType: "application/json",
  });
  if (!baseline) {
    expect(streamStarts).toBe(1);
    expect(traffic.idle5s).toBe(0);
    expect(traffic.churn2s).toBe(0);
    expect(
      timing.requests.filter(({ path }) => path === "/api/account"),
    ).toHaveLength(0);
  }
});
