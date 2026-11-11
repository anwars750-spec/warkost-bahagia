import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

// This suite creates addresses and uses a loopback-only session cookie.
test.beforeEach(({ baseURL }) => {
  test.skip(
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
    "Address mutation requires a disposable local fixture.",
  );
});

const savedPoint = { latitude: -6.9213456, longitude: 106.9309032 };
const farPoint = { latitude: -6.1, longitude: 106.9309032 };

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

async function readAddresses(page, origin) {
  const response = await page.request.get(origin + "/api/account");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).addresses;
}

async function refreshAccountView(page, account, newAddressDetail) {
  await page.evaluate(() =>
    window.dispatchEvent(new Event("warkost:realtime-recovered")),
  );
  await expect(
    account.locator(".line").filter({ hasText: newAddressDetail }),
  ).toBeVisible();
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
  await expect(
    dialog.getByText("Pencarian lokasi otomatis belum tersedia", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: new RegExp(savedDetail) }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Isi detail alamat" }),
  ).toBeInViewport({ ratio: 0.9 });
}

function pinMap(dialog) {
  return dialog.locator('.wloc-leaflet-map[data-map-state="ready"]');
}

async function selectPaidPoint(page, dialog, info) {
  const map = pinMap(dialog);
  await expect(map.locator("canvas")).toBeVisible();
  await expect(map.getByRole("link", { name: /OpenStreetMap/ })).toBeVisible();
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  const zoomOut = map.getByRole("button", { name: "Perkecil peta" });
  for (let zoom = 0; zoom < 3; zoom++) await zoomOut.click();
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");
  await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  const x = box.x + box.width * 0.87;
  const y = box.y + box.height / 2;
  const preview = postResponse(page, "/api/location/preview");
  if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const response = await preview;
  const point = response.request().postDataJSON();
  const quote = await response.json();
  expect(quote.available).toBe(true);
  expect(quote.delivery_fee).toBeGreaterThan(0);
  await expect(
    dialog.getByText("Rp" + quote.delivery_fee.toLocaleString("id-ID"), {
      exact: true,
    }),
  ).toBeVisible();
  return point;
}

async function enterManual(page, dialog, detail, info) {
  const point = await selectPaidPoint(page, dialog, info);
  await dialog.getByRole("button", { name: "Isi detail alamat" }).click();
  await expect(
    dialog.getByText("Konfirmasi lokasi", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Alamat lengkap" }).fill(detail);
  await dialog
    .getByRole("textbox", { name: "Detail pengantaran" })
    .fill("Pagar cokelat");
  await dialog.getByRole("button", { name: "Kantor", exact: true }).click();
  await dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }).click();
  await expect(dialog).toHaveCount(0);
  return point;
}

