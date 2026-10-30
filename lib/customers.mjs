import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const customerSearchTerm = (query) =>
  `%${query.trim().replace(/[!%_]/g, (character) => "!" + character)}%`;

export async function listCustomers(user, query = "", before = null) {
  requiredCapability(user, CAPABILITIES.CUSTOMERS_MANAGE);
  if (
    typeof query !== "string" ||
    query.length > 80 ||
    (before !== null && (!Number.isSafeInteger(before) || before < 1))
  )
    throw new DomainError("Pencarian customer tidak valid");
  const term = customerSearchTerm(query);
  const rows = await store.all(
    "SELECT u.id,u.name,u.email,u.active,u.created_at," +
      "(SELECT COUNT(*) FROM orders o WHERE o.customer_id=u.id) order_count," +
      "COALESCE((SELECT balance FROM loyalty_accounts l WHERE l.user_id=u.id),0) points " +
      "FROM users u WHERE u.role='CUSTOMER' AND (u.name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')" +
      (before === null ? "" : " AND u.id<?") +
      " ORDER BY u.id DESC LIMIT 51",
    term,
    term,
    ...(before === null ? [] : [before]),
  );
  const page = rows.slice(0, 50);
  return {
    customers: page,
    nextCursor: rows.length > 50 ? page.at(-1).id : null,
  };
}

export async function listOwnerCustomers(
  user,
  { query = "", status = "all", before = null } = {},
) {
  requiredCapability(user, CAPABILITIES.CUSTOMERS_MANAGE);
  if (user?.role !== "OWNER") throw new DomainError("Akses Owner diperlukan", 403);
  if (
    typeof query !== "string" ||
    query.length > 80 ||
    !["all", "active", "inactive"].includes(status) ||
    (before !== null && (!Number.isSafeInteger(before) || before < 1))
  )
    throw new DomainError("Filter customer tidak valid");

  const summary = await store.get(
    "SELECT COUNT(*) total," +
      "SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active_count," +
      "SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) inactive_count," +
      "COALESCE((SELECT SUM(balance) FROM loyalty_accounts),0) points_total " +
      "FROM users WHERE role='CUSTOMER'",
  );

  const term = customerSearchTerm(query);
  const statusClause =
    status === "active" ? " AND u.active=1" : status === "inactive" ? " AND u.active=0" : "";
  const cursorClause = before === null ? "" : " AND u.id<?";
  const rows = await store.all(
    "SELECT u.id,u.name,u.email,u.phone,u.active,u.created_at," +
      "(SELECT COUNT(*) FROM orders o WHERE o.customer_id=u.id) order_count," +
      "COALESCE((SELECT balance FROM loyalty_accounts l WHERE l.user_id=u.id),0) points," +
      "COALESCE((SELECT SUM(o.total) FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.customer_id=u.id AND p.status='PAID'),0) lifetime_value," +
      "(SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id=u.id) last_order_at " +
      "FROM users u WHERE u.role='CUSTOMER' AND (u.name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')" +
      statusClause +
      cursorClause +
      " ORDER BY u.id DESC LIMIT 31",
    term,
    term,
    ...(before === null ? [] : [before]),
  );
  const page = rows.slice(0, 30);
  return {
    summary: {
      total: Number(summary?.total || 0),
      active: Number(summary?.active_count || 0),
      inactive: Number(summary?.inactive_count || 0),
      points: Number(summary?.points_total || 0),
    },
    customers: page,
    nextCursor: rows.length > 30 ? page.at(-1).id : null,
  };
}

export async function setCustomerActive(user, id, active) {
  requiredCapability(user, CAPABILITIES.CUSTOMERS_ACTIVE_MANAGE);
  if (!Number.isSafeInteger(id) || id < 1 || typeof active !== "boolean")
    throw new DomainError("Data customer tidak valid");
  return store.transaction(async (tx, mysql) => {
    const customer = await tx.get(
      "SELECT id,active FROM users WHERE id=? AND role='CUSTOMER'" +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!customer) throw new DomainError("Customer tidak ditemukan", 404);
    if (!active) {
      const outstanding = await tx.get(
        "SELECT id FROM orders WHERE customer_id=? AND status NOT IN ('DELIVERED','CANCELLED') LIMIT 1",
        id,
      );
      if (outstanding)
        throw new DomainError("Customer masih memiliki pesanan aktif");
    }
    await tx.run("UPDATE users SET active=? WHERE id=?", active ? 1 : 0, id);
    if (!active)
      await tx.run(
        "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
        id,
      );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "CUSTOMER_ACTIVE_CHANGED",
      JSON.stringify({ customerId: id, active }),
    );
    return { id, active };
  });
}
