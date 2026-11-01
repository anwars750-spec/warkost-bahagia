import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import { DomainError } from "../../../lib/domain.mjs";
import { listNotifications } from "../../../lib/notifications.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function errorResponse(error) {
  if (error instanceof DomainError) return out({ error: error.message }, error.status);
  console.error("Notifications API error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

async function isHiddenUnpaidQrisOrderNotification(notification) {
  const match = String(notification.message || "").match(
    /^Pesanan baru #(\d+) menunggu konfirmasi$/,
  );
  if (!match) return false;
  const payment = await store.get(
    "SELECT method,status FROM payments WHERE order_id=?",
    Number(match[1]),
  );
  return payment?.method === "QRIS" && payment.status !== "PAID";
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    const result = await listNotifications(user);
    if (user?.role !== "ADMIN") return out(result);

    const notifications = [];
    let hiddenUnread = 0;
    for (const notification of result.notifications) {
      if (await isHiddenUnpaidQrisOrderNotification(notification)) {
        if (!notification.read_at) hiddenUnread += 1;
        continue;
      }
      notifications.push(notification);
    }

    return out({
      notifications,
      unread: Math.max(0, Number(result.unread || 0) - hiddenUnread),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
