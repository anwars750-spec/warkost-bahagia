import * as store from "./store.mjs";
import crypto from "node:crypto";
import {
  calculateDelivery,
  haversineMeters,
  operationalSettings,
} from "./delivery.mjs";
import { enqueueOrderPrintJobs } from "./print-queue.mjs";
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
async function commitOrderStock(tx, mysql, orderId, actorId) {
  const lines = await tx.all(
    "SELECT product_id,SUM(quantity) quantity FROM order_items WHERE order_id=? GROUP BY product_id ORDER BY product_id",
    orderId,
  );
  for (const line of lines) {
    const quantity = Number(line.quantity);
    const product = await tx.get(
      "SELECT id,name,stock_quantity FROM products WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      line.product_id,
    );
    if (!product || product.stock_quantity < quantity)
      throw new DomainError(
        `Stok ${product?.name || "produk"} tidak mencukupi`,
        409,
      );
    const balance = Number(product.stock_quantity) - quantity;
    const changed = await tx.run(
      "UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND stock_quantity>=?",
      quantity,
      product.id,
      quantity,
    );
    if (!changed.changes)
      throw new DomainError(`Stok ${product.name} tidak mencukupi`, 409);
    await tx.run(
      "INSERT INTO stock_movements(product_id,actor_id,order_id,kind,quantity_delta,balance_after,reason) VALUES(?,?,?,'SALE',?,?,?)",
      product.id,
      actorId,
      orderId,
      -quantity,
      balance,
      `Pesanan #${orderId} dikonfirmasi`,
    );
  }
  await tx.run(
    "INSERT OR IGNORE INTO order_stations(order_id,station) SELECT ?,prep_station FROM order_items WHERE order_id=? GROUP BY prep_station",
    orderId,
    orderId,
  );
  const stations = await tx.all(
    "SELECT station FROM order_stations WHERE order_id=?",
    orderId,
  );
  for (const { station } of stations) {
    const role = station === "KITCHEN" ? "KITCHEN" : "ADMIN";
    for (const operator of await tx.all(
      "SELECT id FROM users WHERE role=? AND active=1",
      role,
    ))
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        operator.id,
        `Pesanan #${orderId} masuk ke ${station === "KITCHEN" ? "dapur" : "stasiun kasir"}`,
      );
  }
}

