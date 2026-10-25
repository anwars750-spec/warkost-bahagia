import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";

const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3000";
const seedPassword = process.env.SEED_DEMO_PASSWORD;

async function call(action, body, session = "") {
  if (action === "checkout" && body && !body.idempotencyKey)
    body = { ...body, idempotencyKey: crypto.randomUUID() };
  const response = await fetch(`${origin}/api/${action}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(session ? { cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let value = null;
  const text = await response.text();
  if (text) value = JSON.parse(text);
  return {
    status: response.status,
    value,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}

async function login(email) {
  const result = await call("login", { email, password: seedPassword });
  assert.equal(result.status, 200, JSON.stringify(result.value));
  assert.ok(result.cookie);
  return result.cookie;
}

function latestOtpCode() {
  const rows = JSON.parse(
    fs.readFileSync(process.env.OTP_OUTBOX_PATH, "utf8"),
  );
  const match = rows.at(-1)?.text?.match(/\b\d{6}\b/);
  assert.ok(match, "OTP development outbox harus memiliki kode 6 digit");
  return match[0];
}

async function markQrisPaid(checkout) {
  const secret = String(process.env.PAYMENT_WEBHOOK_SECRET || "");
  assert.ok(secret.length >= 32, "PAYMENT_WEBHOOK_SECRET smoke wajib tersedia");
  const payment = checkout.payment;
  assert.equal(payment.method, "QRIS");
  assert.equal(payment.status, "PENDING");
  assert.ok(payment.transaction_reference);
  assert.ok(payment.provider_reference);

  const rawBody = JSON.stringify({
    event_id: `smoke-paid-${payment.id}-${crypto.randomUUID()}`,
    transaction_reference: payment.transaction_reference,
    provider_reference: payment.provider_reference,
    status: "PAID",
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const response = await fetch(`${origin}/api/payment/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment-signature": signature,
    },
    body: rawBody,
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  assert.equal(value.payment.status, "PAID");
  return value;
}

// Request parsing guardrails.
assert.equal(
  (
    await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    })
  ).status,
  400,
);
assert.equal(
  (
    await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })
  ).status,
  415,
);

// Final role sessions.
const customer = await login("customer@warkost.local");
const admin = await login("admin@warkost.local");
const manager = await login("manager@warkost.local");
const driver = await login("driver@warkost.local");
const kitchen = await login("kitchen@warkost.local");
const owner = await login("owner@warkost.local");

// High-value RBAC contracts.
assert.equal((await call("inventory", undefined, customer)).status, 403);
assert.equal((await call("inventory", undefined, manager)).status, 200);
assert.equal((await call("stock", undefined, kitchen)).status, 200);
assert.equal((await call("audit", undefined, admin)).status, 403);
assert.equal((await call("audit", undefined, owner)).status, 200);
assert.equal((await call("settings", undefined, manager)).status, 403);
assert.equal((await call("settings", undefined, owner)).status, 200);
assert.equal((await call("promotions", undefined, customer)).status, 403);
assert.equal((await call("promotions", undefined, owner)).status, 200);

// Registration OTP final flow: pending account -> OTP -> active session.
const registrationPassword = "Smoke-Customer-Password-2026";
const registration = await call("register", {
  name: "Customer Smoke OTP",
  email: "customer-smoke-otp@test.local",
  phone: "081234567890",
  birthDate: "1996-09-18",
  password: registrationPassword,
  passwordConfirmation: registrationPassword,
  consent: true,
});
assert.equal(registration.status, 201, JSON.stringify(registration.value));
assert.equal(registration.value.pending, true);
const verified = await call("otp-verify", {
  challengeId: registration.value.challengeId,
  code: latestOtpCode(),
  purpose: "REGISTRATION",
});
assert.equal(verified.status, 200, JSON.stringify(verified.value));
assert.equal(verified.value.user.role, "CUSTOMER");
assert.ok(verified.cookie);

// Manager stock write remains operational; Owner write remains forbidden.
const inventory = await call("inventory", undefined, manager);
assert.ok(inventory.value.products.length > 0);
const productId = inventory.value.products[0].id;
assert.equal(
  (
    await call(
      "stock",
      { productId, quantity: -1, reason: "Koreksi smoke" },
      manager,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "stock",
      { productId, quantity: 1, reason: "Pulihkan smoke" },
      manager,
    )
  ).status,
  200,
);
assert.equal(
  (
    await call(
      "stock",
      { productId, quantity: -1, reason: "Owner smoke" },
      owner,
    )
  ).status,
  403,
);

// Upload authorization and real image processing.
const png = await sharp({
  create: { width: 120, height: 90, channels: 3, background: "#b66330" },
})
  .png()
  .toBuffer();
