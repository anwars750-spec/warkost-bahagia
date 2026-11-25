import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { listOwnerCustomers } from "../../../lib/customers.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request) {
  try {
    const user = await currentUser(request);
    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore === null ? null : Number(rawBefore);
    if (rawBefore !== null && (!Number.isSafeInteger(before) || before < 1))
      throw new DomainError("Cursor customer tidak valid");

    return out(
      await listOwnerCustomers(user, {
        query: request.nextUrl.searchParams.get("q") || "",
        status: request.nextUrl.searchParams.get("status") || "all",
        before,
      }),
    );
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status || 400);
    console.error("Owner customers API error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
