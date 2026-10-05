import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3000";
let cookie = "";
async function call(action, body, session = "") {
  if (action === "checkout" && body && !body.idempotencyKey)
    body = { ...body, idempotencyKey: crypto.randomUUID() };
  const r = await fetch(origin + "/api/" + action, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await r.json();
  return {
    status: r.status,
    value,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const pw = process.env.SEED_DEMO_PASSWORD;
assert.equal(
  (
    await fetch(origin + "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    })
  ).status,
  400,
);
assert.equal(
  (
    await fetch(origin + "/api/login", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })
  ).status,
  415,
);
const login = async (email) => {
  const r = await call("login", { email, password: pw });
  assert.equal(r.status, 200, JSON.stringify(r.value));
  return r.cookie;
};
const customer = await login("customer@warkost.local"),
  admin = await login("admin@warkost.local"),
  manager = await login("manager@warkost.local"),
  driver = await login("driver@warkost.local"),
  kitchen = await login("kitchen@warkost.local"),
  owner = await login("owner@warkost.local");
const temporary = await login("customer@warkost.local");
assert.equal(
  (await call("me", undefined, temporary)).value.user.role,
  "CUSTOMER",
);
assert.equal((await call("logout", {}, temporary)).status, 200);
assert.equal((await call("me", undefined, temporary)).value.user, null);
assert.equal((await call("drivers", undefined, customer)).status, 403);
for (let attempt = 0; attempt < 13; attempt++) {
  const result = await call("login", {
    email: "nonexistent-smoke@example.test",
    password: "incorrect-password",
  });
  assert.equal(result.status, attempt < 12 ? 401 : 429);
}
assert.equal((await call("inventory", undefined, customer)).status, 403);
assert.equal((await call("stock", undefined, kitchen)).status, 403);
assert.equal((await call("audit", undefined, admin)).status, 403);
assert.equal((await call("audit", undefined, owner)).status, 200);
assert.equal((await call("promotions", undefined, customer)).status, 403);
assert.equal((await call("promotions", undefined, owner)).status, 200);
assert.equal((await call("promotions", undefined, admin)).status, 403);
const scheduledPromotion = await call(
  "promotion",
  {
    title: "Promo Smoke Terjadwal",
    description: "Promo untuk verifikasi HTTP end-to-end",
    badge: "PROMO SMOKE",
    terms: "Berlaku selama pengujian smoke",
    ctaLabel: "Pilih Menu",
    imageUrl: "",
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    active: true,
  },
  manager,
);
assert.equal(
  scheduledPromotion.status,
  200,
  JSON.stringify(scheduledPromotion.value),
);
assert.equal(
  (await call("menu")).value.promotions.some(
    (item) => item.id === scheduledPromotion.value.id,
  ),
  false,
);
const activatedPromotion = await call(
  "promotion",
  {
    id: scheduledPromotion.value.id,
    title: "Promo Smoke Aktif",
    description: "Promo untuk verifikasi HTTP end-to-end",
    badge: "PROMO SMOKE",
    terms: "Berlaku selama pengujian smoke",
    ctaLabel: "Pilih Menu",
    imageUrl: "",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    active: true,
  },
  manager,
);
assert.equal(
  activatedPromotion.status,
  200,
  JSON.stringify(activatedPromotion.value),
);
assert.equal(
  (await call("menu")).value.promotions.some(
    (item) => item.id === scheduledPromotion.value.id,
  ),
  true,
);
assert.equal(
  (await call("promotion", { ...activatedPromotion.value }, customer)).status,
  403,
);
assert.equal((await call("customers", undefined, customer)).status, 403);
const customersBefore = await call(
  "customers?q=customer%40warkost.local",
  undefined,
  admin,
);
assert.equal(customersBefore.status, 200);
assert.equal(customersBefore.value.customers.length, 1);
assert.equal(
  Object.hasOwn(customersBefore.value.customers[0], "password_hash"),
  false,
);
const newCustomer = await call("register", {
  name: "Customer Admin Test",
  email: "customer-admin-smoke@test.local",
  password: "strong-new-customer-2026",
});
assert.equal(newCustomer.status, 200, JSON.stringify(newCustomer.value));
const newCustomerId = newCustomer.value.user.id;
assert.equal(
  (
    await call(
      "customer-active",
      { id: newCustomerId, active: false },
      customer,
    )
  ).status,
  403,
);
assert.equal(
  (await call("customer-active", { id: newCustomerId, active: false }, admin))
    .status,
  200,
);
assert.equal(
  (await call("me", undefined, newCustomer.cookie)).value.user,
  null,
);
assert.equal(
  (
    await call("login", {
      email: "customer-admin-smoke@test.local",
      password: "strong-new-customer-2026",
    })
  ).status,
  401,
);
assert.equal(
  (await call("customer-active", { id: newCustomerId, active: true }, admin))
    .status,
  200,
);
assert.equal((await call("inventory", undefined, admin)).status, 403);
const inv = await call("inventory", undefined, manager);
assert.equal(inv.status, 200);
assert.ok(inv.value.products.length > 0);
assert.equal(
  (
    await call(
      "stock",
      { productId: 1, quantity: -1, reason: "Koreksi smoke" },
      manager,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "stock",
      { productId: 1, quantity: 1, reason: "Stok smoke" },
      manager,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "stock",
      { productId: 1, quantity: -1, reason: "Koreksi owner" },
      owner,
    )
  ).status,
  200,
);
const png = await sharp({
  create: { width: 120, height: 90, channels: 3, background: "#b66330" },
})
  .png()
  .toBuffer();
const mediaForm = new FormData();
mediaForm.append("image", new Blob([png], { type: "image/png" }), "menu.png");
const denied = await fetch(origin + "/api/upload", {
  method: "POST",
  headers: { cookie: customer },
  body: mediaForm,
});
assert.equal(denied.status, 403);
const oversized = await fetch(origin + "/api/upload", {
  method: "POST",
  headers: {
    cookie: admin,
    "content-type": "multipart/form-data; boundary=oversized",
  },
  body: Buffer.alloc(9 * 1024 * 1024 + 1, 65),
});
assert.equal(oversized.status, 413);
assert.equal(
  (
    await fetch(origin + "/api/upload", {
      method: "POST",
      headers: {
        cookie: manager,
        "content-type": "multipart/form-data; boundary=broken",
      },
      body: "invalid multipart",
    })
  ).status,
  400,
);
const uploaded = await fetch(origin + "/api/upload", {
  method: "POST",
  headers: { cookie: manager },
  body: mediaForm,
});
assert.equal(uploaded.status, 201);
const image = await uploaded.json();
const served = await fetch(origin + image.url);
assert.equal(served.status, 200);
assert.equal(served.headers.get("content-type"), "image/webp");
const first = inv.value.products[0];
const updated = await call(
  "product",
  {
    id: first.id,
    name: first.name,
    description: first.description,
    price: first.price,
    categoryId: first.category_id,
    imageUrl: image.url,
    prepStation: first.prep_station,
    active: true,
  },
  manager,
);
assert.equal(updated.status, 200, JSON.stringify(updated.value));
assert.equal(
  (await call("menu")).value.products.find((p) => p.id === first.id).image_url,
  image.url,
);

assert.equal((await call("dashboard", undefined, customer)).status, 403);
assert.equal((await call("dashboard", undefined, admin)).status, 200);
assert.equal((await call("settings", undefined, customer)).status, 403);
assert.equal((await call("settings", undefined, admin)).status, 403);
assert.equal((await call("settings", undefined, manager)).status, 200);
const newDriver = await call(
  "driver",
  {
    name: "Driver Smoke",
    email: "driver-smoke@test.local",
    password: "a-long-unique-password-123",
    phone: "081546407856",
  },
  owner,
);
assert.equal(newDriver.status, 201, JSON.stringify(newDriver.value));
const primaryDriver = (
  await call("drivers", undefined, admin)
).value.drivers.find((item) => item.email === "driver@warkost.local");
assert.ok(primaryDriver);
assert.equal(
  (
    await call(
      "driver-active",
      { id: newDriver.value.id, active: false },
      owner,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call("login", {
      email: "driver-smoke@test.local",
      password: "a-long-unique-password-123",
    })
  ).status,
  401,
);
const dashboardBaseline = (await call("dashboard", undefined, admin)).value;
const accountBaseline = (await call("account", undefined, customer)).value;
const reportBaseline = (await call("report", undefined, owner)).value;
const checkoutBody = {
  addressId: 1,
  method: "CASH",
  items: [{ productId: 1, quantity: 2 }],
  idempotencyKey: crypto.randomUUID(),
};
const created = await call("checkout", checkoutBody, customer);
assert.equal(created.status, 201, JSON.stringify(created.value));
const id = created.value.id;
const retried = await call("checkout", checkoutBody, customer);
assert.equal(retried.status, 201);
assert.equal(retried.value.id, id);
assert.equal(retried.value.replayed, true);
assert.equal(
  (
    await call(
      "checkout",
      {
        ...checkoutBody,
        items: [{ productId: 1, quantity: 1 }],
      },
      customer,
    )
  ).status,
  409,
);
const dashboardAfterCheckout = (await call("dashboard", undefined, admin))
  .value;
assert.equal(
  dashboardAfterCheckout.today.orders,
  dashboardBaseline.today.orders + 1,
);
assert.equal(
  dashboardAfterCheckout.today.revenue,
  dashboardBaseline.today.revenue,
);
const customerNotices = await call("notifications", undefined, customer);
assert.equal(customerNotices.status, 200);
assert.ok(customerNotices.value.unread >= 1);
const adminNotices = await call("notifications", undefined, admin);
assert.ok(adminNotices.value.unread >= 1);
assert.equal(
  (
    await call(
      "notification-read",
      { id: customerNotices.value.notifications[0].id },
      admin,
    )
  ).status,
  200,
);
assert.equal(
  (await call("notifications", undefined, customer)).value.unread,
  customerNotices.value.unread,
);
assert.equal(
  (
    await call(
      "notification-read",
      { id: customerNotices.value.notifications[0].id },
      customer,
    )
  ).status,
  200,
);

assert.equal(
  (await call("order-items?id=" + id, undefined, driver)).status,
  403,
);
const detail = await call("order-items?id=" + id, undefined, customer);
assert.equal(detail.value.items[0].quantity, 2);
assert.equal(
  (await call("status", { orderId: id, status: "CONFIRMED" }, admin)).status,
  200,
);
assert.equal(
  (await call("station-status", { orderId: id, status: "PREPARING" }, admin))
    .status,
  403,
);
for (const status of ["PREPARING", "READY"])
  assert.equal(
    (await call("station-status", { orderId: id, status }, kitchen)).status,
    200,
  );
assert.equal(
  (
    await call(
      "status",
      { orderId: id, status: "ASSIGNED", driverId: primaryDriver.id },
      admin,
    )
  ).status,
  200,
);
assert.equal((await call("accept", { orderId: id }, driver)).status, 200);
for (const status of ["PICKED_UP", "ON_DELIVERY", "DELIVERED"])
  assert.equal(
    (await call("status", { orderId: id, status }, driver)).status,
    200,
  );
assert.ok((await call("notifications", undefined, driver)).value.unread >= 1);
assert.ok(
  (await call("notifications", undefined, customer)).value.notifications.some(
    (n) => n.message.includes("telah diterima"),
  ),
);
assert.equal(
  (await call("payment", { orderId: id, status: "PAID" }, admin)).status,
  200,
);
const paidAccount = await call("account", undefined, customer);
assert.equal(
  paidAccount.value.loyalty,
  accountBaseline.loyalty +
    Math.floor(
      (created.value.subtotal -
        (created.value.voucherDiscount || 0) -
        (created.value.loyaltyDiscount || 0)) /
        10000,
    ),
);
assert.equal(
  (await call("dashboard", undefined, admin)).value.today.revenue,
  dashboardBaseline.today.revenue + created.value.total,
);
const report = await call("report", undefined, owner);
assert.equal(report.status, 200);
assert.equal(
  report.value.paid.revenue,
  reportBaseline.paid.revenue + created.value.total,
);
const previousProductQuantity = Number(
  reportBaseline.products.find(
    (product) => product.product_id === checkoutBody.items[0].productId,
  )?.quantity || 0,
);
assert.equal(
  Number(
    report.value.products.find(
      (product) => product.product_id === checkoutBody.items[0].productId,
    )?.quantity,
  ),
  previousProductQuantity + 2,
);
assert.equal((await call("report", undefined, customer)).status, 403);
assert.equal(
  (await call("report?date=2026-02-30", undefined, owner)).status,
  400,
);
assert.equal(
  (await call("payment", { orderId: id, status: "PAID" }, admin)).status,
  400,
);
assert.equal(
  (
    await call(
      "settings",
      { brandName: "Kafe Smoke", rupiahPerPoint: 10000 },
      manager,
    )
  ).status,
  200,
);
assert.equal((await call("menu")).value.brand, "Kafe Smoke");
const added = await call(
  "address",
  {
    label: "Kantor",
    detail: "Jl. Karya No. 88 Sukabumi",
    latitude: -6.9217,
    longitude: 106.9272,
  },
  customer,
);
assert.equal(added.status, 200);
const replaced = await call(
  "address-replace",
  {
    id: added.value.id,
    label: "Kantor Baru",
    detail: "Jl. Karya No. 99 Sukabumi",
    latitude: -6.9217,
    longitude: 106.9272,
  },
  customer,
);
assert.equal(replaced.status, 200);
assert.equal(
  (await call("address-remove", { id: replaced.value.id }, customer)).status,
  200,
);
assert.equal(
  (
    await call(
      "checkout",
      {
        addressId: replaced.value.id,
        method: "CASH",
        items: [{ productId: 1, quantity: 1 }],
      },
      customer,
    )
  ).status,
  400,
);
const profile = await call(
  "profile",
  {
    name: "Customer Smoke",
    currentPassword: pw,
    newPassword: "new-password-long-2026",
  },
  customer,
);
assert.equal(profile.status, 200);
assert.equal((await call("me", undefined, customer)).value.user, null);
assert.equal(
  (await call("login", { email: "customer@warkost.local", password: pw }))
    .status,
  401,
);
assert.equal(
  (await call("orders?before=garbage", undefined, driver)).status,
  400,
);
const customerAgain = (
  await call("login", {
    email: "customer@warkost.local",
    password: "new-password-long-2026",
  })
).cookie;
for (let n = 0; n < 26; n++) {
  const result = await call(
    "checkout",
    { addressId: 1, method: "CASH", items: [{ productId: 1, quantity: 1 }] },
    customerAgain,
  );
  assert.equal(result.status, 201, JSON.stringify(result.value));
}
const firstPage = (await call("orders", undefined, customerAgain)).value;
assert.equal(firstPage.orders.length, 25);
assert.ok(firstPage.nextCursor);
const secondPage = (
  await call("orders?before=" + firstPage.nextCursor, undefined, customerAgain)
).value;
assert.ok(secondPage.orders.length >= 2);
assert.ok(secondPage.orders.every((order) => order.id < firstPage.nextCursor));
assert.ok(
  (await call("orders", undefined, driver)).value.orders.some(
    (order) => order.id === id,
  ),
);
assert.equal(
  (await call("status", { orderId: id, status: "DELIVERED" }, driver)).status,
  400,
);
const hidden = inv.value.products[0];
assert.equal(
  (
    await call(
      "product",
      {
        ...hidden,
        id: hidden.id,
        categoryId: hidden.category_id,
        imageUrl: hidden.image_url,
        prepStation: hidden.prep_station,
        active: false,
      },
      customer,
    )
  ).status,
  401,
);
assert.equal(
  (await call("category", { name: "Tes Kategori" }, driver)).status,
  403,
);
console.log(
  "HTTP PASS: login enam role, RBAC, stok, kitchen, owner audit, driver, delivered, loyalty once; order #" +
    id,
);