test("Akun saves a map-selected address once after realtime refresh and keeps it after reload", async ({
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
  const previous = (await readAddresses(page, origin)).find(
    (address) => address.id === id,
  );
  expect(previous).toMatchObject({ id, ...savedPoint, detail: savedDetail });

  await account.getByRole("button", { name: "Batal", exact: true }).click();
  await account
    .getByRole("button", { name: "Pilih titik lokasi", exact: true })
    .click();
  const point = await enterManual(page, dialog, manualDetail, info);
  await expect(account.locator('textarea[name="detail"]')).toHaveValue(
    manualDetail + " — Pagar cokelat",
  );
  await expect(
    account.getByRole("textbox", { name: "Label alamat" }),
  ).toHaveValue("Kantor");

  // The normal recovery handler pulls updated account data and rerenders this form.
  const concurrentDetail = `Jl. Refresh Realtime ${info.project.name}`;
  await addAddress(page, origin, concurrentDetail);
  await refreshAccountView(page, account, concurrentDetail);
  await expect(account.getByText("Lokasi terpilih")).toBeVisible();
  await expect(account.getByText("Titik lokasi sudah valid.")).toBeVisible();

  const form = account.locator("form");
  const writes = [];
  let releaseSave;
  const holdSave = new Promise((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/api/address", async (route) => {
    writes.push(route.request().postDataJSON());
    await holdSave;
    await route.continue();
  });
  const saved = postResponse(page, "/api/address");
  try {
    await account
      .getByRole("button", { name: "Simpan alamat", exact: true })
      .click();
    await expect(
      account.getByRole("button", { name: "Menyimpan…" }),
    ).toBeDisabled();
    await form.evaluate((element) => {
      for (let i = 0; i < 5; i++) element.requestSubmit();
    });
    await expect.poll(() => writes.length).toBe(1);
  } finally {
    releaseSave();
  }
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  expect(writes).toEqual([
    {
      label: "Kantor",
      detail: manualDetail + " — Pagar cokelat",
      ...point,
      isDefault: false,
    },
  ]);
  const { id: addedId } = await response.json();
  const added = account.locator(".line").filter({ hasText: manualDetail });
  await expect(added).toContainText("Kantor");
  await expect(
    account.getByRole("button", { name: "Pilih titik lokasi", exact: true }),
  ).toBeVisible();
  await expect(form.getByText("Lokasi terpilih")).toHaveCount(0);
  await expect(form.getByRole("textbox")).toHaveCount(0);

  await page.reload();
  await openAccount(page);
  await expect(added).toContainText("Kantor");
  const addresses = await readAddresses(page, origin);
  expect(
    addresses.filter((address) => address.detail.includes(manualDetail)),
  ).toEqual([
    expect.objectContaining({ id: addedId, label: "Kantor", ...point }),
  ]);
  expect(addresses.find((address) => address.id === id)).toEqual(previous);
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
  const subtotal = page
    .locator(".checkout-summary-card .payment-line")
    .filter({ hasText: "Subtotal" })
    .locator("strong");
  const originalSubtotal = await subtotal.innerText();
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
  const newQuote = postResponse(page, "/api/delivery/quote");
  const point = await enterManual(page, dialog, manualDetail, info);
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON()).toMatchObject({
    ...point,
    label: "Kantor",
    detail: manualDetail + " — Pagar cokelat",
  });
  const added = await response.json();
  const priced = await newQuote;
  expect(priced.request().postDataJSON()).toEqual({ addressId: added.id });
  const delivery = await priced.json();
  expect(delivery.available).toBe(true);
  expect(delivery.delivery_fee).toBeGreaterThan(0);
  await expect(subtotal).toHaveText(originalSubtotal);
  const total =
    Number(originalSubtotal.replace(/\D/g, "")) + delivery.delivery_fee;
  await expect(
    page.locator(".checkout-summary-card .payment-total strong"),
  ).toHaveText("Rp" + total.toLocaleString("id-ID"));
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
    await expect(dialog.getByText(message, { exact: false })).toBeVisible();
    await expect(gps).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Isi detail alamat" }),
    ).toBeInViewport({ ratio: 0.9 });
  }
  expect(await page.evaluate(() => window.gpsOptions)).toEqual({
    enableHighAccuracy: true,
    timeout: 10000,
  });
});

async function drag(page, info, x, y, dx, dy, beforeRelease) {
  if (info.project.name === "mobile-chromium") {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, touchPoints) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    try {
      await touch("touchStart", [{ x, y }]);
      for (let step = 1; step <= 12; step++) {
        await touch("touchMove", [
          { x: x + (dx * step) / 12, y: y + (dy * step) / 12 },
        ]);
      }
      await beforeRelease();
      await touch("touchEnd", []);
    } finally {
      await cdp.detach();
    }
  } else if (info.project.name === "iphone-webkit") {
    const start = await page.evaluateHandle(
      ({ x, y }) => document.elementFromPoint(x, y),
      { x, y },
    );
    const dispatch = (phase, offset) =>
      start.evaluate(
        (element, { phase, x, y }) => {
          if ("ontouchstart" in window || window.TouchEvent) {
            // Desktop WebKit can expose Touch without a public constructor.
            const touch = {
              identifier: 1,
              target: element,
              clientX: x,
              clientY: y,
            };
            const touches = phase === "end" ? [] : [touch];
            const event = new Event("touch" + phase, {
              bubbles: true,
              cancelable: true,
            });
            Object.defineProperties(event, {
              touches: { value: touches },
              targetTouches: { value: touches },
              changedTouches: { value: [touch] },
            });
            element.dispatchEvent(event);
          } else {
            const type = {
              start: "pointerdown",
              move: "pointermove",
              end: "pointerup",
            }[phase];
            element.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerType: "touch",
                pointerId: 1,
                clientX: x,
                clientY: y,
                isPrimary: true,
              }),
            );
          }
        },
        { phase, x: x + dx * offset, y: y + dy * offset },
      );
    try {
      await dispatch("start", 0);
      for (let step = 1; step <= 12; step++) await dispatch("move", step / 12);
      await beforeRelease();
      await dispatch("end", 1);
    } finally {
      await start.dispose();
    }
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await beforeRelease();
    await page.mouse.up();
  }
}

