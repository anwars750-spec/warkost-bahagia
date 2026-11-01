import * as store from "./store.mjs";
import { DomainError, required, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";
import { isGuestCustomer, isGuestEmail } from "./customer-kind.mjs";
import { productLineTotal, validateOrderQuantity } from "./product-units.mjs";

export const LOYALTY_EARN_RATE = 10000;

function requiredMemberCustomer(user) {
  required(user, ["CUSTOMER"]);
  if (isGuestCustomer(user))
    throw new DomainError("Loyalty hanya tersedia untuk member Warkost", 403);
}

export function calculateEarnPoints(earnBase) {
  if (!Number.isSafeInteger(earnBase) || earnBase < 0)
    throw new DomainError("Nilai perolehan poin tidak valid");
  return Math.floor(earnBase / LOYALTY_EARN_RATE);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

function nonNegativeInteger(value, label, { nullable = false } = {}) {
  if (nullable && (value === "" || value === null || value === undefined))
    return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

function text(value, label) {
  const normalized = String(value || "").trim();
  if (normalized.length < 2 || normalized.length > 100)
    throw new DomainError(`${label} harus 2–100 karakter`);
  return normalized;
}

export function calculateLoyaltyDiscount(rule, subtotal) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0)
    throw new DomainError("Subtotal tidak valid");
  const value = Number(rule.reward_value);
  let discount;
  if (rule.reward_type === "PERCENT") {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100)
      throw new DomainError("Konfigurasi reward persen tidak valid", 422);
    discount = Math.floor((subtotal * value) / 100);
  } else if (rule.reward_type === "FIXED") {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new DomainError("Konfigurasi reward nominal tidak valid", 422);
    discount = value;
  } else {
    throw new DomainError("Tipe Loyalty Reward tidak valid", 422);
  }
  if (rule.maximum_discount !== null)
    discount = Math.min(discount, Number(rule.maximum_discount));
  return Math.min(subtotal, discount);
}

function serializeRule(row, balance = null) {
  const rule = {
    ...row,
    id: Number(row.id),
    points_required: Number(row.points_required),
    reward_value: Number(row.reward_value),
    minimum_order: Number(row.minimum_order),
    maximum_discount:
      row.maximum_discount === null ? null : Number(row.maximum_discount),
    active: Boolean(row.active),
  };
  if (balance !== null) {
    rule.eligible_balance = Number(balance) >= rule.points_required;
    rule.ineligible_reason = rule.eligible_balance
      ? null
      : `Butuh ${rule.points_required} poin`;
  }
  return rule;
}

export async function listCustomerRewards(user) {
  requiredMemberCustomer(user);
  const balance = Number(
    (
      await store.get(
        "SELECT balance FROM loyalty_accounts WHERE user_id=?",
        user.id,
      )
    )?.balance || 0,
  );
  const rows = await store.all(
    "SELECT id,name,points_required,reward_type,reward_value,minimum_order,maximum_discount,active FROM loyalty_reward_rules WHERE active=1 ORDER BY points_required,id",
  );
  return rows.map((row) => serializeRule(row, balance));
}

export async function listRewardRules(user) {
  requiredCapability(user, CAPABILITIES.LOYALTY_WRITE);
  return (
    await store.all(
      "SELECT id,name,points_required,reward_type,reward_value,minimum_order,maximum_discount,active,created_at,updated_at FROM loyalty_reward_rules ORDER BY id DESC",
    )
  ).map((row) => serializeRule(row));
}

