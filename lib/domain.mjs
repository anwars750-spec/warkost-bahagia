import * as store from "./store.mjs";
import crypto from "node:crypto";
import {
  calculateDelivery,
  coordinate,
  haversineMeters,
  operationalSettings,
} from "./delivery.mjs";
import { enqueueOrderPrintJobs } from "./print-queue.mjs";
import {
  redeemVoucher,
  restoreVoucherForOrder,
  validateClaimedVoucher,
} from "./vouchers.mjs";
import {
  awardOrderPoints,
  redeemLoyaltyReward,
  restoreRedeemedPoints,
  validateLoyaltyReward,
} from "./loyalty.mjs";
import {
  createLocalQrisDescriptor,
  paymentProviderConfiguration,
} from "./payment-provider.mjs";
import { CAPABILITIES, hasCapability, ROLES } from "./rbac.mjs";
export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const COD_MAX_ORDER_AMOUNT = 150000;
export const MAX_ACTIVE_DELIVERIES = 5;
export function required(user, roles) {
  if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
  if (!roles.includes(user.role)) throw new DomainError("Akses ditolak", 403);
}
export function requiredCapability(user, capability) {
  if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);
  if (!hasCapability(user.role, capability))
    throw new DomainError("Akses ditolak", 403);
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

export async function deliveryAvailability(source = store) {
  const row = await source.get(
    `SELECT COUNT(*) online_drivers,
            COALESCE(SUM(CASE WHEN active_load<? AND away_load=0 THEN 1 ELSE 0 END),0) available_at_store,
            COALESCE(SUM(CASE WHEN active_load<? THEN ?-active_load ELSE 0 END),0) available_slots,
            COALESCE(SUM(CASE WHEN away_load>0 THEN 1 ELSE 0 END),0) away_drivers
       FROM (
         SELECT u.id,
                (SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=u.id AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')) active_load,
                (SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=u.id AND o.status IN ('PICKED_UP','ON_DELIVERY')) away_load
           FROM users u
          WHERE u.role='DRIVER' AND u.active=1
       ) driver_state`,
    MAX_ACTIVE_DELIVERIES,
    MAX_ACTIVE_DELIVERIES,
    MAX_ACTIVE_DELIVERIES,
  );
  const onlineDrivers = Number(row?.online_drivers || 0);
  const availableAtStore = Number(row?.available_at_store || 0);
  return {
    onlineDrivers,
    availableAtStore,
    availableSlots: Number(row?.available_slots || 0),
    awayDrivers: Number(row?.away_drivers || 0),
    delayed: onlineDrivers === 0 || availableAtStore === 0,
  };
}

export function customerDriverWaitNotice(order, availability) {
  return order?.driver_id == null &&
    ["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(order?.status) &&
    availability?.delayed
    ? 1
    : 0;
}
export async function commitOrderStock(tx, mysql, orderId, actorId) {
  const existing = await tx.get(
    "SELECT id FROM stock_movements WHERE order_id=? AND kind='SALE' LIMIT 1" +
      (mysql ? " FOR UPDATE" : ""),
    orderId,
  );
  if (existing) return false;
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
    const otherReservations = await tx.get(
      "SELECT COALESCE(SUM(quantity),0) quantity FROM stock_reservations WHERE product_id=? AND order_id!=? AND status='RESERVED' AND expires_at>CURRENT_TIMESTAMP",
      line.product_id,
      orderId,
    );
    if (
      !product ||
      Number(product.stock_quantity) - Number(otherReservations.quantity) <
        quantity
    )
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
        `Pesanan #${orderId} masuk ke ${station === "KITCHEN" ? "dapur" : "stasiun minuman Admin"}`,
      );
  }
  await tx.run(
    "UPDATE stock_reservations SET status='COMMITTED',committed_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'",
    orderId,
  );
  return true;
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

async function paymentExpiryMinutes(tx) {
  const raw = (
    await tx.get(
      "SELECT value FROM settings WHERE `key`='payment_expiry_minutes'",
    )
  )?.value;
  const value = raw == null ? 15 : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1440)
    throw new DomainError("Konfigurasi waktu pembayaran tidak valid", 422);
  return value;
}

function sqlTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function reserveQrisStock(tx, mysql, orderId, lines, expiresAt) {
  for (const line of lines) {
    const product = await tx.get(
      "SELECT id,name,stock_quantity FROM products WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      line.id,
    );
    const reserved = await tx.get(
      "SELECT COALESCE(SUM(quantity),0) quantity FROM stock_reservations WHERE product_id=? AND status='RESERVED' AND expires_at>CURRENT_TIMESTAMP",
      line.id,
    );
    if (
      !product ||
      Number(product.stock_quantity) - Number(reserved.quantity) < line.quantity
    )
      throw new DomainError(
        `Stok ${product?.name || line.name} tidak mencukupi`,
        409,
      );
    await tx.run(
      "INSERT INTO stock_reservations(order_id,product_id,quantity,expires_at) VALUES(?,?,?,?)",
      orderId,
      line.id,
      line.quantity,
      expiresAt,
    );
  }
}

async function addressDeliveryContext(tx, user, addressId) {
  if (!Number.isSafeInteger(addressId) || addressId < 1)
    throw new DomainError("Alamat tidak valid");
  const address = await tx.get(
    "SELECT id,latitude,longitude FROM addresses WHERE id=? AND user_id=? AND active=1",
    addressId,
    user.id,
  );
  if (!address) throw new DomainError("Alamat tidak valid");
  if (address.latitude === null || address.longitude === null)
    throw new DomainError("Pin lokasi alamat wajib diisi", 422);
  const destination = {
    latitude: coordinate(address.latitude, -90, 90, "Latitude"),
    longitude: coordinate(address.longitude, -180, 180, "Longitude"),
  };
  const operations = await operationalSettings(tx);
  return {
    address,
    operations,
    distanceMeters: haversineMeters(operations.origin, destination),
  };
}

