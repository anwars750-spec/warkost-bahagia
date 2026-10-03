import { DomainError } from "./domain.mjs";

export const DEFAULT_DELIVERY_RULES = Object.freeze({
  freeKm: 5,
  feePerKm: 2500,
  maxKm: 15,
});

export function validateDeliveryRules(value = DEFAULT_DELIVERY_RULES) {
  const rules = {
    freeKm: Number(value.freeKm),
    feePerKm: Number(value.feePerKm),
    maxKm: Number(value.maxKm),
  };
  if (
    !Number.isFinite(rules.freeKm) ||
    rules.freeKm < 0 ||
    !Number.isFinite(rules.maxKm) ||
    rules.maxKm <= 0 ||
    rules.freeKm > rules.maxKm ||
    !Number.isSafeInteger(rules.feePerKm) ||
    rules.feePerKm < 0
  )
    throw new DomainError("Konfigurasi ongkir tidak valid");
  return rules;
}

export function normalizeWhatsApp(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith("62") || digits.length < 10 || digits.length > 15)
    throw new DomainError("Nomor WhatsApp tidak valid");
  return digits;
}

export function coordinate(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

export function haversineMeters(from, to) {
  const radians = (degree) => (degree * Math.PI) / 180;
  const earth = 6371000;
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function calculateDelivery(
  distanceMeters,
  rules = DEFAULT_DELIVERY_RULES,
) {
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0)
    throw new DomainError("Jarak pengantaran tidak valid");
  rules = validateDeliveryRules(rules);
  const distanceKm = distanceMeters / 1000;
  if (distanceKm > rules.maxKm)
    throw new DomainError(
      `Alamat berada di luar radius pengantaran ${rules.maxKm} km`,
      422,
    );
  const chargeableKm = Math.max(0, Math.ceil(distanceKm - rules.freeKm));
  return {
    distanceMeters,
    deliveryFee: chargeableKm * rules.feePerKm,
    freeDelivery: chargeableKm === 0,
  };
}

export function driverContactIsVisible(
  acceptedAt,
  deliveredAt,
  now = Date.now(),
) {
  if (!acceptedAt) return false;
  if (!deliveredAt) return true;
  const delivered = Date.parse(String(deliveredAt).replace(" ", "T") + "Z");
  return Number.isFinite(delivered) && now - delivered <= 2 * 60 * 60 * 1000;
}

export async function operationalSettings(tx) {
  const rows = await tx.all(
    "SELECT `key`,value FROM settings WHERE `key` IN ('business_whatsapp','business_latitude','business_longitude','delivery_free_km','delivery_fee_per_km','delivery_max_km','printer_simulation')",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  let latitude, longitude, rules;
  try {
    latitude = coordinate(
      values.business_latitude ?? -6.9217,
      -90,
      90,
      "Latitude Warkost",
    );
    longitude = coordinate(
      values.business_longitude ?? 106.9272,
      -180,
      180,
      "Longitude Warkost",
    );
    rules = validateDeliveryRules({
      freeKm: values.delivery_free_km ?? 5,
      feePerKm: values.delivery_fee_per_km ?? 2500,
      maxKm: values.delivery_max_km ?? 15,
    });
  } catch (error) {
    throw new DomainError(error.message, 503);
  }
  return {
    businessWhatsApp: normalizeWhatsApp(
      values.business_whatsapp || "081546407856",
    ),
    origin: { latitude, longitude },
    rules,
    printerSimulation: values.printer_simulation !== "false",
  };
}