export async function saveRewardRule(user, input) {
  requiredCapability(user, CAPABILITIES.LOYALTY_WRITE);
  const name = text(input.name, "Nama reward");
  const pointsRequired = positiveInteger(input.pointsRequired, "Poin reward");
  const rewardType = String(input.rewardType || "");
  const rewardValue = positiveInteger(input.rewardValue, "Nilai reward");
  const minimumOrder = nonNegativeInteger(
    input.minimumOrder ?? 0,
    "Minimum belanja",
  );
  const maximumDiscount = nonNegativeInteger(
    input.maximumDiscount,
    "Maksimum diskon",
    { nullable: true },
  );
  const active = input.active === true;
  if (!["PERCENT", "FIXED"].includes(rewardType))
    throw new DomainError("Tipe reward tidak valid");
  if (rewardType === "PERCENT" && rewardValue > 100)
    throw new DomainError("Reward persen maksimal 100");
  if (input.id !== undefined && positiveInteger(input.id, "ID reward") < 1)
    throw new DomainError("ID reward tidak valid");

  return store.transaction(async (tx, mysql) => {
    let id = input.id;
    let before = null;
    if (id !== undefined) {
      before = await tx.get(
        "SELECT * FROM loyalty_reward_rules WHERE id=?" +
          (mysql ? " FOR UPDATE" : ""),
        id,
      );
      if (!before) throw new DomainError("Loyalty Reward tidak ditemukan", 404);
      await tx.run(
        "UPDATE loyalty_reward_rules SET name=?,points_required=?,reward_type=?,reward_value=?,minimum_order=?,maximum_discount=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        name,
        pointsRequired,
        rewardType,
        rewardValue,
        minimumOrder,
        maximumDiscount,
        active ? 1 : 0,
        user.id,
        id,
      );
    } else {
      const created = await tx.run(
        "INSERT INTO loyalty_reward_rules(name,points_required,reward_type,reward_value,minimum_order,maximum_discount,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)",
        name,
        pointsRequired,
        rewardType,
        rewardValue,
        minimumOrder,
        maximumDiscount,
        active ? 1 : 0,
        user.id,
        user.id,
      );
      id = created.lastInsertRowid;
    }
    const after = {
      id: Number(id),
      name,
      points_required: pointsRequired,
      reward_type: rewardType,
      reward_value: rewardValue,
      minimum_order: minimumOrder,
      maximum_discount: maximumDiscount,
      active: active ? 1 : 0,
    };
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "LOYALTY_REWARD_SAVED",
      JSON.stringify({ entityId: Number(id), before, after }),
    );
    return serializeRule(after);
  });
}

export async function validateLoyaltyReward(
  tx,
  mysql,
  customerId,
  rawRuleId,
  subtotal,
  { guest = false } = {},
) {
  if (rawRuleId === null || rawRuleId === undefined)
    return { ruleId: null, points: 0, discount: 0 };
  if (guest)
    throw new DomainError("Guest tidak dapat menggunakan Loyalty Reward", 403);
  const ruleId = positiveInteger(rawRuleId, "Loyalty Reward");
  const rule = await tx.get(
    "SELECT id,name,points_required,reward_type,reward_value,minimum_order,maximum_discount,active FROM loyalty_reward_rules WHERE id=?" +
      (mysql ? " FOR UPDATE" : ""),
    ruleId,
  );
  if (!rule) throw new DomainError("Loyalty Reward tidak ditemukan", 404);
  if (!rule.active) throw new DomainError("Loyalty Reward tidak aktif", 409);
  if (subtotal < Number(rule.minimum_order))
    throw new DomainError(
      `Minimum belanja reward adalah Rp${Number(rule.minimum_order).toLocaleString("id-ID")}`,
      422,
    );
  await tx.run(
    "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
    customerId,
  );
  const account = await tx.get(
    "SELECT balance FROM loyalty_accounts WHERE user_id=?" +
      (mysql ? " FOR UPDATE" : ""),
    customerId,
  );
  const points = Number(rule.points_required);
  if (Number(account.balance) < points)
    throw new DomainError("Poin loyalty tidak mencukupi", 409);
  return {
    ruleId: Number(rule.id),
    points,
    discount: calculateLoyaltyDiscount(rule, subtotal),
  };
}

export async function quoteLoyaltyReward(user, input) {
  requiredMemberCustomer(user);
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 40
  )
    throw new DomainError("Keranjang tidak valid");
  return store.transaction(async (tx, mysql) => {
    let subtotal = 0;
    const seen = new Set();
    for (const item of input.items) {
      if (
        !Number.isSafeInteger(item.productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 1000000 ||
        seen.has(item.productId)
      )
        throw new DomainError("Item tidak valid");
      seen.add(item.productId);
      const product = await tx.get(
        `SELECT p.price,p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity
           FROM products p LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
          WHERE p.id=? AND p.active=1
            AND p.category_id IN (SELECT id FROM categories WHERE active=1)
            AND (p.subcategory_id IS NULL OR s.active=1)`,
        item.productId,
      );
      if (!product) throw new DomainError("Produk tidak tersedia");
      if (!validateOrderQuantity(product, item.quantity))
        throw new DomainError(
          "Jumlah produk tidak sesuai satuan penjualan",
          422,
        );
      subtotal += productLineTotal(product, item.quantity);
    }
    if (!Number.isSafeInteger(subtotal))
      throw new DomainError("Total tidak valid");
    const reward = await validateLoyaltyReward(
      tx,
      mysql,
      user.id,
      input.rewardRuleId,
      subtotal,
    );
    return {
      reward_rule_id: reward.ruleId,
      points_redeemed: reward.points,
      subtotal,
      loyalty_discount: reward.discount,
      total_after_discount: subtotal - reward.discount,
    };
  });
}

