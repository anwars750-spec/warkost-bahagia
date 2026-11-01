import * as store from "./store.mjs";

export const PICKUP_LABEL = "Ambil di Warkost";
export const PICKUP_DETAIL = "Warkost Bahagia · Ambil di tempat";

const pickupError = (message, status = 422) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export async function ensurePickupAddress(userId, source = store) {
  const normalizedUserId = Number(userId);
  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId < 1)
    throw pickupError("Customer pickup tidak valid", 401);

  const rows = await source.all(
    "SELECT `key`,value FROM settings WHERE `key` IN ('business_latitude','business_longitude')",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const latitude = Number(values.business_latitude ?? -6.9217);
  const longitude = Number(values.business_longitude ?? 106.9272);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw pickupError("Lokasi Warkost belum valid");

  let address = await source.get(
    "SELECT id,label,detail,latitude,longitude FROM addresses WHERE user_id=? AND label=? AND active=1 ORDER BY id DESC LIMIT 1",
    normalizedUserId,
    PICKUP_LABEL,
  );

  if (address) {
    await source.run(
      "UPDATE addresses SET detail=?,latitude=?,longitude=?,is_default=0 WHERE id=? AND user_id=?",
      PICKUP_DETAIL,
      latitude,
      longitude,
      address.id,
      normalizedUserId,
    );
  } else {
    const result = await source.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude,is_default,active) VALUES(?,?,?,?,?,0,1)",
      normalizedUserId,
      PICKUP_LABEL,
      PICKUP_DETAIL,
      latitude,
      longitude,
    );
    address = { id: result.lastInsertRowid };
  }

  return {
    id: Number(address.id),
    label: PICKUP_LABEL,
    detail: PICKUP_DETAIL,
    latitude,
    longitude,
  };
}
