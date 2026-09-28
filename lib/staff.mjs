import * as store from "./store.mjs";
import { hashPassword } from "./auth.mjs";
import { DomainError, required } from "./domain.mjs";
import { normalizeWhatsApp } from "./delivery.mjs";
export async function createDriver(user, input) {
  required(user, ["ADMIN"]);
  const name = String(input.name || "").trim(),
    email = String(input.email || "")
      .trim()
      .toLowerCase(),
    password = String(input.password || ""),
    phone = normalizeWhatsApp(input.phone);
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 255 ||
    password.length < 14 ||
    password.length > 128
  )
    throw new DomainError(
      "Nama, email, atau password driver tidak valid (minimal 14 karakter)",
    );
  try {
    return await store.transaction(async (tx) => {
      const created = await tx.run(
        "INSERT INTO users(name,email,password_hash,role,phone) VALUES(?,?,?,'DRIVER',?)",
        name,
        email,
        hashPassword(password),
        phone,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "DRIVER_CREATED",
        JSON.stringify({ driverId: created.lastInsertRowid, email }),
      );
      return { id: created.lastInsertRowid, name, email, phone };
    });
  } catch (e) {
    if (
      e.code === "ER_DUP_ENTRY" ||
      /UNIQUE constraint failed: users.email/.test(e.message || "")
    )
      throw new DomainError("Email sudah terdaftar");
    throw e;
  }
}
export async function setDriverActive(user, id, active) {
  required(user, ["ADMIN"]);
  if (!Number.isSafeInteger(id) || id < 1 || typeof active !== "boolean")
    throw new DomainError("Data driver tidak valid");
  return store.transaction(async (tx, mysql) => {
    const driver = await tx.get(
      "SELECT id,active FROM users WHERE id=? AND role='DRIVER'" +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!driver) throw new DomainError("Driver tidak ditemukan", 404);
    if (!active) {
      const outstanding = await tx.get(
        "SELECT d.id FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=? AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY') LIMIT 1",
        id,
      );
      if (outstanding)
        throw new DomainError("Driver masih memiliki pengantaran aktif");
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
      "DRIVER_ACTIVE_CHANGED",
      JSON.stringify({ driverId: id, active }),
    );
    return { id, active };
  });
}
