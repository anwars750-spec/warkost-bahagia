import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth.mjs";
import * as store from "../../../lib/store.mjs";
import {
  customerDriverWaitNotice,
  deliveryAvailability,
  DomainError,
  listDriverOrders,
  required,
} from "../../../lib/domain.mjs";
import { expirePendingPayments } from "../../../lib/payments.mjs";
import { driverContactIsVisible } from "../../../lib/delivery.mjs";

export const runtime = "nodejs";

const out = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const integer = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : NaN;

function errorResponse(error) {
  if (error instanceof DomainError) return out({ error: error.message }, error.status);
  console.error("Orders API error", error);
  return out({ error: "Terjadi kesalahan server" }, 500);
}

export async function GET(request) {
  try {
    const user = await currentUser(request);
    required(user, ["CUSTOMER", "ADMIN", "DRIVER", "KITCHEN", "OWNER"]);
    await expirePendingPayments();

    const rawBefore = request.nextUrl.searchParams.get("before");
    const before = rawBefore === null ? null : integer(rawBefore);
    if (rawBefore !== null && !Number.isSafeInteger(before))
      throw new DomainError("Cursor pesanan tidak valid");

    const bound = before === null ? "" : " AND o.id<?";
    let orders;

    if (user.role === "CUSTOMER") {
      orders = await store.all(
        "SELECT o.*,a.label address_label,a.detail address,p.method,p.status payment_status,p.amount payment_amount,p.provider_reference,p.transaction_reference,p.qr_payload,p.payment_url,p.expires_at payment_expires_at,d.driver_id,d.accepted_at,d.delivered_at,du.phone driver_phone FROM orders o JOIN addresses a ON a.id=o.address_id JOIN payments p ON p.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN users du ON du.id=d.driver_id WHERE o.customer_id=?" +
          bound +
          " ORDER BY o.id DESC LIMIT 26",
        user.id,
        ...(before === null ? [] : [before]),
      );
    } else if (user.role === "DRIVER") {
      orders = await listDriverOrders(user, before);
    } else if (user.role === "KITCHEN") {
      orders = await store.all(
        "SELECT o.*,u.name customer_name,s.status kitchen_status FROM orders o JOIN order_stations s ON s.order_id=o.id AND s.station='KITCHEN' JOIN users u ON u.id=o.customer_id WHERE o.status IN ('CONFIRMED','PREPARING','READY')" +
          bound +
          " ORDER BY o.id DESC LIMIT 26",
        ...(before === null ? [] : [before]),
      );
    } else {
      orders = await store.all(
        "SELECT o.*,u.name customer_name,a.detail address,p.method,p.status payment_status,p.amount payment_amount,d.driver_id,s.id settlement_id,s.status settlement_status,s.expected_amount,s.cash_amount,s.evidence_reference,s.submitted_at,s.admin_verifier_id,s.verified_at,s.discrepancy_amount,(SELECT status FROM order_stations WHERE order_id=o.id AND station='KITCHEN') kitchen_status,(SELECT status FROM order_stations WHERE order_id=o.id AND station='CASHIER') cashier_status FROM orders o JOIN users u ON u.id=o.customer_id JOIN addresses a ON a.id=o.address_id JOIN payments p ON p.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN cod_settlements s ON s.order_id=o.id WHERE (p.method!='QRIS' OR p.status='PAID')" +
          bound +
          " ORDER BY o.id DESC LIMIT 26",
        ...(before === null ? [] : [before]),
      );
    }

    const hasMore = orders.length > 25;
    const page = orders.slice(0, 25);

    if (user.role === "CUSTOMER") {
      const availability = await deliveryAvailability();
      const businessWhatsApp =
        (
          await store.get(
            "SELECT value FROM settings WHERE `key`='business_whatsapp'",
          )
        )?.value || "6281546407856";

      for (const order of page) {
        order.driver_delay_notice = customerDriverWaitNotice(order, availability);
        order.admin_whatsapp = businessWhatsApp;
        order.driver_whatsapp = driverContactIsVisible(
          order.accepted_at,
          order.delivered_at,
        )
          ? order.driver_phone
          : null;
        delete order.driver_phone;
      }
    }

    return out({
      orders: page,
      nextCursor: hasMore ? page.at(-1).id : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
