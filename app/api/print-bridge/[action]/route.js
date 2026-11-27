import { publishRealtimeEvent } from "../../../../lib/realtime.mjs";
import { currentUser } from "../../../../lib/auth.mjs";
import { assertSameOrigin, readJsonBody } from "../../../../lib/request.mjs";
import {
  enrollment,
  enroll,
  bridgeAction,
  revokeDevice,
  confirmPaper,
} from "../../../../lib/print-bridge.mjs";
export const runtime = "nodejs";
export async function POST(request, context) {
  try {
    // Only HTTPS native agents. X-Forwarded-Proto alone never establishes trust.
    if (new URL(request.url).protocol !== "https:")
      return Response.json({ error: "HTTPS required" }, { status: 403 });
    const { action } = await context.params;
    const body = await readJsonBody(request);
    let result;
    if (["enrollment", "revoke", "confirm"].includes(action)) {
      assertSameOrigin(request);
      const user = await currentUser(request);
      result = await {
        enrollment,
        revoke: revokeDevice,
        confirm: confirmPaper,
      }[action](user, body);
    } else if (action === "enroll") result = await enroll(body);
    else
      result = await bridgeAction(
        request.headers.get("authorization")?.replace(/^Bearer /, ""),
        action,
        body,
      );
    if (["begin", "ack", "confirm"].includes(action))
      publishRealtimeEvent("PRINTER_STATUS_CHANGED", {
        roles: ["ADMIN", "KITCHEN", "OWNER"],
        payload: {},
      });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: "Permintaan print bridge ditolak" },
      {
        status: [400, 401, 403, 404, 409, 413, 415].includes(error.status)
          ? error.status
          : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