test("map gestures quote once after settling, preserve Account edit, and reject out-of-range GPS", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  await page.addInitScript((point) => {
    navigator.geolocation.getCurrentPosition = (success) =>
      success({ coords: point });
  }, farPoint);
  await customer(page, origin);
  const oldDetail = "Jl. Titik Awal Peta " + info.project.name;
  const updatedDetail = "Jl. Titik Baru Peta " + info.project.name;
  const id = await addAddress(page, origin, oldDetail);
  const retainedId = await addAddress(
    page,
    origin,
    "Jl. Tetap " + info.project.name,
  );
  const retained = (await readAddresses(page, origin)).find(
    (address) => address.id === retainedId,
  );
  await page.goto("/");
  const account = await openAccount(page);
  const launch = account.getByRole("button", {
    name: /^(Pilih|Ubah) titik lokasi$/,
  });
  await launch.click();
  const dialog = picker(page);
  await dialog.getByRole("button", { name: new RegExp(oldDetail) }).click();
  await expect(dialog).toHaveCount(0);
  await launch.click();
  await dialog.getByRole("button", { name: /Gunakan lokasi saat ini/ }).click();
  await expect(
    dialog.getByText("Di luar jangkauan pengantaran Warkost"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }),
  ).toHaveCount(0);

  const map = pinMap(dialog);
  await expect(map.locator("canvas")).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  const pin = map.locator(".wloc-delivery-pin");
  const mapBox = await map.boundingBox();
  const box = await pin.boundingBox();
  expect(
    Math.abs(box.x + box.width / 2 - (mapBox.x + mapBox.width / 2)),
  ).toBeLessThan(5);
  const counts = { me: 0, quote: 0, search: 0, external: 0 };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/me") counts.me++;
    if (url.pathname === "/api/location/autocomplete") counts.search++;
    if (url.pathname === "/api/location/preview" && request.method() === "POST")
      counts.quote++;
    if (url.origin !== origin) counts.external++;
  });
  const preview = postResponse(page, "/api/location/preview");
  await drag(
    page,
    info,
    box.x + box.width / 2,
    box.y + box.height / 3,
    55,
    32,
    async () => {
      // Longer than the debounce. Moving frames must still produce no request.
      await page.waitForTimeout(475);
      expect(counts.quote).toBe(0);
    },
  );
  const result = await preview;
  const point = result.request().postDataJSON();
  expect(point).not.toEqual(savedPoint);
  expect(await result.json()).toMatchObject({
    available: true,
    free_delivery: true,
    delivery_fee: 0,
  });
  await expect(dialog.getByText(/GRATIS ONGKIR/)).toBeVisible();

  const afterDrag = postResponse(page, "/api/location/preview");
  const panBox = await map.boundingBox();
  await drag(page, info, panBox.x + 95, panBox.y + 80, -50, 30, async () => {
    await page.waitForTimeout(475);
    expect(counts.quote).toBe(1);
  });
  const second = await afterDrag;
  const newPoint = second.request().postDataJSON();
  expect(newPoint).not.toEqual(point);
  await expect(dialog.getByText(/GRATIS ONGKIR/)).toBeVisible();
  await page.waitForTimeout(475);
  expect(counts).toEqual({ me: 0, quote: 2, search: 0, external: 0 });
  await page.screenshot({ path: info.outputPath("picker-gestures.png") });

  await dialog
    .getByRole("textbox", { name: "Alamat lengkap" })
    .fill(updatedDetail);
  await dialog.getByRole("button", { name: "Lainnya", exact: true }).click();
  await dialog
    .getByPlaceholder("Contoh: Kos, Kampus, Orang Tua")
    .fill("Kos UAT");
  await dialog.getByRole("button", { name: "GUNAKAN LOKASI INI" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    account.getByRole("textbox", { name: "Label alamat" }),
  ).toHaveValue("Kos UAT");
  const edit = postResponse(page, "/api/address-replace");
  await account
    .getByRole("button", { name: "Simpan alamat", exact: true })
    .click();
  const replaced = await edit;
  expect(replaced.ok()).toBeTruthy();
  expect(replaced.request().postDataJSON()).toMatchObject({
    id,
    detail: updatedDetail,
    label: "Kos UAT",
    ...newPoint,
  });
  const updated = account.locator(".line").filter({ hasText: updatedDetail });
  await expect(updated).toContainText("Kos UAT");
  await expect(
    account.getByRole("heading", { name: "Tambah alamat", exact: true }),
  ).toBeVisible();
  await expect(account.locator("form").getByRole("textbox")).toHaveCount(0);
  await page.reload();
  await openAccount(page);
  await expect(updated).toContainText("Kos UAT");
  const addresses = await readAddresses(page, origin);
  expect(addresses.filter((address) => address.id === id)).toHaveLength(0);
  expect(
    addresses.filter((address) => address.detail === updatedDetail),
  ).toEqual([expect.objectContaining({ label: "Kos UAT", ...newPoint })]);
  expect(addresses.find((address) => address.id === retainedId)).toEqual(
    retained,
  );
});

