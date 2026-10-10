import * as store from "./store.mjs";
import { DomainError, required, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;

export async function adjustStock(user, input) {
  required(user, ["MANAGER"]);
  const productId = Number(input.productId);
  const quantity = Number(input.quantity);
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
      "SELECT id,name,stock_quantity,stock_unit FROM products WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      productId,
    );
    if (!product) throw new DomainError("Produk tidak ditemukan", 404);
    const balance = Number(product.stock_quantity) + quantity;
    if (balance < 0)
      throw new DomainError("Stok tidak boleh menjadi negatif", 409);
    const reservation = await tx.get(
      "SELECT COALESCE(SUM(quantity),0) quantity FROM stock_reservations WHERE product_id=? AND status='RESERVED' AND expires_at>CURRENT_TIMESTAMP",
      productId,
    );
    const reservedQuantity = Number(reservation?.quantity || 0);
    if (balance < reservedQuantity)
      throw new DomainError(
        "Stok tersedia tidak boleh lebih kecil dari reservasi aktif",
        409,
      );
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
    return {
      productId,
      quantity,
      balance,
      reserved_quantity: reservedQuantity,
      available_quantity: balance - reservedQuantity,
      stock_unit: product.stock_unit || "PCS",
    };
  });
}

export async function listStock(user) {
  requiredCapability(user, CAPABILITIES.STOCK_READ);
  const categoryNames =
    user.role === "ADMIN"
      ? ["Minuman", "Bahan Baku"]
      : user.role === "KITCHEN"
        ? ["Makanan"]
        : user.role === "MANAGER" || user.role === "OWNER"
          ? []
          : null;
  if (categoryNames === null) throw new DomainError("Akses ditolak", 403);
  const filter = categoryNames.length
    ? " WHERE c.name IN (" + categoryNames.map(() => "?").join(",") + ")"
    : "";
  const products = await store.all(
    `SELECT p.id,p.name,p.price,p.image_url,p.stock_quantity,p.prep_station,p.active,p.stock_unit,
      p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,p.low_stock_threshold,
      c.name category_name,s.name subcategory_name,COALESCE(s.sort_order,9999) subcategory_sort_order,
      COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0) reserved_quantity,
      p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0) available_quantity
     FROM products p JOIN categories c ON c.id=p.category_id
     LEFT JOIN product_subcategories s ON s.id=p.subcategory_id${filter}
     ORDER BY CASE c.name WHEN 'Makanan' THEN 1 WHEN 'Minuman' THEN 2 WHEN 'Bahan Baku' THEN 3 ELSE 4 END,
       COALESCE(s.sort_order,9999),s.name,p.name,p.id`,
    ...categoryNames,
  );
  for (const product of products) {
    product.stock_status =
      Number(product.available_quantity) <= 0
        ? "OUT"
        : Number(product.available_quantity) <=
            Number(product.low_stock_threshold)
          ? "LOW"
          : "OK";
  }
  const movements = ["MANAGER", "OWNER"].includes(user.role)
    ? await store.all(
        "SELECT m.id,m.product_id,p.name product_name,p.stock_unit,m.kind,m.quantity_delta,m.balance_after,m.reason,m.created_at,u.name actor_name,u.role actor_role,m.order_id FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.actor_id ORDER BY m.id DESC LIMIT 100",
      )
    : [];
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
