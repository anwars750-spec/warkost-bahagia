import * as store from "./store.mjs";
import crypto from "node:crypto";
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function required(user, roles) {
  if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
  if (!roles.includes(user.role)) throw new DomainError("Akses ditolak", 403);
}
const transitions = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["ON_DELIVERY"],
  ON_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
export async function createOrder(user, input) {
  required(user, ["CUSTOMER"]);
  const items = input.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 40)
    throw new DomainError("Keranjang tidak valid");
  const ids = new Set();
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99 ||
      ids.has(item.productId)
    )
      throw new DomainError("Item tidak valid");
    ids.add(item.productId);
  }
  if (!["CASH", "BANK_TRANSFER"].includes(input.method))
    throw new DomainError("Metode pembayaran tidak valid");
  const key = input.idempotencyKey ?? null;
  if (key !== null &&
      (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)))
    throw new DomainError("Kunci checkout tidak valid");
  const fingerprint = key === null ? null : crypto.createHash("sha256")
    .update(JSON.stringify({
      addressId: input.addressId,
      method: input.method,
      items: [...items].sort((a, b) => a.productId - b.productId),
    }))
    .digest("hex");
  return store.transaction(async (tx, mysql) => {
    const account = await tx.get(
      "SELECT id FROM users WHERE id=? AND role='CUSTOMER' AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!account) throw new DomainError("Akun customer tidak aktif", 403);
    if (key) {
      const previous = await tx.get(
        "SELECT id,total,checkout_fingerprint FROM orders WHERE customer_id=? AND checkout_key=?" +
          (mysql ? " FOR UPDATE" : ""),
        user.id,
        key,
      );
      if (previous) {
        if (previous.checkout_fingerprint !== fingerprint)
          throw new DomainError("Kunci checkout dipakai untuk keranjang berbeda", 409);
        return { id: previous.id, total: previous.total, replayed: true };
      }
    }
    const address = await tx.get(
      "SELECT id FROM addresses WHERE id=? AND user_id=? AND active=1",
      input.addressId,
      user.id,
    );
    if (!address) throw new DomainError("Alamat tidak valid");
    let total = 0;
    const lines = [];
    for (const item of items) {
      const p = await tx.get(
        "SELECT id,name,price FROM products WHERE id=? AND active=1 AND category_id IN (SELECT id FROM categories WHERE active=1)" +
          (mysql ? " FOR UPDATE" : ""),
        item.productId,
      );
      if (!p) throw new DomainError("Produk tidak tersedia");
      total += p.price * item.quantity;
      lines.push({ ...p, quantity: item.quantity });
    }
    if (!Number.isSafeInteger(total))
      throw new DomainError("Total tidak valid");
    const { lastInsertRowid: id } = await tx.run(
      "INSERT INTO orders(customer_id,address_id,total,checkout_key,checkout_fingerprint) VALUES(?,?,?,?,?)",
      user.id,
      address.id,
      total,
      key,
      fingerprint,
    );
    for (const line of lines)
      await tx.run(
        "INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)",
        id,
        line.id,
        line.name,
        line.price,
        line.quantity,
      );
    await tx.run(
      "INSERT INTO payments(order_id,method) VALUES(?,?)",
      id,
      input.method,
    );
    await tx.run(
      "INSERT INTO order_events(order_id,actor_id,next_status) VALUES(?,?,?)",
      id,
      user.id,
      "PENDING",
    );
    for (const admin of await tx.all(
      "SELECT id FROM users WHERE role='ADMIN' AND active=1",
    ))
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        admin.id,
        `Pesanan baru #${id} menunggu konfirmasi`,
      );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      user.id,
      `Pesanan #${id} berhasil dibuat`,
    );
    return { id: Number(id), total };
  });
}
export async function changeStatus(user, orderId, status, driverId) {
  required(user, ["ADMIN", "DRIVER"]);
  if (!Number.isSafeInteger(orderId) || !transitions[status])
    throw new DomainError("Status atau order tidak valid");
  return store.transaction(async (tx, mysql) => {
    const order = await tx.get(
      "SELECT * FROM orders WHERE id=?" + (mysql ? " FOR UPDATE" : ""),
      orderId,
    );
    if (!order) throw new DomainError("Order tidak ditemukan", 404);
    if (!transitions[order.status].includes(status))
      throw new DomainError("Perubahan status tidak diizinkan");
    if (status === "CANCELLED") {
      const payment = await tx.get(
        "SELECT status FROM payments WHERE order_id=?" +
          (mysql ? " FOR UPDATE" : ""),
        orderId,
      );
      if (payment?.status === "PAID")
        throw new DomainError("Order lunas tidak dapat dibatalkan tanpa proses refund");
      await tx.run(
        "UPDATE payments SET status='CANCELLED' WHERE order_id=? AND status!='CANCELLED'",
        orderId,
      );
    }
    if (user.role === "ADMIN") {
      if (
        !["CONFIRMED", "PREPARING", "READY", "ASSIGNED", "CANCELLED"].includes(
          status,
        )
      )
        throw new DomainError("Aksi admin tidak diizinkan", 403);
      if (status === "ASSIGNED") {
        const driver = await tx.get(
          "SELECT id FROM users WHERE id=? AND role='DRIVER' AND active=1" +
            (mysql ? " FOR UPDATE" : ""),
          driverId,
        );
        if (!driver) throw new DomainError("Driver tidak valid");
        await tx.run(
          "INSERT INTO deliveries(order_id,driver_id) VALUES(?,?)",
          orderId,
          driverId,
        );
      }
    } else {
      const delivery = await tx.get(
        "SELECT * FROM deliveries WHERE order_id=? AND driver_id=?",
        orderId,
        user.id,
      );
      if (
        !delivery ||
        !["PICKED_UP", "ON_DELIVERY", "DELIVERED"].includes(status)
      )
        throw new DomainError("Aksi driver tidak diizinkan", 403);
      if (status === "PICKED_UP" && !delivery.accepted_at)
        throw new DomainError("Terima tugas terlebih dahulu");
      if (status === "DELIVERED")
        await tx.run(
          "UPDATE deliveries SET delivered_at=CURRENT_TIMESTAMP WHERE id=?",
          delivery.id,
        );
    }
    await tx.run("UPDATE orders SET status=? WHERE id=?", status, orderId);
    await tx.run(
      "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,?,?)",
      orderId,
      user.id,
      order.status,
      status,
    );
    const messages = {
      CONFIRMED: "dikonfirmasi",
      PREPARING: "sedang disiapkan",
      READY: "siap diantar",
      ASSIGNED: "driver ditugaskan",
      PICKED_UP: "diambil driver",
      ON_DELIVERY: "sedang diantar",
      DELIVERED: "telah diterima",
      CANCELLED: "dibatalkan",
    };
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      order.customer_id,
      `Pesanan #${orderId} ${messages[status]}`,
    );
    if (status === "ASSIGNED")
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        driverId,
        `Pengantaran pesanan #${orderId} ditugaskan kepada Anda`,
      );
    if (status === "DELIVERED") {
      const rate = Number(
        (
          await tx.get(
            "SELECT value FROM settings WHERE `key`=?",
            "rupiah_per_point",
          )
        )?.value || 10000,
      );
      if (!Number.isSafeInteger(rate) || rate < 1000 || rate > 100000)
        throw new DomainError("Pengaturan poin tidak valid");
      const points = Math.floor(order.total / rate);
      await tx.run(
        "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
        order.customer_id,
      );
      if (points > 0) {
        const account = await tx.get(
          "SELECT balance FROM loyalty_accounts WHERE user_id=?" +
            (mysql ? " FOR UPDATE" : ""),
          order.customer_id,
        );
        const inserted = await tx.run(
          "INSERT OR IGNORE INTO loyalty_transactions(user_id,order_id,kind,amount,balance_after) VALUES(?,?,'EARN',?,?)",
          order.customer_id,
          orderId,
          points,
          account.balance + points,
        );
        if (inserted.changes)
          await tx.run(
            "UPDATE loyalty_accounts SET balance=balance+? WHERE user_id=?",
            points,
            order.customer_id,
          );
      }
    }
    return { id: orderId, status };
  });
}
export async function acceptDelivery(user, orderId) {
  required(user, ["DRIVER"]);
  return store.transaction(async (tx) => {
    const result = await tx.run(
      "UPDATE deliveries SET accepted_at=CURRENT_TIMESTAMP WHERE order_id=? AND driver_id=? AND accepted_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='ASSIGNED')",
      orderId,
      user.id,
      orderId,
    );
    if (!result.changes)
      throw new DomainError("Tugas tidak tersedia atau sudah diterima");
    const order = await tx.get(
      "SELECT customer_id FROM orders WHERE id=?",
      orderId,
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      order.customer_id,
      `Driver menerima pengantaran pesanan #${orderId}`,
    );
    return { accepted: true };
  });
}