export async function quoteDelivery(user, addressId) {
  required(user, ["CUSTOMER"]);
  const { operations, distanceMeters } = await addressDeliveryContext(
    store,
    user,
    addressId,
  );
  const distanceKm = distanceMeters / 1000;
  const common = {
    distance_km: Number(distanceKm.toFixed(3)),
    free_radius_km: operations.rules.freeKm,
    max_radius_km: operations.rules.maxKm,
    extra_fee_per_km: operations.rules.feePerKm,
  };
  if (distanceKm > operations.rules.maxKm)
    return {
      available: false,
      ...common,
      delivery_fee: null,
      free_delivery: false,
      message: `Alamat berada di luar radius delivery maksimal ${operations.rules.maxKm} km.`,
    };
  const delivery = calculateDelivery(distanceMeters, operations.rules);
  return {
    available: true,
    ...common,
    delivery_fee: delivery.deliveryFee,
    free_delivery: delivery.freeDelivery,
    message: delivery.freeDelivery
      ? `Gratis ongkir untuk jarak ${common.distance_km} km.`
      : `Ongkir ${common.distance_km} km dihitung dari konfigurasi pengiriman.`,
  };
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
  if (!["CASH", "BANK_TRANSFER", "QRIS"].includes(input.method))
    throw new DomainError("Metode pembayaran tidak valid");
  if (input.method === "QRIS") {
    const provider = paymentProviderConfiguration();
    if (!provider.available)
      throw new DomainError(
        provider.reason || "Provider QRIS tidak tersedia",
        503,
      );
  }
  const loyaltyRequested = input.loyaltyRewardId != null;
  if (input.promotionId != null && loyaltyRequested)
    throw new DomainError(
      "Voucher dan Loyalty Reward tidak dapat digunakan bersamaan",
      422,
    );
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
              promotionId: input.promotionId ?? null,
              loyaltyRewardId: input.loyaltyRewardId ?? null,
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
        "SELECT id,subtotal,delivery_fee,distance_meters,voucher_discount,loyalty_points_redeemed,loyalty_discount,total,driver_delay_notice,checkout_fingerprint FROM orders WHERE customer_id=? AND checkout_key=?" +
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
        const previousPayment = await tx.get(
          "SELECT id,method,status,amount,provider_reference,transaction_reference,qr_payload,payment_url,expires_at FROM payments WHERE order_id=?",
          previous.id,
        );
        return {
          id: previous.id,
          subtotal: Number(previous.subtotal),
          deliveryFee: Number(previous.delivery_fee),
          distanceMeters: Number(previous.distance_meters),
          voucherDiscount: Number(previous.voucher_discount),
          loyaltyPointsRedeemed: Number(previous.loyalty_points_redeemed),
          loyaltyDiscount: Number(previous.loyalty_discount),
          total: Number(previous.total),
          driverDelayNotice: Boolean(previous.driver_delay_notice),
          payment: previousPayment,
          replayed: true,
        };
      }
    }
    const { address, operations, distanceMeters } =
      await addressDeliveryContext(tx, user, input.addressId);
    const delivery = calculateDelivery(distanceMeters, operations.rules);
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
    const voucher = await validateClaimedVoucher(
      tx,
      mysql,
      user.id,
      input.promotionId,
      subtotal,
    );
    const loyalty = await validateLoyaltyReward(
      tx,
      mysql,
      user.id,
      input.loyaltyRewardId,
      subtotal,
    );
    const total =
      subtotal - voucher.discount - loyalty.discount + delivery.deliveryFee;
    const codLimit = Number(
      (
        await tx.get(
          "SELECT value FROM settings WHERE `key`='cod_max_order_amount'",
        )
      )?.value ?? COD_MAX_ORDER_AMOUNT,
    );
    if (!Number.isSafeInteger(codLimit) || codLimit !== COD_MAX_ORDER_AMOUNT)
      throw new DomainError("Konfigurasi batas transaksi COD tidak valid", 500);
    if (input.method === "CASH" && total > codLimit)
      throw new DomainError(
        `Pembayaran COD maksimal Rp${codLimit.toLocaleString("id-ID")}. Gunakan metode non-tunai.`,
        422,
      );
    const driverAvailability = await deliveryAvailability(tx);
    const driverDelayNotice = driverAvailability.delayed;
    const { lastInsertRowid: id } = await tx.run(
      "INSERT INTO orders(customer_id,address_id,subtotal,delivery_fee,distance_meters,driver_delay_notice,promotion_id,promo_claim_id,voucher_discount,loyalty_reward_rule_id,loyalty_points_redeemed,loyalty_discount,total,checkout_key,checkout_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      user.id,
      address.id,
      subtotal,
      delivery.deliveryFee,
      delivery.distanceMeters,
      driverDelayNotice ? 1 : 0,
      voucher.promotionId,
      voucher.claimId,
      voucher.discount,
      loyalty.ruleId,
      loyalty.points,
      loyalty.discount,
      total,
      key,
      fingerprint,
    );
    await redeemVoucher(tx, voucher.claimId, voucher.promotionId, id);
    await redeemLoyaltyReward(tx, user.id, id, loyalty);
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
    let payment;
    if (["BANK_TRANSFER", "QRIS"].includes(input.method)) {
      const expiryMinutes = await paymentExpiryMinutes(tx);
      const expiresAt = sqlTimestamp(
        new Date(Date.now() + expiryMinutes * 60 * 1000),
      );
      if (input.method === "QRIS") {
        const descriptor = createLocalQrisDescriptor(id, total, expiresAt);
        const result = await tx.run(
          "INSERT INTO payments(order_id,method,status,amount,provider,provider_reference,transaction_reference,qr_payload,payment_url,expires_at) VALUES(?,?,'PENDING',?,?,?,?,?,?,?)",
          id,
          input.method,
          total,
          descriptor.provider,
          descriptor.providerReference,
          descriptor.transactionReference,
          descriptor.qrPayload,
          descriptor.paymentUrl,
          expiresAt,
        );
        await reserveQrisStock(tx, mysql, id, lines, expiresAt);
        payment = {
          id: Number(result.lastInsertRowid),
          method: "QRIS",
          status: "PENDING",
          amount: total,
          provider_reference: descriptor.providerReference,
          transaction_reference: descriptor.transactionReference,
          qr_payload: descriptor.qrPayload,
          payment_url: descriptor.paymentUrl,
          expires_at: expiresAt,
        };
      } else {
        const result = await tx.run(
          "INSERT INTO payments(order_id,method,status,amount,expires_at) VALUES(?,?,'PENDING',?,?)",
          id,
          input.method,
          total,
          expiresAt,
        );
        payment = {
          id: Number(result.lastInsertRowid),
          method: input.method,
          status: "PENDING",
          amount: total,
          expires_at: expiresAt,
        };
      }
    } else {
      const result = await tx.run(
        "INSERT INTO payments(order_id,method,status,amount) VALUES(?,?,'UNPAID',?)",
        id,
        input.method,
        total,
      );
      payment = {
        id: Number(result.lastInsertRowid),
        method: input.method,
        status: "UNPAID",
        amount: total,
      };
    }
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
        promotionId: voucher.promotionId,
        voucherDiscount: voucher.discount,
        loyaltyRewardRuleId: loyalty.ruleId,
        loyaltyPointsRedeemed: loyalty.points,
        loyaltyDiscount: loyalty.discount,
        distanceMeters: delivery.distanceMeters,
        total,
        itemCount: lines.length,
        driverDelayNotice,
      }),
    );
    if (input.method !== "QRIS")
      await enqueueOrderPrintJobs(
        tx,
        id,
        user.id,
        operations.printerSimulation,
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
    return {
      id: Number(id),
      subtotal,
      deliveryFee: delivery.deliveryFee,
      distanceMeters: delivery.distanceMeters,
      voucherDiscount: voucher.discount,
      loyaltyPointsRedeemed: loyalty.points,
      loyaltyDiscount: loyalty.discount,
      total,
      driverDelayNotice,
      payment,
    };
  });
}
export async function changeStatus(user, orderId, status, driverId) {
  if (user?.role === ROLES.DRIVER)
    requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  else requiredCapability(user, CAPABILITIES.ORDERS_OPERATE);
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
      await tx.run(
        "UPDATE stock_reservations SET status='RELEASED',released_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='RESERVED'",
        orderId,
      );
      await restoreOrderStock(tx, mysql, orderId, user.id);
      await restoreVoucherForOrder(tx, mysql, order);
      await restoreRedeemedPoints(tx, mysql, order);
    }
    if (user.role === "ADMIN" || user.role === "OWNER") {
      if (!["CONFIRMED", "CANCELLED"].includes(status))
        throw new DomainError(
          "Status persiapan hanya dapat diubah oleh stasiun",
          403,
        );
      if (status === "CONFIRMED") {
        const payment = await tx.get(
          "SELECT method,status FROM payments WHERE order_id=?" +
            (mysql ? " FOR UPDATE" : ""),
          orderId,
        );
        if (payment?.method === "QRIS" && payment.status !== "PAID")
          throw new DomainError(
            "Pembayaran QRIS harus terverifikasi sebelum pesanan dikonfirmasi",
            409,
          );
        await commitOrderStock(tx, mysql, orderId, user.id);
        await tx.run(
          "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
          user.id,
          "ORDER_CONFIRMED",
          JSON.stringify({ orderId }),
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
    if (status === "DELIVERED") {
      const payment = await tx.get(
        "SELECT method,status,amount FROM payments WHERE order_id=?" +
          (mysql ? " FOR UPDATE" : ""),
        orderId,
      );
      if (payment?.method === "CASH") {
        const settlement = await tx.run(
          "INSERT OR IGNORE INTO cod_settlements(order_id,driver_id,expected_amount) VALUES(?,?,?)",
          orderId,
          user.id,
          payment.amount,
        );
        if (settlement.changes) {
          await tx.run(
            "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
            user.id,
            "COD_SETTLEMENT_AWAITING",
            JSON.stringify({
              actorRole: user.role,
              orderId,
              driverId: user.id,
              expectedAmount: Number(payment.amount),
              paymentStatus: payment.status,
            }),
          );
          for (const admin of await tx.all(
            "SELECT id FROM users WHERE role='ADMIN' AND active=1",
          ))
            await tx.run(
              "INSERT INTO notifications(user_id,message) VALUES(?,?)",
              admin.id,
              `Pesanan COD #${orderId} menunggu setoran tunai driver`,
            );
        }
      }
      await awardOrderPoints(tx, mysql, { ...order, status: "DELIVERED" });
    }
    return { id: orderId, status };
  });
}

