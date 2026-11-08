import { createHmac } from "node:crypto";
import { currentUser } from "./auth.mjs";
import { operationalSettings } from "./delivery.mjs";
import { DomainError } from "./domain.mjs";
import { assertSameOrigin, readJsonBody } from "./request.mjs";
import * as store from "./store.mjs";
import {
  externalGeoEnabled,
  geoUsage,
  GeoBrakeError,
  reserveGeoCredit,
  settleGeoCredit,
  trustedIpHash,
  unavailable,
} from "./geo-credit-brake.mjs";
import {
  normalizeLocationQuery,
  SEARCH_RESULT_LIMIT,
  validLocationQuery,
} from "./location-search.mjs";

const attemptPattern =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const out = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function suggestions(payload) {
  if (!Array.isArray(payload?.results)) throw unavailable();
  return payload.results.slice(0, SEARCH_RESULT_LIMIT).flatMap((item) => {
    if (
      item?.country_code !== "id" ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lon) ||
      Math.abs(item.lat) > 90 ||
      Math.abs(item.lon) > 180 ||
      typeof item.formatted !== "string" ||
      !item.formatted.trim() ||
      typeof item.place_id !== "string" ||
      !item.place_id
    )
      return [];
    return [
      {
        placeId: item.place_id.slice(0, 512),
        name: (typeof item.name === "string" && item.name.trim()
          ? item.name
          : item.formatted
        ).slice(0, 200),
        address: item.formatted.slice(0, 400),
        latitude: item.lat,
        longitude: item.lon,
      },
    ];
  });
}

export function createAutocompleteHandler({
  transport = null,
  env = process.env,
} = {}) {
  // Successful autocomplete responses only. Keep at most one minute of
  // account-scoped results in memory, never persist search text or addresses.
  const cache = new Map();
  return async (request) => {
    try {
      if (
        !request.headers.get("origin") ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new DomainError("Asal permintaan tidak diizinkan", 403);
      assertSameOrigin(request);
      const user = await currentUser(request);
      if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
      if (user.role !== "CUSTOMER") throw new DomainError("Akses ditolak", 403);

      // This branch prepares and tests the gateway. The real outbound
      // transport is deliberately unwired pending separate Owner approval.
      const key = env.GEOAPIFY_API_KEY?.trim();
      if (!externalGeoEnabled(env) || !key || typeof transport !== "function")
        throw unavailable();
      const ipHash = trustedIpHash(request, env);
      const body = await readJsonBody(request);
      const query = normalizeLocationQuery(body.query);
      if (
        !validLocationQuery(query) ||
        typeof body.attemptId !== "string" ||
        !attemptPattern.test(body.attemptId)
      )
        throw new DomainError(
          "Masukkan minimal tiga huruf atau angka dan mulai pencarian yang valid.",
          400,
        );

      const { origin } = await operationalSettings(store);
      const cacheKey = createHmac("sha256", env.SESSION_SECRET)
        .update(
          JSON.stringify([user.id, origin, query.toLocaleLowerCase("id-ID")]),
        )
        .digest("hex");
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now())
        return out({ suggestions: cached.result });
      const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      url.search = new URLSearchParams({
        text: query,
        format: "json",
        limit: String(SEARCH_RESULT_LIMIT),
        filter: "countrycode:id",
        bias: `proximity:${origin.longitude},${origin.latitude}`,
        apiKey: key,
      });
      if (request.signal.aborted) throw unavailable();
      const id = await reserveGeoCredit({
        endpoint: "autocomplete",
        userId: user.id,
        ipHash,
        attemptId: body.attemptId.toLowerCase(),
      });
      let result;
      try {
        const response = await transport(url, {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw unavailable();
        result = suggestions(await response.json());
      } catch {
        // Provider errors may contain the URL, API key or the search query.
        throw unavailable();
      } finally {
        await settleGeoCredit(id, result !== undefined);
      }
      const expiresAt = Date.now() + 60_000;
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { result, expiresAt });
      setTimeout(() => {
        if (cache.get(cacheKey)?.expiresAt === expiresAt)
          cache.delete(cacheKey);
      }, 60_000).unref();
      return out({ suggestions: result });
    } catch (error) {
      if (error instanceof GeoBrakeError)
        return out({ error: error.message, code: error.code }, error.status);
      if (error instanceof DomainError)
        return out({ error: error.message }, error.status);
      return out({ error: unavailable().message, code: "UNAVAILABLE" }, 503);
    }
  };
}

export async function getOwnerGeoUsage(request) {
  try {
    const user = await currentUser(request);
    if (!user) return out({ error: "Silakan masuk terlebih dahulu" }, 401);
    if (user.role !== "OWNER") return out({ error: "Akses ditolak" }, 403);
    return out({
      ...(await geoUsage()),
      externalEnabled: false,
      switchEnabled: externalGeoEnabled(),
      transportConfigured: false,
    });
  } catch {
    return out({ error: "Data penggunaan lokasi belum tersedia" }, 503);
  }
}
