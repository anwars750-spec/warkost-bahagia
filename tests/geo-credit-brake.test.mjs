import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "warkost-geo-"));
Object.assign(process.env, {
  DATABASE_URL: "",
  DATABASE_PATH: join(directory, "geo.db"),
  SESSION_SECRET: "geo-brake-test-secret-not-a-production-secret",
  GEOLOCATION_EXTERNAL_ENABLED: "false",
  GEOAPIFY_API_KEY: "",
  PAYMENT_PROVIDER_MODE: "simulation",
  QRIS_AUTO_CONFIRM_WORKER_DISABLED: "true",
});
const store = await import("../lib/store.mjs");
const { issueSession } = await import("../lib/auth.mjs");
const { createAutocompleteHandler, getOwnerGeoUsage } =
  await import("../lib/geo-location-api.mjs");
const { reserveGeoCredit, geoUsage, trustedIpHash } =
  await import("../lib/geo-credit-brake.mjs");
const { createOrder, previewDelivery } = await import("../lib/domain.mjs");
const { db } = await import("../lib/db.mjs");
const user = { id: 1, role: "CUSTOMER" };
const owner = { id: 2, role: "OWNER" };
const cookies = {};
for (const person of [user, owner]) {
  await store.run(
    "INSERT INTO users(id,name,email,password_hash,role,active) VALUES(?,?,?,?,?,1)",
    person.id,
    "Fixture",
    `${person.id}@geo.test`,
    "x",
    person.role,
  );
  cookies[person.id] = await issueSession(person);
}
test.after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});
test.beforeEach(() => store.run("DELETE FROM geo_credit_reservations"));

const enabled = {
  ...process.env,
  GEOLOCATION_EXTERNAL_ENABLED: "true",
  GEOLOCATION_TRUST_PROXY: "true",
  GEOAPIFY_API_KEY: "fake-provider-key",
};
const attempt = randomUUID();
const body = { query: "  Jalan   Merdeka ", attemptId: attempt };
function request({ account = user, headers = {}, json = body } = {}) {
  const req = new Request("https://warkost.test/api/location/autocomplete", {
    method: "POST",
    headers: {
      origin: "https://warkost.test",
      host: "warkost.test",
      "content-type": "application/json",
      "x-warkost-client-ip": "192.0.2.10",
      ...headers,
    },
    body: JSON.stringify(json),
  });
  req.cookies = {
    get: () => (account ? { value: cookies[account.id] } : undefined),
  };
  return req;
}
const empty = () => Response.json({ results: [] });
const mock = (transport = empty, env = enabled) =>
  createAutocompleteHandler({ env, transport });
async function age(milliseconds = 2000) {
  await store.run(
    "UPDATE geo_credit_reservations SET finished_ms=finished_ms-? WHERE finished_ms IS NOT NULL",
    milliseconds,
  );
}
async function seed(total, ageMs = 2000) {
  const now = Number(
    (await store.get("SELECT CAST(unixepoch('subsec')*1000 AS INTEGER) now_ms"))
      .now_ms,
  );
  // Batch fixture representing historical modeled usage, outside the recent window.
  await store.run(
    "INSERT INTO geo_credit_reservations(endpoint,credits,user_id,ip_hash,attempt_id,reserved_ms,finished_ms,outcome) VALUES(?,?,?,?,?,?,?,'SUCCESS')",
    "autocomplete",
    total,
    99,
    "fixture",
    attempt,
    now - ageMs,
    now - ageMs,
  );
}

