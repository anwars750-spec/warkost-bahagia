import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import { DomainError, required } from "../../../lib/domain.mjs";
import { assertSameOrigin } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const PICKUP_LABEL = "Ambil di Warkost";
const PICKUP_DETAIL = "Warkost Bahagia · Ambil di tempat";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

async function pickupLocation() {
  const rows = await store.all(
    "SELECT `key`,value FROM settings WHERE `key` IN ('business_latitude','business_longitude')",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const latitude = Number(values.business_latitude ?? -6.9217);
  const longitude = Number(values.business_longitude ?? 106.9272);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw new DomainError("Lokasi Warkost belum valid", 422);
  return { latitude, longitude };
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["CUSTOMER"]);

    const { latitude, longitude } = await pickupLocation();
    let address = await store.get(
      "SELECT id,label,detail,latitude,longitude FROM addresses WHERE user_id=? AND label=? AND active=1 ORDER BY id DESC LIMIT 1",
      user.id,
      PICKUP_LABEL,
    );

    if (address) {
      await store.run(
        "UPDATE addresses SET detail=?,latitude=?,longitude=?,is_default=0 WHERE id=? AND user_id=?",
        PICKUP_DETAIL,
        latitude,
        longitude,
        address.id,
        user.id,
      );
    } else {
      const result = await store.run(
        "INSERT INTO addresses(user_id,label,detail,latitude,longitude,is_default,active) VALUES(?,?,?,?,?,0,1)",
        user.id,
        PICKUP_LABEL,
        PICKUP_DETAIL,
        latitude,
        longitude,
      );
      address = { id: result.lastInsertRowid };
    }

    return out({
      id: Number(address.id),
      label: PICKUP_LABEL,
      detail: PICKUP_DETAIL,
      latitude,
      longitude,
    });
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Pickup address API error", error);
    return out({ error: "Gagal menyiapkan opsi ambil di tempat" }, 500);
  }
}