async function restoreOrderStock(tx, mysql, orderId, actorId) {
  const sales = await tx.all(
    "SELECT s.product_id,-s.quantity_delta quantity FROM stock_movements s WHERE s.order_id=? AND s.kind='SALE' AND NOT EXISTS(SELECT 1 FROM stock_movements r WHERE r.order_id=s.order_id AND r.product_id=s.product_id AND r.kind='RESTORE') ORDER BY s.product_id",
    orderId,
  );
  for (const sale of sales) {
    const product = await tx.get(
      "SELECT id,stock_quantity FROM products WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      sale.product_id,
    );
    const quantity = Number(sale.quantity);
    const balance = Number(product.stock_quantity) + quantity;
    await tx.run(
      "UPDATE products SET stock_quantity=stock_quantity+? WHERE id=?",
      quantity,
      product.id,
    );
    await tx.run(
      "INSERT INTO stock_movements(product_id,actor_id,order_id,kind,quantity_delta,balance_after,reason) VALUES(?,?,?,'RESTORE',?,?,?)",
      product.id,
      actorId,
      orderId,
      quantity,
      balance,
      `Pesanan #${orderId} dibatalkan`,
    );
  }
}
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
  if (
    key !== null &&
    (typeof key !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key,
      ))
  )
    throw new DomainError("Kunci checkout tidak valid");
  const fingerprint =
    key === null
      ? null
      : crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              addressId: input.addressId,
              method: input.method,
              items: [...items].sort((a, b) => a.productId - b.productId),
            }),
          )
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
        "SELECT id,subtotal,delivery_fee,distance_meters,total,driver_delay_notice,checkout_fingerprint FROM orders WHERE customer_id=? AND checkout_key=?" +
          (mysql ? " FOR UPDATE" : ""),
        user.id,
        key,
      );
      if (previous) {
        if (previous.checkout_fingerprint !== fingerprint)
          throw new DomainError(
            "Kunci checkout dipakai untuk keranjang berbeda",
            409,
          );
        return {
          id: previous.id,
          subtotal: Number(previous.subtotal),
          deliveryFee: Number(previous.delivery_fee),
          distanceMeters: Number(previous.distance_meters),
          total: Number(previous.total),
          driverDelayNotice: Boolean(previous.driver_delay_notice),
          replayed: true,
        };
      }
    }
    const address = await tx.get(
      "SELECT id,latitude,longitude FROM addresses WHERE id=? AND user_id=? AND active=1",
      input.addressId,
      user.id,
    );
    if (!address) throw new DomainError("Alamat tidak valid");
    if (address.latitude === null || address.longitude === null)
      throw new DomainError("Pin lokasi alamat wajib diisi", 422);
    const operations = await operationalSettings(tx);
    const delivery = calculateDelivery(
      haversineMeters(operations.origin, {
        latitude: Number(address.latitude),
        longitude: Number(address.longitude),
      }),
      operations.rules,
    );
    let subtotal = 0;
    const lines = [];
    for (const item of items) {
      const p = await tx.get(
        "SELECT id,name,price,prep_station FROM products WHERE id=? AND active=1 AND category_id IN (SELECT id FROM categories WHERE active=1)" +
          (mysql ? " FOR UPDATE" : ""),
        item.productId,
      );
      if (!p) throw new DomainError("Produk tidak tersedia");
      subtotal += p.price * item.quantity;
      lines.push({ ...p, quantity: item.quantity });
    }
    if (!Number.isSafeInteger(subtotal))
      throw new DomainError("Total tidak valid");
    const total = subtotal + delivery.deliveryFee;
    const capacity = await tx.get(
      "SELECT COUNT(*) available FROM users u WHERE u.role='DRIVER' AND u.active=1 AND (SELECT COUNT(*) FROM deliveries d JOIN orders active_order ON active_order.id=d.order_id WHERE d.driver_id=u.id AND active_order.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY'))<5",
    );
    const driverDelayNotice = Number(capacity.available) === 0;
    const { lastInsertRowid: id } = await tx.run(
      "INSERT INTO orders(customer_id,address_id,subtotal,delivery_fee,distance_meters,driver_delay_notice,total,checkout_key,checkout_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)",
      user.id,
      address.id,
      subtotal,
      delivery.deliveryFee,
      delivery.distanceMeters,
      driverDelayNotice ? 1 : 0,
      total,
      key,
      fingerprint,
    );
    for (const line of lines)
      await tx.run(
        "INSERT INTO order_items(order_id,product_id,name,price,quantity,prep_station) VALUES(?,?,?,?,?,?)",
        id,
        line.id,
        line.name,
        line.price,
        line.quantity,
        line.prep_station,
      );
    if (input.method === "BANK_TRANSFER")
      await tx.run(
        mysql
          ? "INSERT INTO payments(order_id,method,status,expires_at) VALUES(?,?,'PENDING',CURRENT_TIMESTAMP + INTERVAL 15 MINUTE)"
          : "INSERT INTO payments(order_id,method,status,expires_at) VALUES(?,?,'PENDING',datetime('now','+15 minutes'))",
        id,
        input.method,
      );
    else
      await tx.run(
        "INSERT INTO payments(order_id,method,status) VALUES(?,?,'UNPAID')",
        id,
        input.method,
      );
    await tx.run(
      "INSERT INTO order_events(order_id,actor_id,next_status) VALUES(?,?,?)",
      id,
      user.id,
      "PENDING",
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ORDER_CREATED",
      JSON.stringify({
        orderId: Number(id),
        subtotal,
        deliveryFee: delivery.deliveryFee,
        distanceMeters: delivery.distanceMeters,
        total,
        itemCount: lines.length,
        driverDelayNotice,
      }),
    );
    await enqueueOrderPrintJobs(tx, id, user.id, operations.printerSimulation);
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
    return {
      id: Number(id),
      subtotal,
      deliveryFee: delivery.deliveryFee,
      distanceMeters: delivery.distanceMeters,
      total,
      driverDelayNotice,
    };
  });
}
export async function changeStatus(user, orderId, status, driverId) {
  required(user, ["ADMIN", "DRIVER", "OWNER"]);
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
        throw new DomainError(
          "Order lunas tidak dapat dibatalkan tanpa proses refund",
        );
      await tx.run(
        "UPDATE payments SET status='CANCELLED' WHERE order_id=? AND status!='CANCELLED'",
        orderId,
      );
      await restoreOrderStock(tx, mysql, orderId, user.id);
    }
    if (user.role === "ADMIN" || user.role === "OWNER") {
      if (!["CONFIRMED", "ASSIGNED", "CANCELLED"].includes(status))
        throw new DomainError(
          "Status persiapan hanya dapat diubah oleh stasiun",
          403,
        );
      if (status === "CONFIRMED") {
        await commitOrderStock(tx, mysql, orderId, user.id);
        await tx.run(
          "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
          user.id,
          "ORDER_CONFIRMED",
          JSON.stringify({ orderId }),
        );
      }
      if (status === "ASSIGNED") {
        const driver = await tx.get(
          "SELECT id FROM users WHERE id=? AND role='DRIVER' AND active=1" +
            (mysql ? " FOR UPDATE" : ""),
          driverId,
        );
        if (!driver) throw new DomainError("Driver tidak valid");
        const load = await tx.get(
          "SELECT COUNT(*) count FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=? AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')",
          driverId,
        );
        if (Number(load.count) >= 5)
          throw new DomainError(
            "Driver sudah mencapai kapasitas 5 pesanan aktif",
            409,
          );
        await tx.run(
          "INSERT INTO deliveries(order_id,driver_id) VALUES(?,?)",
          orderId,
          driverId,
        );
        await tx.run(
          "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
          user.id,
          "DRIVER_ASSIGNED",
          JSON.stringify({
            orderId,
            driverId,
            activeLoad: Number(load.count) + 1,
          }),
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
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ORDER_STATUS_CHANGED",
      JSON.stringify({ orderId, previousStatus: order.status, status }),
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

export async function updateStationStatus(user, orderId, status) {
  required(user, ["ADMIN", "KITCHEN"]);
  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    !["PREPARING", "READY"].includes(status)
  )
    throw new DomainError("Status stasiun tidak valid");
  const station = user.role === "KITCHEN" ? "KITCHEN" : "CASHIER";
  return store.transaction(async (tx, mysql) => {
    const order = await tx.get(
      "SELECT id,customer_id,status FROM orders WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      orderId,
    );
    if (!order) throw new DomainError("Order tidak ditemukan", 404);
    if (!["CONFIRMED", "PREPARING"].includes(order.status))
      throw new DomainError("Pesanan belum dapat diproses stasiun", 409);
    const current = await tx.get(
      "SELECT id,status FROM order_stations WHERE order_id=? AND station=?" +
        (mysql ? " FOR UPDATE" : ""),
      orderId,
      station,
    );
    if (!current)
      throw new DomainError(
        "Pesanan tidak memiliki item untuk stasiun ini",
        403,
      );
    if (
      (status === "PREPARING" && current.status !== "QUEUED") ||
      (status === "READY" && current.status !== "PREPARING")
    )
      throw new DomainError("Perubahan status stasiun tidak diizinkan", 409);
    await tx.run(
      status === "PREPARING"
        ? "UPDATE order_stations SET status='PREPARING',started_by=?,started_at=CURRENT_TIMESTAMP WHERE id=?"
        : "UPDATE order_stations SET status='READY',ready_by=?,ready_at=CURRENT_TIMESTAMP WHERE id=?",
      user.id,
      current.id,
    );
    let overallStatus = order.status;
    if (status === "PREPARING" && order.status === "CONFIRMED") {
      overallStatus = "PREPARING";
      await tx.run("UPDATE orders SET status='PREPARING' WHERE id=?", orderId);
      await tx.run(
        "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,?,?)",
        orderId,
        user.id,
        "CONFIRMED",
        "PREPARING",
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        order.customer_id,
        `Pesanan #${orderId} sedang disiapkan`,
      );
    }
    if (status === "READY") {
      const waiting = await tx.get(
        "SELECT COUNT(*) count FROM order_stations WHERE order_id=? AND status!='READY'",
        orderId,
      );
      if (Number(waiting.count) === 0) {
        const previous = overallStatus;
        overallStatus = "READY";
        await tx.run("UPDATE orders SET status='READY' WHERE id=?", orderId);
        await tx.run(
          "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,?,?)",
          orderId,
          user.id,
          previous,
          "READY",
        );
        await tx.run(
          "INSERT INTO notifications(user_id,message) VALUES(?,?)",
          order.customer_id,
          `Pesanan #${orderId} siap diantar`,
        );
      }
    }
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "STATION_STATUS_CHANGED",
      JSON.stringify({ orderId, station, status, overallStatus }),
    );
    return {
      id: orderId,
      station,
      stationStatus: status,
      status: overallStatus,
    };
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
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "DELIVERY_ACCEPTED",
      JSON.stringify({ orderId }),
    );
    return { accepted: true };
  });
}
