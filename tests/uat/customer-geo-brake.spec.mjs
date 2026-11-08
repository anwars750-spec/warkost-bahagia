import { test, expect } from "@playwright/test";

test("location picker debounces rapid edits, rejects stale responses and opens no tile or route traffic", async ({
  page,
}) => {
  const origin = new URL(test.info().project.use.baseURL).origin;
  const calls = [];
  const previews = [];
  const external = [];
  let releaseStale;
  const stale = new Promise((resolve) => {
    releaseStale = resolve;
  });
  const items = (label) =>
    Array.from({ length: 4 }, (_, index) => ({
      placeId: String(index),
      name: label + " " + index,
      address: "Alamat pengujian",
      latitude: -6.9217,
      longitude: 106.9272,
    }));

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.hostname);
      return route.abort();
    }
    if (url.pathname === "/api/location/autocomplete") {
      const { query } = route.request().postDataJSON();
      calls.push(query);
      if (query === "Jalan Lama") await stale;
      return route
        .fulfill({ json: { suggestions: items(query) } })
        .catch(() => {});
    }
    if (url.pathname === "/api/location/preview")
      previews.push(route.request().postDataJSON());
    return route.continue();
  });
  const login = await page.request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: {
      identifier: "customer@warkost.local",
      password: process.env.SEED_DEMO_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Akun", exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("warkost:location-picker-open", {
        detail: { source: "account" },
      }),
    ),
  );
  const dialog = page.getByRole("dialog", { name: "Pilih lokasi pengantaran" });
  const field = dialog.getByRole("textbox", {
    name: "Cari lokasi pengantaran",
  });
  await expect(field).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await field.evaluate((el) => {
    const change = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    for (let i = 0; i < 1000; i++) {
      change.call(el, "Jalan " + i);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    change.call(el, "Jalan Lama");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.clock.runFor(699);
  expect(calls).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => calls.slice()).toEqual(["Jalan Lama"]);
  await field.fill("Jalan Baru");
  await page.clock.runFor(700);
  await expect(dialog.getByRole("button", { name: /Jalan Baru/ })).toHaveCount(
    3,
  );
  releaseStale();
  await expect(dialog.getByRole("button", { name: /Jalan Lama/ })).toHaveCount(
    0,
  );
  expect(calls).toEqual(["Jalan Lama", "Jalan Baru"]);
  expect(previews).toEqual([]);
  await page.clock.resume();
  await dialog.getByRole("button", { name: /Jalan Baru 0/ }).click();
  await expect
    .poll(() => previews.slice())
    .toEqual([{ latitude: -6.9217, longitude: 106.9272 }]);
  await expect(
    dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Periksa / ubah titik lokasi" })
    .click();
  await expect(
    dialog.getByRole("spinbutton", { name: "Latitude" }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
