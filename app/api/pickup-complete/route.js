import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import { DomainError, required } from "../../../lib/domain.mjs";
import { awardOrderPoints } from "../../../lib/loyalty.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const PICKUP_LABEL = "Ambil di Warkost";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : NaN;
}

function errorResponse(error) {
  if (error instanceof DomainError) return out({ error: error.message }, error.status);
  console.error("Pickup complete API error", error);
  return out({ error: "Gagal menyelesaikan pesanan pickup" }, 500);
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["ADMIN", "OWNER"]);
    const body = await readJsonBody(request);
    const orderId = integer(body.orderId);
    if (!Number.isSafeInteger(orderId)) throw new DomainError("Order tidak valid");

    const result = await store.transaction(async (tx, mysql) => {
      const order = await tx.get(
        `SELECT o.*,a.label address_label,p.status payment_status,p.method payment_method
           FROM orders o
           JOIN addresses a ON a.id=o.address_id
           JOIN payments p ON p.order_id=o.id
          WHERE o.id=?${mysql ? " FOR UPDATE" : ""}`,
        orderId,
      );
      if (!order) throw new DomainError("Order tidak ditemukan", 404);
      if (order.address_label !== PICKUP_LABEL)
        throw new DomainError("Order ini bukan pesanan ambil di tempat", 409);
      if (order.payment_method === "QRIS" && order.payment_status !== "PAID")
        throw new DomainError("Pembayaran QRIS belum terverifikasi", 409);
      if (order.status === "DELIVERED")
        return { id: orderId, status: "DELIVERED", duplicate: true };
      if (order.status !== "READY")
        throw new DomainError("Pesanan belum siap diambil", 409);

      const changed = await tx.run(
        "UPDATE orders SET status='DELIVERED' WHERE id=? AND status='READY'",
        orderId,
      );
      if (!changed.changes)
        throw new DomainError("Status pesanan sudah berubah", 409);

      await tx.run(
        "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,'READY','DELIVERED')",
        orderId,
        user.id,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "PICKUP_ORDER_COMPLETED",
        JSON.stringify({ orderId, completedBy: user.id, actorRole: user.role }),
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        order.customer_id,
        `Pesanan #${orderId} sudah diambil di Warkost`,
      );
      await awardOrderPoints(tx, mysql, { ...order, status: "DELIVERED" });

      return { id: orderId, status: "DELIVERED", pickup: true };
    });

    return out(result);
  } catch (error) {
    return errorResponse(error);
  }
}