export async function listDriverOrders(user, before = null) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  if (before !== null && (!Number.isSafeInteger(before) || before < 1))
    throw new DomainError("Cursor pesanan tidak valid");
  const driver = await store.get(
    "SELECT u.id,(SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=u.id AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')) active_load,(SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=u.id AND o.status IN ('PICKED_UP','ON_DELIVERY')) away_load FROM users u WHERE u.id=? AND u.role='DRIVER' AND u.active=1",
    user.id,
  );
  if (!driver)
    throw new DomainError("Driver sedang offline atau tidak aktif", 409);
  return store.all(
    "SELECT o.*,a.detail address,a.latitude,a.longitude,u.name customer_name,d.accepted_at,p.method,p.status payment_status,p.amount payment_amount,s.id settlement_id,s.status settlement_status,s.expected_amount,s.cash_amount,s.evidence_reference,s.submitted_at,s.verified_at,s.discrepancy_amount," +
      "CASE WHEN o.status='READY' AND d.id IS NULL THEN 1 ELSE 0 END available_to_claim " +
      "FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id JOIN addresses a ON a.id=o.address_id JOIN users u ON u.id=o.customer_id JOIN payments p ON p.order_id=o.id LEFT JOIN cod_settlements s ON s.order_id=o.id " +
      "WHERE (d.driver_id=?" +
      (Number(driver.active_load) < MAX_ACTIVE_DELIVERIES &&
      Number(driver.away_load) === 0
        ? " OR (o.status='READY' AND d.id IS NULL)"
        : "") +
      ")" +
      (before === null ? "" : " AND o.id<?") +
      " ORDER BY o.id DESC LIMIT 26",
    user.id,
    ...(before === null ? [] : [before]),
  );
}

