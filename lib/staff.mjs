import * as store from "./store.mjs";
import { hashPassword } from "./auth.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { normalizeWhatsApp } from "./delivery.mjs";
import { CAPABILITIES, ROLES } from "./rbac.mjs";

const MANAGED_STAFF_ROLES = Object.freeze([
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.DRIVER,
]);
const RESETTABLE_ROLES = Object.freeze([ROLES.MANAGER, ROLES.ADMIN]);

function staffInput(input, forcedRole = null) {
  const role = forcedRole || String(input.role || "").toUpperCase();
  const name = String(input.name || "").trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const password = String(input.password || "");
  const rawPhone = String(input.phone || "").trim();
  if (
    !MANAGED_STAFF_ROLES.includes(role) ||
    name.length < 2 ||
    name.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 255 ||
    password.length < 14 ||
    password.length > 128 ||
    (role === ROLES.DRIVER && !rawPhone)
  )
    throw new DomainError(
      "Role, nama, email, nomor HP, atau password staf tidak valid (minimal 14 karakter)",
    );
  return {
    role,
    name,
    email,
    password,
    phone: rawPhone ? normalizeWhatsApp(rawPhone) : null,
  };
}

export async function listStaff(user) {
  requiredCapability(user, CAPABILITIES.STAFF_MANAGE);
  return store.all(
    "SELECT id,name,email,phone,role,active,created_at FROM users WHERE role IN ('MANAGER','ADMIN','DRIVER') ORDER BY role,name,id",
  );
}

export async function createStaff(user, input) {
  requiredCapability(user, CAPABILITIES.STAFF_MANAGE);
  const data = staffInput(input);
  try {
    return await store.transaction(async (tx) => {
      const created = await tx.run(
        "INSERT INTO users(name,email,password_hash,role,phone) VALUES(?,?,?,?,?)",
        data.name,
        data.email,
        hashPassword(data.password),
        data.role,
        data.phone,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "STAFF_CREATED",
        JSON.stringify({
          staffId: created.lastInsertRowid,
          email: data.email,
          role: data.role,
        }),
      );
      return {
        id: created.lastInsertRowid,
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        active: 1,
      };
    });
  } catch (error) {
    if (
      error.code === "ER_DUP_ENTRY" ||
      /UNIQUE constraint failed: users\.(email|phone)/.test(error.message || "")
    )
      throw new DomainError("Email atau nomor HP sudah terdaftar");
    throw error;
  }
}

export async function createDriver(user, input) {
  return createStaff(user, { ...input, role: ROLES.DRIVER });
}

export async function resetStaffPassword(user, id, password) {
  requiredCapability(user, CAPABILITIES.STAFF_MANAGE);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof password !== "string" ||
    password.length < 14 ||
    password.length > 128
  )
    throw new DomainError("Data reset password staf tidak valid");
  return store.transaction(async (tx, mysql) => {
    const staff = await tx.get(
      "SELECT id,email,role FROM users WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!staff || !RESETTABLE_ROLES.includes(staff.role))
      throw new DomainError("Staf Manager/Admin tidak ditemukan", 404);
    await tx.run(
      "UPDATE users SET password_hash=? WHERE id=?",
      hashPassword(password),
      id,
    );
    await tx.run(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
      id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "STAFF_PASSWORD_RESET",
      JSON.stringify({ staffId: id, role: staff.role }),
    );
    return { id, role: staff.role, sessionsRevoked: true };
  });
}

export async function setDriverActive(user, id, active) {
  requiredCapability(user, CAPABILITIES.STAFF_MANAGE);
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
