import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;

export async function adjustStock(user, input) {
  requiredCapability(user, CAPABILITIES.STOCK_WRITE);
  const productId = input.productId;
  const quantity = input.quantity;
  const reason = String(input.reason || "").trim();
  if (
    !positiveId(productId) ||
    !Number.isSafeInteger(quantity) ||
    quantity === 0 ||
    Math.abs(quantity) > 100000 ||
    reason.length < 3 ||
    reason.length > 240
  )
    throw new DomainError("Penyesuaian stok tidak valid");
  return store.transaction(async (tx, mysql) => {
    const product = await tx.get(
      "SELECT id,name,stock_quantity FROM products WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      productId,
    );
    if (!product) throw new DomainError("Produk tidak ditemukan", 404);
    const balance = Number(product.stock_quantity) + quantity;
    if (balance < 0)
      throw new DomainError("Stok tidak boleh menjadi negatif", 409);
    await tx.run(
      "UPDATE products SET stock_quantity=? WHERE id=?",
      balance,
      productId,
    );
    const kind = quantity > 0 ? "STOCK_IN" : "ADJUSTMENT";
    await tx.run(
      "INSERT INTO stock_movements(product_id,actor_id,kind,quantity_delta,balance_after,reason) VALUES(?,?,?,?,?,?)",
      productId,
      user.id,
      kind,
      quantity,
      balance,
      reason,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "STOCK_ADJUSTED",
      JSON.stringify({ productId, quantity, balance, reason }),
    );
    return { productId, quantity, balance };
  });
}

export async function listStock(user) {
  requiredCapability(user, CAPABILITIES.STOCK_READ);
  const products = await store.all(
    "SELECT p.id,p.name,p.stock_quantity,p.prep_station,p.active,c.name category_name FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.name,p.id",
  );
  const movements = await store.all(
    "SELECT m.id,m.product_id,p.name product_name,m.kind,m.quantity_delta,m.balance_after,m.reason,m.created_at,u.name actor_name,u.role actor_role,m.order_id FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.actor_id ORDER BY m.id DESC LIMIT 100",
  );
  return { products, movements };
}

export async function listAuditLogs(user, before = null) {
  requiredCapability(user, CAPABILITIES.AUDIT_READ);
  if (before !== null && !positiveId(before))
    throw new DomainError("Cursor audit tidak valid");
  const rows = await store.all(
    "SELECT a.id,a.action,a.details,a.created_at,u.name actor_name,u.role actor_role FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE 1=1" +
      (before === null ? "" : " AND a.id<?") +
      " ORDER BY a.id DESC LIMIT 51",
    ...(before === null ? [] : [before]),
  );
  const hasMore = rows.length > 50;
  const logs = rows.slice(0, 50);
  return { logs, nextCursor: hasMore ? logs.at(-1).id : null };
}