export async function claimDelivery(user, orderId) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  if (!Number.isSafeInteger(orderId) || orderId < 1)
    throw new DomainError("Order tidak valid");
  return store.transaction(async (tx, mysql) => {
    const driver = await tx.get(
      "SELECT id FROM users WHERE id=? AND role='DRIVER' AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!driver)
      throw new DomainError("Driver sedang offline atau tidak aktif", 409);
    const order = await tx.get(
      "SELECT id,customer_id,status FROM orders WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      orderId,
    );
    if (!order) throw new DomainError("Order tidak ditemukan", 404);
    const existing = await tx.get(
      "SELECT id,driver_id FROM deliveries WHERE order_id=?" +
        (mysql ? " FOR UPDATE" : ""),
      orderId,
    );
    if (existing?.driver_id === user.id)
      return {
        id: orderId,
        status: order.status,
        claimed: true,
        duplicate: true,
      };
    if (existing || order.status !== "READY")
      throw new DomainError("Pesanan tidak lagi tersedia untuk diambil", 409);
    const load = await tx.get(
      "SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN o.status IN ('PICKED_UP','ON_DELIVERY') THEN 1 ELSE 0 END),0) away_count FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=? AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')",
      user.id,
    );
    if (Number(load.away_count) > 0)
      throw new DomainError(
        "Selesaikan trip aktif sebelum mengambil pesanan baru",
        409,
      );
    if (Number(load.count) >= MAX_ACTIVE_DELIVERIES)
      throw new DomainError(
        `Driver sudah mencapai kapasitas ${MAX_ACTIVE_DELIVERIES} pesanan aktif`,
        409,
      );
    await tx.run(
      "INSERT INTO deliveries(order_id,driver_id,accepted_at) VALUES(?,?,CURRENT_TIMESTAMP)",
      orderId,
      user.id,
    );
    const changed = await tx.run(
      "UPDATE orders SET status='ASSIGNED' WHERE id=? AND status='READY'",
      orderId,
    );
    if (!changed.changes)
      throw new DomainError("Pesanan tidak lagi tersedia untuk diambil", 409);
    await tx.run(
      "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?, 'READY','ASSIGNED')",
      orderId,
      user.id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "DRIVER_SELF_CLAIMED",
      JSON.stringify({
        orderId,
        driverId: user.id,
        activeLoad: Number(load.count) + 1,
      }),
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      order.customer_id,
      `Driver telah mengambil pengantaran pesanan #${orderId}`,
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      user.id,
      `Anda mengambil pengantaran pesanan #${orderId}`,
    );
    return { id: orderId, status: "ASSIGNED", claimed: true };
  });
}

