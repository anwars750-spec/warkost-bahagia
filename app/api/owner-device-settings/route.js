import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import {
  getOwnerDeviceSettings,
  saveOwnerDeviceSettings,
} from "../../../lib/owner-device-settings.mjs";
import { publishRealtimeEvent } from "../../../lib/realtime.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function fail(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  return out(
    { error: error?.message || "Pengaturan device tidak dapat diproses" },
    Number.isSafeInteger(status) && status >= 400 && status < 600 ? status : 500,
  );
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    return out(await getOwnerDeviceSettings(user));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    const result = await saveOwnerDeviceSettings(user, body);
    publishRealtimeEvent("PRINTER_STATUS_CHANGED", {
      roles: ["ADMIN", "KITCHEN", "OWNER"],
      payload: {},
      actionable: true,
    });
    return out(result);
  } catch (error) {
    return fail(error);
  }
}
