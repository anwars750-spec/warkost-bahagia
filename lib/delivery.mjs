import { DomainError } from "./domain.mjs";

export const DEFAULT_DELIVERY_RULES = Object.freeze({
  freeKm: 5,
  feePerKm: 2500,
  maxKm: 15,
});

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
  const latitude = Number(values.business_latitude ?? -6.9217);
  const longitude = Number(values.business_longitude ?? 106.9272);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw new DomainError("Titik lokasi Warkost belum dikonfigurasi", 503);
  return {
    businessWhatsApp: normalizeWhatsApp(
      values.business_whatsapp || "081546407856",
    ),
    origin: { latitude, longitude },
    rules: {
      freeKm: Number(values.delivery_free_km || 5),
      feePerKm: Number(values.delivery_fee_per_km || 2500),
      maxKm: Number(values.delivery_max_km || 15),
    },
    printerSimulation: values.printer_simulation !== "false",
  };
}
