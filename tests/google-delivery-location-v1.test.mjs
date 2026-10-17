import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "google-delivery-v1-")),
  "test.db",
);
process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-server-key";
for (const service of ["PLACES_AUTOCOMPLETE", "PLACE_DETAILS", "GEOCODING", "ROUTES"]) {
  process.env[`GOOGLE_MAPS_${service}_DAILY_CAP`] = "50";
  process.env[`GOOGLE_MAPS_${service}_MONTHLY_CAP`] = "50";
}

const maps = await import("../lib/google-maps.mjs");
const domain = await import("../lib/domain.mjs");
const account = await import("../lib/account.mjs");
const store = await import("../lib/store.mjs");
const { db } = await import("../lib/db.mjs");
const customer = { id: 10, role: "CUSTOMER" };
const origin = { latitude: -6.9217, longitude: 106.9272 };
const json = (body, ok = true) => ({ ok, json: async () => body });

db().exec(`
  INSERT INTO users(id,name,email,password_hash,role) VALUES(10,'Customer Maps','maps@test.local','x','CUSTOMER');
  INSERT INTO categories(id,name) VALUES(1,'Makanan');
  INSERT INTO products(id,category_id,name,price,prep_station) VALUES(1,1,'Menu Maps',20000,'KITCHEN');
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude) VALUES(1,10,'Rumah','Jalan Maps Nomor 10',-6.92,106.93);
  INSERT INTO settings(key,value) VALUES
    ('business_latitude','-6.9217'),('business_longitude','106.9272'),
    ('delivery_fee_per_km','2500');
`);

test("usage guard memblokir daily cap sebelum request upstream", async () => {
  process.env.GOOGLE_MAPS_ROUTES_DAILY_CAP = "1";
  process.env.GOOGLE_MAPS_ROUTES_MONTHLY_CAP = "50";
  let calls = 0;
  const options = {
    now: new Date("2026-01-10T00:00:00Z"),
    fetchImpl: async () => {
      calls += 1;
      return json({ routes: [{ distanceMeters: 4200, duration: "900s" }] });
    },
  };
  assert.equal((await maps.computeRoadRoute(origin, { latitude: -6.95, longitude: 106.95 }, options)).distanceMeters, 4200);
  await assert.rejects(
    maps.computeRoadRoute(origin, { latitude: -6.96, longitude: 106.96 }, options),
    /batas penggunaan/,
  );
  assert.equal(calls, 1);
});

test("usage guard memblokir monthly cap dan counter service tetap independen", async () => {
  process.env.GOOGLE_MAPS_ROUTES_DAILY_CAP = "50";
  process.env.GOOGLE_MAPS_ROUTES_MONTHLY_CAP = "1";
  assert.equal(await maps.reserveGoogleApiCall(maps.GOOGLE_SERVICES.ROUTES, new Date("2026-02-01T00:00:00Z")), true);
  assert.equal(await maps.reserveGoogleApiCall(maps.GOOGLE_SERVICES.ROUTES, new Date("2026-02-02T00:00:00Z")), false);
  assert.equal(await maps.reserveGoogleApiCall(maps.GOOGLE_SERVICES.GEOCODING, new Date("2026-02-02T00:00:00Z")), true);
});

test("reservasi paralel tidak dapat melompati hard cap", async () => {
  process.env.GOOGLE_MAPS_PLACE_DETAILS_DAILY_CAP = "3";
  process.env.GOOGLE_MAPS_PLACE_DETAILS_MONTHLY_CAP = "3";
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      maps.reserveGoogleApiCall(maps.GOOGLE_SERVICES.PLACE_DETAILS, new Date("2026-03-10T00:00:00Z")),
    ),
  );
  assert.equal(results.filter(Boolean).length, 3);
});

test("Autocomplete dinormalisasi dan Details hanya menerima place dari sesi/owner yang benar", async () => {
  const token = "123e4567-e89b-42d3-a456-426614174000";
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("places:autocomplete"))
      return json({ suggestions: [{ placePrediction: {
        placeId: "place-1",
        text: { text: "Pasar Pelita, Sukabumi" },
        structuredFormat: { mainText: { text: "Pasar Pelita" }, secondaryText: { text: "Sukabumi" } },
      } }] });
    return json({ id: "place-1", formattedAddress: "Pasar Pelita, Sukabumi", location: { latitude: -6.92, longitude: 106.93 } });
  };
  const result = await maps.autocompletePlaces(customer, { query: "Pasar", sessionToken: token }, origin, { fetchImpl, now: new Date("2026-04-10") });
  assert.deepEqual(result.suggestions[0], { placeId: "place-1", name: "Pasar Pelita", address: "Sukabumi" });
  const autocompleteBody = JSON.parse(requests[0].init.body);
  assert.deepEqual(autocompleteBody.locationBias.circle.center, origin);
  await assert.rejects(
    maps.getPlaceDetails({ id: 11, role: "CUSTOMER" }, { placeId: "place-1", sessionToken: token }, { fetchImpl }),
    /Pilih lokasi/,
  );
  await assert.rejects(
    maps.getPlaceDetails(customer, { placeId: "place-lain", sessionToken: token }, { fetchImpl }),
    /Pilih lokasi/,
  );
  assert.equal(requests.length, 1);
  const place = await maps.getPlaceDetails(customer, { placeId: "place-1", sessionToken: token }, { fetchImpl, now: new Date("2026-04-10") });
  assert.equal(place.formattedAddress, "Pasar Pelita, Sukabumi");
  assert.equal(requests[1].init.headers["X-Goog-FieldMask"], "id,formattedAddress,location");
});

