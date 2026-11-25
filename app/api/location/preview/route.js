import { currentUser } from "../../../../lib/auth.mjs";
import {
  DomainError,
  previewDelivery,
  required,
} from "../../../../lib/domain.mjs";
import { operationalSettings } from "../../../../lib/delivery.mjs";
import * as store from "../../../../lib/store.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../lib/request.mjs";
export const runtime = "nodejs";

const out = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request) {
  try {
    required(await currentUser(request), ["CUSTOMER"]);
    const { origin } = await operationalSettings(store);
    return out({ origin });
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    return out({ error: "Titik Warkost belum tersedia" }, 503);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    const body = await readJsonBody(request);
    return out(await previewDelivery(user, body));
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    return out({ error: "Pratinjau ongkir tidak tersedia" }, 503);
  }
}