export async function redeemLoyaltyReward(tx, customerId, orderId, reward) {
  if (!reward.ruleId) return;
  const updated = await tx.run(
    "UPDATE loyalty_accounts SET balance=balance-? WHERE user_id=? AND balance>=?",
    reward.points,
    customerId,
    reward.points,
  );
  if (updated.changes !== 1)
    throw new DomainError("Poin loyalty tidak mencukupi", 409);
  const account = await tx.get(
    "SELECT balance FROM loyalty_accounts WHERE user_id=?",
    customerId,
  );
  await tx.run(
    "INSERT INTO loyalty_transactions(user_id,order_id,reward_rule_id,kind,amount,balance_after) VALUES(?,?,?,'REDEEM',?,?)",
    customerId,
    orderId,
    reward.ruleId,
    -reward.points,
    account.balance,
  );
}

export async function restoreRedeemedPoints(tx, mysql, order) {
  const redemption = await tx.get(
    "SELECT reward_rule_id,amount FROM loyalty_transactions WHERE order_id=? AND kind='REDEEM'" +
      (mysql ? " FOR UPDATE" : ""),
    order.id,
  );
  if (!redemption) return 0;
  await tx.run(
    "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
    order.customer_id,
  );
  const account = await tx.get(
    "SELECT balance FROM loyalty_accounts WHERE user_id=?" +
      (mysql ? " FOR UPDATE" : ""),
    order.customer_id,
  );
  const points = Math.abs(Number(redemption.amount));
  const inserted = await tx.run(
    "INSERT OR IGNORE INTO loyalty_transactions(user_id,order_id,reward_rule_id,kind,amount,balance_after) VALUES(?,?,?,'RESTORE',?,?)",
    order.customer_id,
    order.id,
    redemption.reward_rule_id,
    points,
    Number(account.balance) + points,
  );
  if (inserted.changes)
    await tx.run(
      "UPDATE loyalty_accounts SET balance=balance+? WHERE user_id=?",
      points,
      order.customer_id,
    );
  return inserted.changes ? points : 0;
}

export async function awardOrderPoints(tx, mysql, order) {
  const payment = await tx.get(
    "SELECT status FROM payments WHERE order_id=?" +
      (mysql ? " FOR UPDATE" : ""),
    order.id,
  );
  if (order.status !== "DELIVERED" || payment?.status !== "PAID")
    return { earnBase: 0, points: 0, awarded: false };
  const customer = await tx.get(
    "SELECT email FROM users WHERE id=?",
    order.customer_id,
  );
  if (isGuestEmail(customer?.email))
    return { earnBase: 0, points: 0, awarded: false };
  const earnBase = Math.max(
    0,
    Number(order.subtotal) -
      Number(order.voucher_discount || 0) -
      Number(order.loyalty_discount || 0),
  );
  const points = calculateEarnPoints(earnBase);
  if (points < 1) return { earnBase, points: 0, awarded: false };
  await tx.run(
    "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
    order.customer_id,
  );
  const account = await tx.get(
    "SELECT balance FROM loyalty_accounts WHERE user_id=?" +
      (mysql ? " FOR UPDATE" : ""),
    order.customer_id,
  );
  const inserted = await tx.run(
    "INSERT OR IGNORE INTO loyalty_transactions(user_id,order_id,kind,amount,balance_after) VALUES(?,?,'EARN',?,?)",
    order.customer_id,
    order.id,
    points,
    Number(account.balance) + points,
  );
  if (inserted.changes) {
    await tx.run(
      "UPDATE loyalty_accounts SET balance=balance+? WHERE user_id=?",
      points,
      order.customer_id,
    );
    await tx.run(
      "INSERT INTO notifications(user_id,message) VALUES(?,?)",
      order.customer_id,
      `Anda mendapatkan ${points} poin dari pesanan #${order.id}`,
    );
  }
  return { earnBase, points, awarded: Boolean(inserted.changes) };
}
