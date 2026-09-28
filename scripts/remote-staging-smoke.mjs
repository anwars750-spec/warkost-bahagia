import assert from "node:assert/strict";
import { stagingOrigin } from "../lib/hostinger.mjs";

const origin = stagingOrigin(process.env.STAGING_ORIGIN);
const password = process.env.STAGING_UAT_PASSWORD;
if (!password || password.length < 14)
  throw Error("STAGING_UAT_PASSWORD harus minimal 14 karakter");

async function json(path, options = {}) {
  const response = await fetch(origin + path, {
    redirect: "error",
    ...options,
  });
  const value = await response.json();
  return { response, value };
}

const live = await json("/api/health/live");
assert.equal(live.response.status, 200);
assert.deepEqual(live.value, { status: "ok" });

const ready = await json("/api/health/ready");
assert.equal(ready.response.status, 200);
assert.equal(ready.value.status, "ready");
assert.deepEqual(ready.value.checks, {
  config: true,
  database: true,
  storage: true,
  backup: true,
});

const rejectedOrigin = await json("/api/login", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://invalid.example",
  },
  body: JSON.stringify({ email: "none@example.test", password: "invalid" }),
});
assert.equal(rejectedOrigin.response.status, 403);

async function login(email, role) {
  const result = await json("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  assert.equal(result.value.user.role, role);
  const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("wb_session="));
  return cookie;
}

async function authenticated(path, cookie) {
  return json(path, { headers: { cookie } });
}

const sessions = [
  [await login("customer@warkost.local", "CUSTOMER"), "CUSTOMER"],
  [await login("admin@warkost.local", "ADMIN"), "ADMIN"],
  [await login("kitchen@warkost.local", "KITCHEN"), "KITCHEN"],
  [await login("driver@warkost.local", "DRIVER"), "DRIVER"],
  [await login("owner@warkost.local", "OWNER"), "OWNER"],
];

for (const [cookie, role] of sessions) {
  const me = await authenticated("/api/me", cookie);
  assert.equal(me.response.status, 200);
  assert.equal(me.value.user.role, role);
  const orders = await authenticated("/api/orders", cookie);
  assert.equal(orders.response.status, 200);
  assert.ok(Array.isArray(orders.value.orders));
}

const [customer, admin, kitchen, driver, owner] = sessions.map(
  ([cookie]) => cookie,
);
assert.equal(
  (await authenticated("/api/dashboard", customer)).response.status,
  403,
);
assert.equal(
  (await authenticated("/api/dashboard", driver)).response.status,
  403,
);
assert.equal(
  (await authenticated("/api/inventory", customer)).response.status,
  403,
);
assert.equal((await authenticated("/api/stock", kitchen)).response.status, 403);
assert.equal(
  (await authenticated("/api/drivers", customer)).response.status,
  403,
);
assert.equal(
  (await authenticated("/api/dashboard", admin)).response.status,
  200,
);
assert.equal(
  (await authenticated("/api/inventory", admin)).response.status,
  200,
);
assert.equal(
  (await authenticated("/api/dashboard", owner)).response.status,
  200,
);
assert.equal((await authenticated("/api/audit", owner)).response.status, 200);

const menu = await json("/api/menu");
assert.equal(menu.response.status, 200);
assert.ok(menu.value.products.length > 0);

for (const [cookie] of sessions) {
  const logout = await json("/api/logout", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      origin,
    },
    body: "{}",
  });
  assert.equal(logout.response.status, 200);
}

console.log(
  "HOSTINGER STAGING PASS: HTTPS health, readiness, CSRF, login lima role, RBAC, catalog",
);
