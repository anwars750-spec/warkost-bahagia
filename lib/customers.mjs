import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

export async function listCustomers(user, query = "", before = null) {
  required(user, ["ADMIN"]);
  if (typeof query !== "string" || query.length > 80 ||
      (before !== null && (!Number.isSafeInteger(before) || before < 1)))
    throw new DomainError("Pencarian customer tidak valid");
  const term = `%${query.trim().replace(/[!%_]/g, (character) => "!" + character)}%`;
  const rows = await store.all(
    "SELECT u.id,u.name,u.email,u.active,u.created_at," +
      "(SELECT COUNT(*) FROM orders o WHERE o.customer_id=u.id) order_count," +
      "COALESCE((SELECT balance FROM loyalty_accounts l WHERE l.user_id=u.id),0) points " +
      "FROM users u WHERE u.role='CUSTOMER' AND (u.name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')" +
      (before === null ? "" : " AND u.id<?") + " ORDER BY u.id DESC LIMIT 51",
    term,
    term,
    ...(before === null ? [] : [before]),
  );
  const page = rows.slice(0, 50);
  return { customers: page, nextCursor: rows.length > 50 ? page.at(-1).id : null };
}

export async function setCustomerActive(user, id, active) {
  required(user, ["ADMIN"]);
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
