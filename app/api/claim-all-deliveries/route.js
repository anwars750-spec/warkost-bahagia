import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import { DomainError, MAX_ACTIVE_DELIVERIES, required } from "../../../lib/domain.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";

export const runtime = "nodejs";

const PICKUP_LABEL = "Ambil di Warkost";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

async function claimDeliveryOrdersOnly(user) {
  required(user, ["DRIVER"]);
  return store.transaction(async (tx, mysql) => {
    const driver = await tx.get(
      "SELECT id FROM users WHERE id=? AND role='DRIVER' AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!driver)
      throw new DomainError("Driver sedang offline atau tidak aktif", 409);

    const load = await tx.get(
      `SELECT COUNT(*) count,
              COALESCE(SUM(CASE WHEN o.status IN ('PICKED_UP','ON_DELIVERY') THEN 1 ELSE 0 END),0) away_count
         FROM deliveries d
         JOIN orders o ON o.id=d.order_id
        WHERE d.driver_id=? AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')`,
      user.id,
    );
    if (Number(load.away_count) > 0)
      throw new DomainError(
        "Selesaikan trip aktif sebelum mengambil grup pesanan baru",
        409,
      );

    const remaining = Math.max(
      0,
      MAX_ACTIVE_DELIVERIES - Number(load.count),
    );
    if (!remaining)
      return {
        claimedOrderIds: [],
        count: 0,
        remainingCapacity: 0,
        duplicate: true,
      };

    const candidates = await tx.all(
      `SELECT o.id,o.customer_id
         FROM orders o
         JOIN addresses a ON a.id=o.address_id
        WHERE o.status='READY'
          AND a.label<>?
          AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id=o.id)
        ORDER BY o.id
        LIMIT ${remaining}${mysql ? " FOR UPDATE" : ""}`,
      PICKUP_LABEL,
    );

    const claimedOrderIds = [];
    for (const order of candidates) {
      const delivery = await tx.run(
        "INSERT OR IGNORE INTO deliveries(order_id,driver_id,accepted_at) VALUES(?,?,CURRENT_TIMESTAMP)",
        order.id,
        user.id,
      );
      if (!delivery.changes) continue;

      const changed = await tx.run(
        "UPDATE orders SET status='ASSIGNED' WHERE id=? AND status='READY'",
        order.id,
      );
      if (!changed.changes)
        throw new DomainError(
          `Pesanan #${Number(order.id)} tidak lagi tersedia`,
          409,
        );

      claimedOrderIds.push(Number(order.id));
      await tx.run(
        "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,'READY','ASSIGNED')",
        order.id,
        user.id,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "DRIVER_SELF_CLAIMED",
        JSON.stringify({
          orderId: Number(order.id),
          driverId: user.id,
          batchClaim: true,
        }),
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        order.customer_id,
        `Driver telah mengambil pengantaran pesanan #${Number(order.id)}`,
      );
    }

    if (claimedOrderIds.length) {
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "DRIVER_BATCH_CLAIMED",
        JSON.stringify({
          driverId: user.id,
          orderIds: claimedOrderIds,
          count: claimedOrderIds.length,
          remainingCapacity: remaining - claimedOrderIds.length,
        }),
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        user.id,
        `Anda mengambil ${claimedOrderIds.length} pesanan untuk satu trip`,
      );
    }

    return {
      claimedOrderIds,
      count: claimedOrderIds.length,
      remainingCapacity: remaining - claimedOrderIds.length,
    };
  });
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    required(user, ["DRIVER"]);
    const body = await readJsonBody(request);
    const result = await claimDeliveryOrdersOnly(user);
    try {
      await publishActionRealtime("claim-all-deliveries", user, body, result);
    } catch (realtimeError) {
      console.error("Batch claim realtime publication failed", realtimeError);
    }
    return out(result);
  } catch (error) {
    if (error instanceof DomainError)
      return out({ error: error.message }, error.status);
    console.error("Claim all deliveries API error", error);
    return out({ error: "Terjadi kesalahan server" }, 500);
  }
}
