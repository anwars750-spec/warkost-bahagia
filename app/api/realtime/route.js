import { NextResponse } from "next/server";
import {
  requireRealtimeUser,
  subscribeRealtime,
} from "../../../lib/realtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const encode = (value) => encoder.encode(value);

export async function GET(request) {
  let user;
  try {
    user = await requireRealtimeUser(request);
  } catch {
    return NextResponse.json(
      { error: "Sesi realtime tidak valid" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event) => {
        if (closed) return;
        try {
          const {
            audience: _serverAudience,
            soundAudience: _serverSoundAudience,
            ...publicEvent
          } = event;
          controller.enqueue(
            encode(`id: ${event.id}\ndata: ${JSON.stringify(publicEvent)}\n\n`),
          );
        } catch {
          close("write-failed");
        }
      };
      const close = (reason = "closed") => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.enqueue(
            encode(
              `data: ${JSON.stringify({ type: "REALTIME_CLOSED", reason })}\n\n`,
            ),
          );
        } catch {}
        try {
          controller.close();
        } catch {}
      };
      const onAbort = () => close("client-disconnected");
      const unsubscribe = subscribeRealtime(user, send, close);
      const heartbeat = setInterval(async () => {
        try {
          const activeUser = await requireRealtimeUser(request).catch(() => null);
          if (!activeUser || Number(activeUser.id) !== Number(user.id)) {
            close("session-ended");
            return;
          }
          controller.enqueue(encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          close("session-check-failed");
        }
      }, 15000);
      request.signal.addEventListener("abort", onAbort, { once: true });
      controller.enqueue(encode("retry: 3000\n"));
      send({
        id: `connected-${Date.now().toString(36)}`,
        type: "REALTIME_CONNECTED",
        timestamp: new Date().toISOString(),
        priority: "NORMAL",
        actionable: false,
        replayed: false,
        payload: { role: user.role },
      });
      cleanup = close;
    },
    cancel() {
      cleanup("stream-cancelled");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
