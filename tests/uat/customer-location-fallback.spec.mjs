import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

// This suite creates addresses and uses a loopback-only session cookie.
test.beforeEach(({ baseURL }) => {
  test.skip(
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
    "Address mutation requires a disposable local fixture.",
  );
});

const savedPoint = { latitude: -6.9213456, longitude: 106.9309032 };
const manualPoint = { latitude: -6.8813456, longitude: 106.9309032 };

async function customer(page, origin) {
  const login = await page.request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: {
      identifier: "customer@warkost.local",
      password: process.env.SEED_DEMO_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  // The production build sends a Secure cookie. The fixture runs over
  // loopback HTTP and also uses Playwright's API client to prepare addresses.
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
}

async function addAddress(page, origin, detail) {
  const response = await page.request.post(origin + "/api/address", {
    headers: { Origin: origin },
    data: { label: "Rumah", detail, ...savedPoint },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

async function openAccount(page) {
  const menu =
    page.viewportSize().width <= 620
      ? page.getByRole("navigation", {
          name: "Navigasi pelanggan",
          exact: true,
        })
      : page.locator("header");
  await menu.getByRole("button", { name: "Akun", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Menu akun" })
    .getByRole("button", { name: "Pengaturan Akun", exact: true })
    .click();
  return page.locator("#account-address");
}

async function openCheckout(page) {
  await page
    .locator(".customer-product")
    .filter({ hasText: "Nasi Goreng Warkost" })
    .click();
  if (page.viewportSize().width <= 620) {
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
}

function picker(page) {
  return page.getByRole("dialog", { name: "Pilih lokasi pengantaran" });
}

function postResponse(page, path) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === "POST",
  );
}

async function verifySearchOff(page, dialog, savedDetail) {
  const unavailable = postResponse(page, "/api/location/autocomplete");
  await dialog
    .getByRole("textbox", { name: "Cari lokasi pengantaran" })
    .fill("Jalan Ahmad Yani");
  const result = await unavailable;
  expect(result.status()).toBe(503);
  expect((await result.json()).code).toBe("UNAVAILABLE");
  await expect(dialog.getByRole("status")).toContainText(
    "Pencarian lokasi otomatis belum tersedia",
  );
  await expect(
    dialog.getByRole("button", { name: new RegExp(savedDetail) }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Masukkan alamat secara manual" }),
  ).toBeInViewport({ ratio: 0.9 });
}

async function enterManual(page, dialog, detail, { testRadius = false } = {}) {
  const manual = dialog.getByRole("button", {
    name: "Masukkan alamat secara manual",
  });
  await expect(manual).toBeInViewport({ ratio: 0.9 });
  await manual.click();
  await expect(
    dialog.getByText("Konfirmasi lokasi", { exact: true }),
  ).toBeVisible();
  const latitude = dialog.getByRole("spinbutton", {
    name: "Latitude",
    exact: true,
  });
  const longitude = dialog.getByRole("spinbutton", {
    name: "Longitude",
    exact: true,
  });
  const applyPoint = dialog.getByRole("button", { name: "Terapkan titik" });
  await dialog.getByRole("textbox", { name: "Alamat lengkap" }).fill(detail);

  if (testRadius) {
    await latitude.fill("91");
    await longitude.fill(String(manualPoint.longitude));
    await applyPoint.click();
    await expect(
      dialog.getByText("Masukkan latitude dan longitude yang valid."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }),
    ).toBeDisabled();
    await latitude.fill("-6.1");
    const outOfRange = postResponse(page, "/api/location/preview");
    await applyPoint.click();
    expect((await (await outOfRange).json()).available).toBe(false);
    await expect(
      dialog.getByText("Di luar jangkauan pengantaran Warkost"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Periksa / ubah titik lokasi" })
      .click();
  }

  await latitude.fill(String(manualPoint.latitude));
  await longitude.fill(String(manualPoint.longitude));
  const preview = postResponse(page, "/api/location/preview");
  await applyPoint.click();
  const response = await preview;
  expect(response.request().postDataJSON()).toEqual(manualPoint);
  const quote = await response.json();
  expect(quote.available).toBe(true);
  expect(quote.delivery_fee).toBeGreaterThan(0);
  await expect(
    dialog.getByText("Rp" + quote.delivery_fee.toLocaleString("id-ID"), {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }).click();
  await expect(dialog).toHaveCount(0);
}

test("Akun lists owned addresses without Checkout and saves manual coordinates with Geoapify OFF", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  const savedDetail = `Jl. Ahmad Yani No. 12 Sukabumi Akun ${info.project.name}`;
  const manualDetail = `Jl. Manual Akun Sukabumi ${info.project.name}`;
  await customer(page, origin);
  const id = await addAddress(page, origin, savedDetail);
  await page.goto("/");
  const account = await openAccount(page);
  await expect(
    account.locator(".line").filter({ hasText: savedDetail }),
  ).toBeVisible();
  await expect(page.locator('select[name="address"]')).toHaveCount(0);
  await account
    .getByRole("button", { name: "Pilih titik lokasi", exact: true })
    .click();
  const dialog = picker(page);
  await expect(
    dialog.getByRole("button", { name: new RegExp(savedDetail) }),
  ).toBeVisible();
  await verifySearchOff(page, dialog, savedDetail);
  await dialog.getByRole("button", { name: new RegExp(savedDetail) }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    account.getByRole("heading", { name: "Ubah alamat" }),
  ).toBeVisible();
  await expect(account.locator('textarea[name="detail"]')).toHaveValue(
    savedDetail,
  );
  await expect(account.locator('input[name="latitude"]')).toHaveValue(
    String(savedPoint.latitude),
  );
  expect(
    (await (await page.request.get(origin + "/api/account")).json()).addresses
      .filter((address) => address.detail === savedDetail)
      .map((address) => address.id),
  ).toEqual([id]);

  await account.getByRole("button", { name: "Batal", exact: true }).click();
  await account
    .getByRole("button", { name: "Pilih titik lokasi", exact: true })
    .click();
  await enterManual(page, dialog, manualDetail, { testRadius: true });
  await expect(account.locator('textarea[name="detail"]')).toHaveValue(
    manualDetail,
  );
  await expect(account.locator('input[name="latitude"]')).toHaveValue(
    manualPoint.latitude.toFixed(6),
  );
  const saved = postResponse(page, "/api/address");
  await account
    .getByRole("button", { name: "Simpan alamat", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  await expect(
    account.locator(".line").filter({ hasText: manualDetail }),
  ).toBeVisible();
});

test("Checkout switches saved address and saves a manual address without losing cart or server quote", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  const savedDetail = `Jl. Ahmad Yani No. 12 Sukabumi Checkout ${info.project.name}`;
  const manualDetail = `Jl. Manual Checkout Sukabumi ${info.project.name}`;
  await customer(page, origin);
  const previous = await addAddress(
    page,
    origin,
    `Jl. Lokasi sebelum pengujian ${info.project.name}`,
  );
  const id = await addAddress(page, origin, savedDetail);
  await page.goto("/");
  await openCheckout(page);
  const select = page.locator('select[name="address"]');
  await select.selectOption(String(previous));
  const launcher = page.getByRole("button", {
    name: "+ Tambah lokasi lain",
    exact: true,
  });
  await launcher.click();
  const dialog = picker(page);
  const quote = postResponse(page, "/api/delivery/quote");
  await dialog.getByRole("button", { name: new RegExp(savedDetail) }).click();
  const quoted = await quote;
  expect(quoted.request().postDataJSON()).toEqual({ addressId: id });
  expect((await quoted.json()).available).toBe(true);
  await expect(select).toHaveValue(String(id));

  await launcher.click();
  await verifySearchOff(page, dialog, savedDetail);
  const saved = postResponse(page, "/api/address");
  await enterManual(page, dialog, manualDetail);
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON()).toMatchObject(manualPoint);
  const added = await response.json();
  await expect(select).toHaveValue(String(added.id));
  await expect(page.locator(".delivery-summary")).toContainText(manualDetail);
  await expect(
    page.getByText("Nasi Goreng Warkost", { exact: true }).first(),
  ).toBeVisible();
});

test("GPS permission, unavailable position and timeout explain recovery without blocking manual input", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() => {
    window.gpsError = 1;
    navigator.geolocation.getCurrentPosition = (_, failure, options) => {
      window.gpsOptions = options;
      queueMicrotask(() => failure({ code: window.gpsError }));
    };
  });
  const origin = new URL(baseURL).origin;
  await customer(page, origin);
  await page.goto("/");
  const account = await openAccount(page);
  await account
    .getByRole("button", { name: "Pilih titik lokasi", exact: true })
    .click();
  const dialog = picker(page);
  const gps = dialog.getByRole("button", { name: /Gunakan lokasi saat ini/ });
  for (const [code, message] of [
    [1, "Izin lokasi ditolak"],
    [2, "Lokasi perangkat tidak dapat ditemukan"],
    [3, "Waktu pencarian GPS habis"],
  ]) {
    await page.evaluate((value) => {
      window.gpsError = value;
    }, code);
    await gps.click();
    await expect(dialog.getByRole("status")).toContainText(message);
    await expect(gps).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Masukkan alamat secara manual" }),
    ).toBeInViewport({ ratio: 0.9 });
  }
  expect(await page.evaluate(() => window.gpsOptions)).toEqual({
    enableHighAccuracy: true,
    timeout: 10000,
  });
});
