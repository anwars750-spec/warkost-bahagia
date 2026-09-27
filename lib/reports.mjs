import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

export async function dailyReport(user, date) {
  required(user, ["ADMIN"]);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new DomainError("Tanggal laporan tidak valid");
  const start = new Date(date + "T00:00:00+07:00");
  const from = start.toISOString().slice(0, 19).replace("T", " ");
  const until = new Date(start.getTime() + 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const orders = await store.get(
    "SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN total ELSE 0 END),0) order_value FROM orders WHERE created_at>=? AND created_at<?",
    from, until,
  );
  const paid = await store.get(
    "SELECT COUNT(*) count,COALESCE(SUM(o.total),0) revenue FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?",
    from, until,
  );
  const statuses = await store.all(
    "SELECT status,COUNT(*) count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",
    from, until,
  );
  const products = await store.all(
    "SELECT i.product_id,i.name,SUM(i.quantity) quantity,SUM(i.price*i.quantity) value FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.created_at>=? AND o.created_at<? AND o.status!='CANCELLED' GROUP BY i.product_id,i.name ORDER BY quantity DESC,i.product_id ASC LIMIT 10",
    from, until,
  );
  return { date, orders, paid, statuses, products };
}
