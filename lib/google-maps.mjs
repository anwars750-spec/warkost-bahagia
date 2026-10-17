import * as store from "./store.mjs";
import { coordinate, haversineMeters } from "./delivery.mjs";

export const GOOGLE_SERVICES = Object.freeze({
  AUTOCOMPLETE: "PLACES_AUTOCOMPLETE",
  PLACE_DETAILS: "PLACE_DETAILS",
  GEOCODING: "GEOCODING",
  ROUTES: "ROUTES",
});
const ENV_NAME = Object.freeze({
  [GOOGLE_SERVICES.AUTOCOMPLETE]: "PLACES_AUTOCOMPLETE",
  [GOOGLE_SERVICES.PLACE_DETAILS]: "PLACE_DETAILS",
  [GOOGLE_SERVICES.GEOCODING]: "GEOCODING",
  [GOOGLE_SERVICES.ROUTES]: "ROUTES",
});
const DEFAULT_DAILY_CAP = 200;
const DEFAULT_MONTHLY_CAP = 6000;

export class GoogleMapsError extends Error {
  constructor(message, status = 503, code = "GOOGLE_MAPS_UNAVAILABLE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function capFor(service, periodType) {
  const serviceName = ENV_NAME[service];
  if (!serviceName) throw new GoogleMapsError("Layanan lokasi tidak valid", 500);
  const periodName = periodType === "DAY" ? "DAILY" : "MONTHLY";
  const fallback = periodType === "DAY" ? DEFAULT_DAILY_CAP : DEFAULT_MONTHLY_CAP;
  const value = Number(process.env[`GOOGLE_MAPS_${serviceName}_${periodName}_CAP`] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new GoogleMapsError("Konfigurasi batas Google Maps tidak valid", 500);
  return value;
}
function usagePeriods(now = new Date()) {
  const iso = new Date(now).toISOString();
  return [
    { type: "DAY", key: iso.slice(0, 10) },
    { type: "MONTH", key: iso.slice(0, 7) },
  ];
}

export async function reserveGoogleApiCall(service, now = new Date()) {
  const periods = usagePeriods(now).map((period) => ({
    ...period,
    cap: capFor(service, period.type),
  }));
  return store.transaction(async (tx, mysql) => {
    for (const period of periods)
      await tx.run(
        "INSERT OR IGNORE INTO google_api_usage(service,period_type,period_key,attempted_calls,successful_calls) VALUES(?,?,?,0,0)",
        service,
        period.type,
        period.key,
      );
    const rows = [];
    for (const period of periods)
      rows.push(await tx.get(
        `SELECT attempted_calls FROM google_api_usage WHERE service=? AND period_type=? AND period_key=?${mysql ? " FOR UPDATE" : ""}`,
        service,
        period.type,
        period.key,
      ));
    if (rows.some((row, index) => Number(row.attempted_calls) >= periods[index].cap))
      return false;
    for (const period of periods)
      await tx.run(
        "UPDATE google_api_usage SET attempted_calls=attempted_calls+1,updated_at=CURRENT_TIMESTAMP WHERE service=? AND period_type=? AND period_key=?",
        service,
        period.type,
        period.key,
      );
    return true;
  });
}

async function recordGoogleApiSuccess(service, now = new Date()) {
  await store.transaction(async (tx, mysql) => {
    for (const period of usagePeriods(now)) {
      const row = await tx.get(
        `SELECT attempted_calls,successful_calls FROM google_api_usage WHERE service=? AND period_type=? AND period_key=?${mysql ? " FOR UPDATE" : ""}`,
        service,
        period.type,
        period.key,
      );
      if (row && Number(row.successful_calls) < Number(row.attempted_calls))
        await tx.run(
          "UPDATE google_api_usage SET successful_calls=successful_calls+1,updated_at=CURRENT_TIMESTAMP WHERE service=? AND period_type=? AND period_key=?",
          service,
          period.type,
          period.key,
        );
    }
  });
}

async function googleRequest(service, url, init = {}, options = {}) {
  const key = String(process.env.GOOGLE_MAPS_SERVER_API_KEY || "").trim();
  if (!key)
    throw new GoogleMapsError("Layanan lokasi belum dikonfigurasi. Silakan coba lagi nanti.");
  const now = options.now || new Date();
  if (!(await reserveGoogleApiCall(service, now)))
    throw new GoogleMapsError(
      "Layanan lokasi sementara mencapai batas penggunaan. Silakan coba lagi nanti.",
      503,
      "GOOGLE_MAPS_CAP_REACHED",
    );
  const response = await (options.fetchImpl || fetch)(url, {
    ...init,
    headers: { ...(init.headers || {}), "X-Goog-Api-Key": key },
  });
  if (!response.ok)
    throw new GoogleMapsError("Layanan lokasi Google sedang tidak tersedia.");
  await recordGoogleApiSuccess(service, now);
  return response.json();
}

const locationSessions = new Map();
const SESSION_TTL_MS = 10 * 60_000;
function validatedSessionToken(value) {
  const token = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))
    throw new GoogleMapsError("Sesi pencarian lokasi tidak valid", 400);
  return token;
}
function ownerKey(user) {
  return `${user.role}:${user.id}`;
}
function pruneSessions(now = Date.now()) {
  for (const [token, session] of locationSessions)
    if (now - session.updatedAt > SESSION_TTL_MS) locationSessions.delete(token);
}

