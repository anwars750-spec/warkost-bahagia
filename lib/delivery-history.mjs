import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

const HISTORY_ROLES = ["MANAGER", "OWNER"];

function normalizeCursor(value) {
  if (value == null || value === "") return null;
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 1)
    throw new DomainError("Cursor riwayat delivery tidak valid");
  return cursor;
}

export async function listDeliveryHistory(user, { before = null } = {}) {
  required(user, HISTORY_ROLES);
  const cursor = normalizeCursor(before);
  const bound = cursor === null ? "" : " AND o.id<?";
  const rows = await store.all(
    `SELECT o.id order_id,o.created_at,o.status,o.fulfillment_type,o.total,
            customer.name customer_name,driver.name driver_name,
            a.detail address,d.accepted_at,d.delivered_at,
            p.method,p.status payment_status,p.amount payment_amount,
            dp.media_id proof_media_id,dp.created_at proof_created_at
       FROM orders o
       JOIN users customer ON customer.id=o.customer_id
       JOIN addresses a ON a.id=o.address_id
       JOIN payments p ON p.order_id=o.id
       JOIN deliveries d ON d.order_id=o.id
       JOIN users driver ON driver.id=d.driver_id
       LEFT JOIN delivery_proofs dp ON dp.order_id=o.id
      WHERE o.fulfillment_type='DELIVERY'
        AND o.status='DELIVERED'${bound}
      ORDER BY o.id DESC
      LIMIT 26`,
    ...(cursor === null ? [] : [cursor]),
  );

  const hasMore = rows.length > 25;
  const page = rows.slice(0, 25);
  const items = [];
  for (const row of page) {
    const events = await store.all(
      `SELECT e.previous_status,e.next_status,e.created_at,
              u.name actor_name,u.role actor_role
         FROM order_events e
         LEFT JOIN users u ON u.id=e.actor_id
        WHERE e.order_id=?
        ORDER BY e.id`,
      row.order_id,
    );
    items.push({
      ...row,
      proof_image_url: row.proof_media_id
        ? `/api/media/${row.proof_media_id}`
        : null,
      events,
    });
  }

  return {
    deliveries: items,
    nextCursor: hasMore ? page.at(-1)?.order_id || null : null,
  };
}