export async function claimReadyDeliveries(user) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
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
    const remaining = Math.max(0, MAX_ACTIVE_DELIVERIES - Number(load.count));
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
        WHERE o.status='READY'
          AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id=o.id)
        ORDER BY o.id
        LIMIT ${remaining}${mysql ? " FOR UPDATE" : ""}`,
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

export async function pickupAllDeliveries(user) {
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
  return store.transaction(async (tx, mysql) => {
    const driver = await tx.get(
      "SELECT id FROM users WHERE id=? AND role='DRIVER' AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!driver)
      throw new DomainError("Driver sedang offline atau tidak aktif", 409);
    const away = await tx.get(
      "SELECT COUNT(*) count FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=? AND o.status='ON_DELIVERY'",
      user.id,
    );
    if (Number(away.count) > 0)
      throw new DomainError(
        "Selesaikan pengantaran aktif sebelum pickup grup lain",
        409,
      );
    const assigned = await tx.all(
      `SELECT o.id,o.customer_id
         FROM orders o
         JOIN deliveries d ON d.order_id=o.id
        WHERE d.driver_id=? AND d.accepted_at IS NOT NULL AND o.status='ASSIGNED'
        ORDER BY o.id${mysql ? " FOR UPDATE" : ""}`,
      user.id,
    );
    if (!assigned.length) {
      const picked = await tx.all(
        "SELECT o.id FROM orders o JOIN deliveries d ON d.order_id=o.id WHERE d.driver_id=? AND o.status='PICKED_UP' ORDER BY o.id",
        user.id,
      );
      return {
        pickedUpOrderIds: picked.map((order) => Number(order.id)),
        count: 0,
        duplicate: picked.length > 0,
      };
    }
    const pickedUpOrderIds = [];
    for (const order of assigned) {
      const changed = await tx.run(
        "UPDATE orders SET status='PICKED_UP' WHERE id=? AND status='ASSIGNED'",
        order.id,
      );
      if (!changed.changes)
        throw new DomainError(
          `Status pesanan #${Number(order.id)} berubah`,
          409,
        );
      pickedUpOrderIds.push(Number(order.id));
      await tx.run(
        "INSERT INTO order_events(order_id,actor_id,previous_status,next_status) VALUES(?,?,'ASSIGNED','PICKED_UP')",
        order.id,
        user.id,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "ORDER_STATUS_CHANGED",
        JSON.stringify({
          orderId: Number(order.id),
          previousStatus: "ASSIGNED",
          status: "PICKED_UP",
          batchPickup: true,
        }),
      );
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        order.customer_id,
        `Pesanan #${Number(order.id)} diambil driver`,
      );
    }
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "DRIVER_BATCH_PICKED_UP",
      JSON.stringify({
        driverId: user.id,
        orderIds: pickedUpOrderIds,
        count: pickedUpOrderIds.length,
      }),
    );
    return {
      pickedUpOrderIds,
      count: pickedUpOrderIds.length,
    };
  });
}

export async function updateStationStatus(user, orderId, status) {
  requiredCapability(user, CAPABILITIES.KITCHEN_PREPARE);
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
  requiredCapability(user, CAPABILITIES.DELIVERY_OWN);
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