export async function autocompletePlaces(user, input, origin, options = {}) {
  const query = String(input.query || "").trim();
  if (query.length < 3 || query.length > 160)
    throw new GoogleMapsError("Masukkan minimal 3 karakter lokasi", 400);
  const sessionToken = validatedSessionToken(input.sessionToken);
  const center = {
    latitude: coordinate(origin.latitude, -90, 90, "Latitude Warkost"),
    longitude: coordinate(origin.longitude, -180, 180, "Longitude Warkost"),
  };
  const data = await googleRequest(
    GOOGLE_SERVICES.AUTOCOMPLETE,
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: query,
        sessionToken,
        languageCode: "id",
        includedRegionCodes: ["id"],
        locationBias: { circle: { center, radius: 50000 } },
      }),
    },
    options,
  );
  pruneSessions();
  const suggestions = (data.suggestions || [])
    .map((item) => item.placePrediction)
    .filter((item) => item?.placeId)
    .slice(0, 8)
    .map((item) => ({
      placeId: item.placeId,
      name: item.structuredFormat?.mainText?.text || item.text?.text || "Lokasi",
      address: item.structuredFormat?.secondaryText?.text || item.text?.text || "",
    }));
  locationSessions.set(sessionToken, {
    owner: ownerKey(user),
    places: new Map(suggestions.map((item) => [item.placeId, item])),
    updatedAt: Date.now(),
  });
  return { suggestions };
}

export async function getPlaceDetails(user, input, options = {}) {
  const sessionToken = validatedSessionToken(input.sessionToken);
  const placeId = String(input.placeId || "").trim();
  pruneSessions();
  const session = locationSessions.get(sessionToken);
  const suggestion = session?.places.get(placeId);
  if (!session || session.owner !== ownerKey(user) || !suggestion)
    throw new GoogleMapsError("Pilih lokasi dari hasil pencarian", 422);
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "id");
  url.searchParams.set("sessionToken", sessionToken);
  const data = await googleRequest(
    GOOGLE_SERVICES.PLACE_DETAILS,
    url,
    { headers: { "X-Goog-FieldMask": "id,formattedAddress,location" } },
    options,
  );
  locationSessions.delete(sessionToken);
  if (!data.location || !data.formattedAddress)
    throw new GoogleMapsError("Detail lokasi tidak lengkap");
  return {
    placeId: data.id || placeId,
    name: suggestion.name,
    formattedAddress: data.formattedAddress,
    latitude: coordinate(data.location.latitude, -90, 90, "Latitude"),
    longitude: coordinate(data.location.longitude, -180, 180, "Longitude"),
  };
}

export async function reverseGeocode(latitude, longitude, options = {}) {
  latitude = coordinate(latitude, -90, 90, "Latitude");
  longitude = coordinate(longitude, -180, 180, "Longitude");
  const key = String(process.env.GOOGLE_MAPS_SERVER_API_KEY || "").trim();
  if (!key)
    throw new GoogleMapsError("Layanan lokasi belum dikonfigurasi. Silakan coba lagi nanti.");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("language", "id");
  url.searchParams.set("region", "id");
  url.searchParams.set("key", key);
  const data = await googleRequest(GOOGLE_SERVICES.GEOCODING, url, {}, options);
  const result = data.results?.[0];
  if (data.status !== "OK" || !result?.formatted_address)
    throw new GoogleMapsError("Alamat untuk titik ini tidak ditemukan", 422);
  return {
    placeId: result.place_id || "",
    name: result.formatted_address.split(",")[0] || "Lokasi saat ini",
    formattedAddress: result.formatted_address,
    latitude,
    longitude,
  };
}

export async function computeRoadRoute(origin, destination, options = {}) {
  const normalizedOrigin = {
    latitude: coordinate(origin.latitude, -90, 90, "Latitude Warkost"),
    longitude: coordinate(origin.longitude, -180, 180, "Longitude Warkost"),
  };
  const normalizedDestination = {
    latitude: coordinate(destination.latitude, -90, 90, "Latitude"),
    longitude: coordinate(destination.longitude, -180, 180, "Longitude"),
  };
  // Explicit test-runtime provider: production never falls back to straight-line pricing.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_TEST_CONTEXT &&
    !process.env.GOOGLE_MAPS_SERVER_API_KEY
  )
    return {
      distanceMeters: haversineMeters(normalizedOrigin, normalizedDestination),
      durationSeconds: 0,
    };
  const data = await googleRequest(
    GOOGLE_SERVICES.ROUTES,
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: normalizedOrigin } },
        destination: { location: { latLng: normalizedDestination } },
        travelMode: "DRIVE",
        languageCode: "id-ID",
        units: "METRIC",
      }),
    },
    options,
  );
  const route = data.routes?.[0];
  const distanceMeters = Number(route?.distanceMeters);
  const durationSeconds = Number.parseFloat(String(route?.duration || "0s"));
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0)
    throw new GoogleMapsError("Rute pengantaran tidak ditemukan", 422);
  return {
    distanceMeters,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : 0,
  };
}