test("Checkout remains usable on map failure and retry reloads the local asset", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  await customer(page, origin);
  const savedDetail = "Jl. Fallback Tanpa Peta " + info.project.name;
  const id = await addAddress(page, origin, savedDetail);
  const other = await addAddress(
    page,
    origin,
    "Jl. Sebelum Fallback " + info.project.name,
  );
  let blocked = true;
  let loads = 0;
  await page.route("**/maps/sukabumi-delivery-v1.geojson", (route) => {
    loads++;
    return blocked ? route.fulfill({ status: 503 }) : route.continue();
  });
  await page.goto("/");
  await openCheckout(page);
  const select = page.locator('select[name="address"]');
  await select.selectOption(String(other));
  const launcher = page.getByRole("button", {
    name: "+ Tambah lokasi lain",
    exact: true,
  });
  await launcher.click();
  const dialog = picker(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "Peta belum dapat dimuat",
  );
  await expect(
    dialog.getByRole("button", { name: "Coba muat peta lagi" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("picker-fallback.png") });
  const savedQuote = postResponse(page, "/api/delivery/quote");
  await dialog.getByRole("button", { name: new RegExp(savedDetail) }).click();
  expect((await (await savedQuote).json()).available).toBe(true);
  await expect(select).toHaveValue(String(id));

  await launcher.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Peta belum dapat dimuat",
  );
  blocked = false;
  await dialog.getByRole("button", { name: "Coba muat peta lagi" }).click();
  await expect(pinMap(dialog).locator("canvas")).toBeVisible();
  expect(loads).toBe(3);
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
});

test("Akun blocks missing coordinates and address APIs reject incomplete and invalid points", async ({
  page,
  baseURL,
}, info) => {
  const origin = new URL(baseURL).origin;
  await customer(page, origin);
  const retainedId = await addAddress(
    page,
    origin,
    "Jl. Validasi " + info.project.name,
  );
  const before = await readAddresses(page, origin);
  await page.goto("/");
  const account = await openAccount(page);
  const form = account.locator("form");
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/address(?:-replace)?$/.test(request.url())
    )
      writes++;
  });
  await expect(form.getByRole("button", { name: "Simpan alamat" })).toHaveCount(
    0,
  );
  await form.evaluate((element) => element.requestSubmit());
  await expect(form.getByRole("alert")).toHaveText(
    "Pilih titik lokasi terlebih dahulu agar alamat tersimpan akurat.",
  );
  expect(writes).toBe(0);

  for (const path of ["address", "address-replace"]) {
    for (const point of [
      {},
      { latitude: -6.9 },
      { latitude: 91, longitude: 106 },
      { latitude: " ", longitude: 106 },
    ]) {
      const result = await page.request.post(origin + "/api/" + path, {
        headers: { Origin: origin },
        data: {
          id: retainedId,
          label: "Kantor",
          detail: "Alamat tidak valid UAT",
          ...point,
        },
      });
      expect(result.status()).toBe(400);
      expect((await result.json()).error).toBe("Titik lokasi tidak valid");
    }
  }
  expect(await readAddresses(page, origin)).toEqual(before);
});