test("default OFF, missing key, missing trusted ingress and unwired production handler make zero calls", async () => {
  const transport = () => assert.fail("transport must not be called");
  for (const env of [
    process.env,
    { ...enabled, GEOAPIFY_API_KEY: "" },
    { ...enabled, GEOLOCATION_TRUST_PROXY: "false" },
  ])
    assert.equal((await mock(transport, env)(request())).status, 503);
  assert.equal(
    (await createAutocompleteHandler({ env: enabled })(request())).status,
    503,
  );
  assert.equal(
    (
      await mock(transport)(
        request({
          headers: { "x-warkost-client-ip": "192.0.2.1, 192.0.2.10" },
        }),
      )
    ).status,
    503,
  );
  assert.equal((await geoUsage()).estimatedCredits.reserved, 0);
});

test("auth, Origin and normalized query validation stop requests before reservation", async () => {
  const api = mock(() => assert.fail("transport must not be called"));
  for (const [options, status] of [
    [{ account: null }, 401],
    [{ account: owner }, 403],
    [{ headers: { origin: "" } }, 403],
    [{ headers: { origin: "https://other.test" } }, 403],
    [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
    [{ json: { ...body, query: "a . -2" } }, 400],
    [{ json: { ...body, query: "a".repeat(121) } }, 400],
    [{ json: { ...body, attemptId: "spoof" } }, 400],
  ])
    assert.equal((await api(request(options))).status, status);
  assert.equal((await geoUsage()).estimatedCredits.reserved, 0);
});

test("one durable reservation precedes fixed destination, country/bias and three-result limit", async () => {
  const result = await mock(async (url, options) => {
    assert.equal((await geoUsage()).pending, 1);
    assert.equal(
      url.origin + url.pathname,
      "https://api.geoapify.com/v1/geocode/autocomplete",
    );
    assert.equal(url.searchParams.get("limit"), "3");
    assert.equal(url.searchParams.get("filter"), "countrycode:id");
    assert.match(url.searchParams.get("bias"), /^proximity:/);
    assert.equal(url.searchParams.get("text"), "Jalan Merdeka");
    assert.equal(url.searchParams.get("apiKey"), "fake-provider-key");
    assert.equal(options.redirect, "error");
    return Response.json({
      results: Array.from({ length: 12 }, (_, i) => ({
        country_code: "id",
        formatted: "Contoh",
        lat: -6.92,
        lon: 106.92,
        place_id: `place-${i}`,
        secret: "not-forwarded",
      })),
    });
  })(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.suggestions.length, 3);
  assert.doesNotMatch(JSON.stringify(data), /fake-provider-key|not-forwarded/);
  assert.equal((await geoUsage()).estimatedCredits.completed, 1);
  assert.ok((await geoUsage()).lastSuccessMs);
});

test("repeated normalized query uses short-lived account/outlet scoped cache without reserving again", async () => {
  let calls = 0;
  const api = mock(() => {
    calls++;
    return empty();
  });
  assert.equal((await api(request())).status, 200);
  assert.equal(
    (
      await api(
        request({
          json: { ...body, query: "jalan  merdeka", attemptId: randomUUID() },
        }),
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  await store.run(
    "INSERT OR REPLACE INTO settings(`key`,value) VALUES('business_latitude','-6.92')",
  );
  assert.equal((await api(request())).status, 200);
  assert.equal(calls, 2);
  await store.run("DELETE FROM settings WHERE `key`='business_latitude'");
  assert.equal((await geoUsage()).estimatedCredits.reserved, 2);
});

test("provider 429/5xx, timeout and malformed response count as separate reservations", async () => {
  for (const transport of [
    () => new Response(null, { status: 429 }),
    () => new Response(null, { status: 502 }),
    () => {
      throw new DOMException("fake-provider-key Jalan Merdeka", "TimeoutError");
    },
    () => Response.json({ malformed: true }),
  ]) {
    const response = await mock(transport)(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(
      await response.text(),
      /fake-provider-key|Jalan Merdeka/,
    );
    await age();
  }
  const usage = await geoUsage();
  assert.equal(usage.estimatedCredits.reserved, 4);
  assert.equal(usage.estimatedCredits.completed, 4);
  assert.ok(usage.lastFailureMs);
});

test("five-request attempt, fresh UUIDs and changing IP cannot bypass per-customer ceiling", async () => {
  const api = mock();
  for (let index = 0; index < 5; index++) {
    assert.equal(
      (await api(request({ json: { ...body, query: `Jalan sesi ${index}` } })))
        .status,
      200,
    );
    await age();
  }
  let response = await api(request());
  assert.equal((await response.json()).code, "ATTEMPT_LIMIT");
  for (let index = 0; index < 5; index++) {
    assert.equal(
      (
        await api(
          request({
            json: {
              ...body,
              query: `Jalan kedua ${index}`,
              attemptId: randomUUID(),
            },
            headers: { "x-warkost-client-ip": `192.0.2.${index + 20}` },
          }),
        )
      ).status,
      200,
    );
    await age();
  }
  response = await api(request({ json: { ...body, attemptId: randomUUID() } }));
  assert.equal((await response.json()).code, "SEARCH_LIMIT");
});

test("IPv4-mapped IP normalizes and a shared ingress IP is limited across accounts", async () => {
  const ipHash = trustedIpHash(request(), enabled);
  assert.equal(
    ipHash,
    trustedIpHash(
      request({ headers: { "x-warkost-client-ip": "::ffff:192.0.2.10" } }),
      enabled,
    ),
  );
  for (let i = 0; i < 30; i++) {
    const id = await reserveGeoCredit({
      endpoint: "autocomplete",
      userId: 100 + i,
      ipHash,
      attemptId: randomUUID(),
    });
    await store.run(
      "UPDATE geo_credit_reservations SET finished_ms=reserved_ms-2000 WHERE id=?",
      id,
    );
  }
  assert.equal((await (await mock()(request())).json()).code, "SEARCH_LIMIT");
});

test("shared rolling second admits at most two across 100 simultaneous requests", async () => {
  let calls = 0;
  let refusals = 0;
  const provider = Promise.withResolvers();
  const limited = Promise.withResolvers();
  const api = mock(async () => {
    calls++;
    await provider.promise;
    return empty();
  });
  const pending = Array.from({ length: 100 }, async (_, index) => {
    const response = await api(
      request({ json: { ...body, query: `Jalan ${index}` } }),
    );
    if (response.status === 429 && ++refusals === 98) limited.resolve();
    return response;
  });
  let timer;
  try {
    await Promise.race([
      limited.promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "98 requests should be rate limited before the provider releases",
              ),
            ),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    provider.resolve();
  }
  const responses = await Promise.all(pending);
  assert.equal(calls, 2);
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    2,
  );
  assert.equal((await geoUsage()).estimatedCredits.reserved, 2);
});

test("50/80/100 thresholds, unknown endpoints and rolling window fail closed", async () => {
  await seed(1199);
  assert.deepEqual((await geoUsage()).alerts, [50]);
  const responses = await Promise.all(
    Array.from({ length: 100 }, () => mock()(request())),
  );
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    1,
  );
  assert.equal((await geoUsage()).estimatedCredits.reserved, 1200);
  assert.deepEqual((await geoUsage()).alerts, [50, 80]);
  const api = mock(() => assert.fail("hard stop"));
  assert.equal((await (await api(request())).json()).code, "CONSERVATION");
  await seed(300);
  assert.equal((await (await api(request())).json()).code, "DAILY_LIMIT");
  assert.deepEqual((await geoUsage()).alerts, [50, 80, 100]);
  for (const endpoint of [
    "tiles",
    "routing",
    "reverse",
    "geocode",
    "__proto__",
  ])
    await assert.rejects(reserveGeoCredit({ endpoint }), {
      code: "UNAVAILABLE",
    });
  await age(86_400_000);
  assert.equal((await mock()(request())).status, 200);
});

test("pending reservations survive long delays and unavailable accounting stops transport", async () => {
  const api = mock(() => assert.fail("transport must not be called"));
  for (let i = 0; i < 2; i++) {
    await reserveGeoCredit({
      endpoint: "autocomplete",
      userId: 99,
      ipHash: "fixture",
      attemptId: attempt,
    });
  }
  await store.run("UPDATE geo_credit_reservations SET reserved_ms=1");
  assert.equal((await (await api(request())).json()).code, "RATE_LIMIT");
  assert.equal((await geoUsage()).estimatedCredits.reserved, 2);
  await store.run("DELETE FROM geo_credit_lock WHERE id=1");
  try {
    assert.equal((await api(request())).status, 503);
  } finally {
    await store.run("INSERT INTO geo_credit_lock(id) VALUES(1)");
  }
});

test("read-only Owner metrics exclude request details, quote stays local and validates coordinates", async () => {
  await seed(1500);
  assert.equal((await getOwnerGeoUsage(request())).status, 403);
  const result = await (
    await getOwnerGeoUsage(request({ account: owner }))
  ).json();
  assert.deepEqual(result.alerts, [50, 80, 100]);
  assert.equal(result.externalEnabled, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /fake-provider-key|ip_hash|attempt_id/,
  );
  const preview = await previewDelivery(user, {
    latitude: -6.9217,
    longitude: 106.9272,
  });
  assert.equal(preview.available, true);
  assert.equal(preview.delivery_fee, 0);
  await assert.rejects(
    previewDelivery(user, { latitude: null, longitude: 0 }),
    /Pin lokasi/,
  );
  await assert.rejects(
    previewDelivery(owner, { latitude: 0, longitude: 0 }),
    /Akses/,
  );
});

test("exhausted geolocation quota leaves catalog, pickup and persisted paid orders operational", async () => {
  const { listCatalog } = await import("../lib/catalog.mjs");
  const { processTrustedProviderEvent } = await import("../lib/payments.mjs");
  const { LOCAL_QRIS_PROVIDER } = await import("../lib/payment-provider.mjs");
  await store.run("INSERT INTO categories(id,name) VALUES(71,'Geo fixture')");
  await store.run(
    "INSERT INTO products(id,category_id,name,price,stock_quantity,prep_station) VALUES(71,71,'Geo fixture',18000,10,'KITCHEN')",
  );
  await store.run(
    "INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(71,1,'Ambil di Warkost','Warkost Bahagia · Ambil di tempat',-6.9217,106.9272)",
  );
  const placeOrder = (fulfillmentType) =>
    createOrder(
      user,
      {
        fulfillmentType,
        addressId: fulfillmentType === "PICKUP" ? 71 : undefined,
        method: "QRIS",
        items: [{ productId: 71, quantity: 1 }],
      },
      { nowMs: Date.parse("2026-11-08T12:00:00+07:00") },
    );
  const paid = await placeOrder("PICKUP");
  await processTrustedProviderEvent({
    trusted: true,
    provider: LOCAL_QRIS_PROVIDER,
    eventId: "geo-fixture-paid",
    transactionReference: paid.payment.transaction_reference,
    providerReference: paid.payment.provider_reference,
    status: "PAID",
    payloadHash: "fixture",
  });
  await seed(1500);
  assert.equal((await (await mock()(request())).json()).code, "DAILY_LIMIT");
  assert.ok((await listCatalog(false)).products.some(({ id }) => id === 71));
  assert.ok((await placeOrder("PICKUP")).id);
  assert.equal(
    (await store.get("SELECT status FROM payments WHERE order_id=?", paid.id))
      .status,
    "PAID",
  );
  const before = await store.get("SELECT COUNT(*) n FROM orders");
  await assert.rejects(placeOrder("DELIVERY"), /Alamat/);
  assert.equal((await store.get("SELECT COUNT(*) n FROM orders")).n, before.n);
  assert.equal(
    (await store.get("SELECT COUNT(*) n FROM payments")).n,
    before.n,
  );
});
