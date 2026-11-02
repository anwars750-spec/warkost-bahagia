import { test, expect } from "@playwright/test";
test.use({ trace: "off", video: "off", screenshot: "off" });

async function setup(page, { deny = false, fail = false, granted = false } = {}) {
  await page.addInitScript(
    ({ deny, granted }) => {
      const state = (window.pushFixture = {
        permission: granted ? "granted" : "default",
        requests: 0,
        registers: 0,
        subscribes: 0,
        unsubscribes: 0,
        posts: [],
      });
      const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/browser-fixture",
        toJSON() {
          return {
            endpoint: this.endpoint,
            keys: { p256dh: "fixture", auth: "fixture" },
          };
        },
        async unsubscribe() {
          state.unsubscribes++;
          return true;
        },
      };
      const manager = {
        async getSubscription() {
          return state.subscribes > state.unsubscribes ? subscription : null;
        },
        async subscribe() {
          state.subscribes++;
          return subscription;
        },
      };
      const registration = {
        pushManager: manager,
        active: { postMessage() {} },
      };
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: class {
          static get permission() {
            return state.permission;
          }
          static async requestPermission() {
            state.requests++;
            state.permission = deny ? "denied" : "granted";
            return state.permission;
          }
        },
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: class {},
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          async getRegistration() {
            return state.registers ? registration : null;
          },
          async register() {
            state.registers++;
            return registration;
          },
          ready: Promise.resolve(registration),
        },
      });
    },
    { deny, granted },
  );
  await page.route("**/api/push", async (route) => {
    const body = route.request().postDataJSON();
    if (!body)
      return route.fulfill({
        json: { enabled: true, publicKey: "BFake-Public-Key" },
      });
    await page.evaluate((body) => window.pushFixture.posts.push(body), body);
    if (body.action === "subscribe" && fail)
      return route.fulfill({
        status: 503,
        json: { error: "Notifikasi belum dapat diaktifkan" },
      });
    return route.fulfill({ json: { active: body.action === "subscribe" } });
  });
  const origin = process.env.BASE_URL || "http://127.0.0.1:3000";
  const result = await page.request.post(origin + "/api/login", {
    data: {
      identifier: "customer@warkost.local",
      password: process.env.SEED_DEMO_PASSWORD,
    },
    headers: { Origin: origin },
  });
  expect(result.status()).toBe(200);
  const cookie = result.headers()["set-cookie"]?.match(/wb_session=([^;]+)/)?.[1];
  expect(Boolean(cookie)).toBe(true);
  await page.context().addCookies([
    {
      name: "wb_session",
      value: cookie,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  await page.goto("/");
}

async function openAccount(page) {
  await page.getByRole("button", { name: "Akun", exact: true }).first().click();
  await expect(page.locator(".quick-account-menu")).toBeVisible();
}

test("first visit shows a compact Warkost prompt but browser permission waits for explicit click", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByRole("dialog", { name: "Aktifkan notifikasi Warkost" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(0);
  expect(await page.evaluate(() => window.pushFixture.registers)).toBe(0);
  await page
    .getByRole("dialog", { name: "Aktifkan notifikasi Warkost" })
    .getByRole("button", { name: "Aktifkan", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Aktifkan notifikasi Warkost" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(1);
  expect(await page.evaluate(() => window.pushFixture.subscribes)).toBe(1);
  expect(await page.locator(".push-settings").count()).toBe(0);

  await openAccount(page);
  await expect(
    page.getByRole("button", { name: "Nonaktifkan Notifikasi", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nonaktifkan Notifikasi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Aktifkan Notifikasi", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.pushFixture.unsubscribes)).toBe(1);
});

test("permission already granted silently restores push without another browser prompt", async ({
  page,
}) => {
  await setup(page, { granted: true });
  await expect(
    page.getByRole("dialog", { name: "Aktifkan notifikasi Warkost" }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.pushFixture.subscribes))
    .toBe(1);
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(0);
  await openAccount(page);
  await expect(
    page.getByRole("button", { name: "Nonaktifkan Notifikasi", exact: true }),
  ).toBeVisible();
});

test("choosing Nanti dismisses the Warkost prompt without asking browser permission", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("dialog", { name: "Aktifkan notifikasi Warkost" })
    .getByText("Nanti", { exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Aktifkan notifikasi Warkost" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(0);
  expect(await page.evaluate(() => window.pushFixture.subscribes)).toBe(0);
});

test("denied permission is not repeatedly requested and guidance moves to account settings", async ({
  page,
}) => {
  await setup(page, { deny: true });
  await page
    .getByRole("dialog", { name: "Aktifkan notifikasi Warkost" })
    .getByRole("button", { name: "Aktifkan", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Aktifkan notifikasi Warkost" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(1);
  expect(await page.evaluate(() => window.pushFixture.subscribes)).toBe(0);
  await openAccount(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Izin notifikasi diblokir" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aktifkan Notifikasi", exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.pushFixture.requests)).toBe(1);
});

test("backend failure cannot claim active push and browser subscription is released", async ({
  page,
}) => {
  await setup(page, { fail: true });
  await page
    .getByRole("dialog", { name: "Aktifkan notifikasi Warkost" })
    .getByRole("button", { name: "Aktifkan", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Notifikasi belum dapat diaktifkan" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.pushFixture.unsubscribes)).toBe(1);
  await openAccount(page);
  await expect(
    page.getByRole("button", { name: "Nonaktifkan Notifikasi", exact: true }),
  ).toHaveCount(0);
});

test("actual service worker activates with root scope and no notification permission request", async ({
  page,
}) => {
  await page.goto("/");
  const response = await page.request.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const state = await page.evaluate(async () => {
    const before = Notification.permission;
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
    const manifest = await (await fetch("/manifest.webmanifest")).json();
    return {
      scope: registration.scope,
      script: registration.active?.scriptURL,
      permissionUnchanged: Notification.permission === before,
      display: manifest.display,
    };
  });
  expect(new URL(state.scope).pathname).toBe("/");
  expect(new URL(state.script).pathname).toBe("/sw.js");
  expect(state.permissionUnchanged).toBe(true);
  expect(state.display).toBe("standalone");
});