const deniedForm = new FormData();
deniedForm.append("image", new Blob([png], { type: "image/png" }), "denied.png");
assert.equal(
  (
    await fetch(`${origin}/api/upload`, {
      method: "POST",
      headers: { cookie: customer },
      body: deniedForm,
    })
  ).status,
  403,
);
const uploadForm = new FormData();
uploadForm.append("image", new Blob([png], { type: "image/png" }), "menu.png");
const upload = await fetch(`${origin}/api/upload`, {
  method: "POST",
  headers: { cookie: manager },
  body: uploadForm,
});
assert.equal(upload.status, 201);
const uploadedImage = await upload.json();
const servedImage = await fetch(origin + uploadedImage.url);
assert.equal(servedImage.status, 200);
assert.equal(servedImage.headers.get("content-type"), "image/webp");

// QRIS-only final Customer checkout and dashboard payment gating.
const dashboardBaseline = (await call("dashboard", undefined, admin)).value;
const accountBaseline = (await call("account", undefined, customer)).value;
const reportBaseline = (await call("report", undefined, owner)).value;
const checkoutBody = {
  addressId: 1,
  method: "QRIS",
  items: [{ productId: 1, quantity: 2 }],
  idempotencyKey: crypto.randomUUID(),
};
const created = await call("checkout", checkoutBody, customer);
assert.equal(created.status, 201, JSON.stringify(created.value));
const orderId = created.value.id;
assert.equal(created.value.payment.method, "QRIS");
assert.equal(created.value.payment.status, "PENDING");

const replay = await call("checkout", checkoutBody, customer);
assert.equal(replay.status, 201);
assert.equal(replay.value.id, orderId);
assert.equal(replay.value.replayed, true);

const pendingDashboard = (await call("dashboard", undefined, admin)).value;
assert.equal(pendingDashboard.today.orders, dashboardBaseline.today.orders);
assert.equal(pendingDashboard.today.revenue, dashboardBaseline.today.revenue);

await markQrisPaid(created.value);
const paidDashboard = (await call("dashboard", undefined, admin)).value;
assert.equal(paidDashboard.today.orders, dashboardBaseline.today.orders + 1);
assert.equal(
  paidDashboard.today.revenue,
  dashboardBaseline.today.revenue + created.value.total,
);

// QRIS cannot be manually marked PAID by Admin.
assert.equal(
  (await call("payment", { orderId, status: "PAID" }, admin)).status,
  403,
);

// Cross-role order operations through proof-backed delivery completion.
assert.equal(
  (await call("status", { orderId, status: "CONFIRMED" }, admin)).status,
  200,
);
assert.equal(
  (await call("station-status", { orderId, status: "PREPARING" }, admin))
    .status,
  403,
);
for (const status of ["PREPARING", "READY"])
  assert.equal(
    (await call("station-status", { orderId, status }, kitchen)).status,
    200,
  );
assert.equal((await call("claim-delivery", { orderId }, driver)).status, 200);
for (const status of ["PICKED_UP", "ON_DELIVERY"])
  assert.equal(
    (await call("status", { orderId, status }, driver)).status,
    200,
  );
assert.equal(
  (await call("status", { orderId, status: "DELIVERED" }, driver)).status,
  409,
);

const proofForm = new FormData();
proofForm.append("orderId", String(orderId));
proofForm.append(
  "image",
  new Blob([png], { type: "image/png" }),
  "delivery-proof.png",
);
const proof = await fetch(`${origin}/api/delivery-proof`, {
  method: "POST",
  headers: { cookie: driver },
  body: proofForm,
});
assert.equal(proof.status, 201);

// Paid + delivered order must produce exactly one loyalty earn and report revenue.
const accountAfter = await call("account", undefined, customer);
const expectedEarn = Math.floor(
  (created.value.subtotal -
    (created.value.voucherDiscount || 0) -
    (created.value.loyaltyDiscount || 0)) /
    10000,
);
assert.equal(accountAfter.value.loyalty, accountBaseline.loyalty + expectedEarn);
const reportAfter = await call("report", undefined, owner);
assert.equal(reportAfter.status, 200);
assert.equal(
  reportAfter.value.paid.revenue,
  reportBaseline.paid.revenue + created.value.total,
);
assert.equal(
  (await call("dashboard", undefined, admin)).value.today.revenue,
  dashboardBaseline.today.revenue + created.value.total,
);
assert.ok(
  (await call("notifications", undefined, customer)).value.notifications.some(
    (item) => item.message.includes("telah diterima"),
  ),
);

console.log(
  `HTTP PASS: six-role RBAC, OTP, upload, QRIS webhook, kitchen, driver, delivery proof, dashboard/report, loyalty; order #${orderId}`,
);