test("reverse geocode mempertahankan koordinat GPS dan validasi range", async () => {
  const result = await maps.reverseGeocode(-6.92, 106.93, {
    now: new Date("2026-05-10"),
    fetchImpl: async () => json({ status: "OK", results: [{ place_id: "geo-1", formatted_address: "Jalan Uji, Sukabumi" }] }),
  });
  assert.equal(result.latitude, -6.92);
  assert.equal(result.longitude, 106.93);
  assert.equal(result.formattedAddress, "Jalan Uji, Sukabumi");
  await assert.rejects(maps.reverseGeocode(91, 0), /Latitude tidak valid/);
});

test("Routes distance menjadi sumber quote untuk free, paid, dan max radius", async () => {
  process.env.GOOGLE_MAPS_ROUTES_DAILY_CAP = "50";
  process.env.GOOGLE_MAPS_ROUTES_MONTHLY_CAP = "50";
  const distances = [2999, 3001, 10001];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers["X-Goog-FieldMask"], "routes.distanceMeters,routes.duration");
    return json({ routes: [{ distanceMeters: distances.shift(), duration: "600s" }] });
  };
  try {
    assert.equal((await domain.quoteCoordinateDelivery(customer, { latitude: -6.91, longitude: 106.93 })).delivery_fee, 0);
    assert.equal((await domain.quoteCoordinateDelivery(customer, { latitude: -6.91, longitude: 106.93 })).delivery_fee, 2500);
    const outside = await domain.quoteCoordinateDelivery(customer, { latitude: -6.91, longitude: 106.93 });
    assert.equal(outside.available, false);
    assert.equal(outside.delivery_fee, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing key fail closed dan tidak menghasilkan quote palsu", async () => {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const environment = process.env.NODE_ENV;
  delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      domain.quoteCoordinateDelivery(customer, { latitude: -6.91, longitude: 106.93 }),
      /belum dikonfigurasi/,
    );
  } finally {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = key;
    if (environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = environment;
  }
});

test("create order menghitung ulang Routes di server tanpa transaksi counter bersarang", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    json({ routes: [{ distanceMeters: 4001, duration: "720s" }] });
  try {
    const created = await domain.createOrder(customer, {
      addressId: 1,
      method: "CASH",
      distanceMeters: 1,
      deliveryFee: 0,
      items: [{ productId: 1, quantity: 1 }],
    });
    assert.equal(created.distanceMeters, 4001);
    assert.equal(created.deliveryFee, 5000);
    assert.equal(created.total, 25000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("alamat baru wajib koordinat valid dan Driver navigasi memakai koordinat", async () => {
  await assert.rejects(
    account.addAddress(customer, { label: "Manual", detail: "Alamat manual tanpa titik" }),
    /Pilih titik lokasi/,
  );
  const saved = await account.addAddress(customer, {
    label: "Rumah",
    detail: "Jalan Dengan Titik Nomor 10",
    latitude: -6.92,
    longitude: 106.93,
  });
  assert.ok(saved.id > 0);
  const driver = fs.readFileSync(path.resolve("app/DriverControlCenter.js"), "utf8");
  assert.match(driver, /destination=.*order\.latitude.*order\.longitude/s);
});

test("kontrak endpoint sesuai Customer picker terpisah dan tidak meminta field Places Pro", () => {
  const provider = fs.readFileSync(path.resolve("lib/google-maps.mjs"), "utf8");
  const autocomplete = fs.readFileSync(path.resolve("app/api/location/autocomplete/route.js"), "utf8");
  const quote = fs.readFileSync(path.resolve("app/api/delivery/quote/route.js"), "utf8");
  assert.match(autocomplete, /export async function GET/);
  assert.match(provider, /id,formattedAddress,location/);
  assert.doesNotMatch(provider, /X-Goog-FieldMask[^\n]*displayName/);
  assert.match(quote, /quoteCoordinateDelivery/);
});
