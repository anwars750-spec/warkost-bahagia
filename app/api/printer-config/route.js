import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { getPrinterRuntimeConfig } from "../../../lib/owner-device-settings.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await currentUser(request);
    const data = await getPrinterRuntimeConfig(user);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500);
    return NextResponse.json(
      { error: error?.message || "Konfigurasi printer tidak dapat dimuat" },
      { status: Number.isSafeInteger(status) && status >= 400 && status < 600 ? status : 500 },
    );
  }
}
