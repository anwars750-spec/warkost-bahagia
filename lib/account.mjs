import * as store from "./store.mjs";
import { checkPassword, hashPassword } from "./auth.mjs";
import { DomainError, required } from "./domain.mjs";
import { coordinate } from "./delivery.mjs";
function addressData(input) {
  const label = String(input.label || "").trim(),
    detail = String(input.detail || "").trim(),
    latitude = coordinate(input.latitude, -90, 90, "Latitude"),
    longitude = coordinate(input.longitude, -180, 180, "Longitude");
  if (
    label.length < 2 ||
    label.length > 60 ||
    detail.length < 10 ||
    detail.length > 500
  )
    throw new DomainError("Alamat tidak valid");
  return { label, detail, latitude, longitude };
}
export async function addAddress(user, input) {
  required(user, ["CUSTOMER"]);
  const { label, detail, latitude, longitude } = addressData(input);
  const result = await store.run(
    "INSERT INTO addresses(user_id,label,detail,latitude,longitude) VALUES(?,?,?,?,?)",
    user.id,
    label,
    detail,
    latitude,
    longitude,
  );
  return { id: result.lastInsertRowid };
}
export async function replaceAddress(user, id, input) {
  required(user, ["CUSTOMER"]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Alamat tidak valid");
  const { label, detail, latitude, longitude } = addressData(input);
  return store.transaction(async (tx, mysql) => {
    const previous = await tx.get(
      "SELECT id FROM addresses WHERE id=? AND user_id=? AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      id,
      user.id,
    );
    if (!previous) throw new DomainError("Alamat tidak ditemukan", 404);
    await tx.run("UPDATE addresses SET active=0 WHERE id=?", id);
    const created = await tx.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude) VALUES(?,?,?,?,?)",
      user.id,
      label,
      detail,
      latitude,
      longitude,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADDRESS_REPLACED",
      JSON.stringify({ previousId: id, newId: created.lastInsertRowid }),
    );
    return { id: created.lastInsertRowid };
  });
}
export async function removeAddress(user, id) {
  required(user, ["CUSTOMER"]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Alamat tidak valid");
  return store.transaction(async (tx) => {
    const result = await tx.run(
      "UPDATE addresses SET active=0 WHERE id=? AND user_id=? AND active=1",
      id,
      user.id,
    );
    if (!result.changes) throw new DomainError("Alamat tidak ditemukan", 404);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADDRESS_REMOVED",
      JSON.stringify({ addressId: id }),
    );
    return { ok: true };
  });
}
export async function updateProfile(user, input) {
  required(user, ["CUSTOMER"]);
  const name = String(input.name || "").trim(),
    newPassword = String(input.newPassword || "");
  if (
    name.length < 2 ||
    name.length > 80 ||
    (newPassword && (newPassword.length < 12 || newPassword.length > 128))
  )
    throw new DomainError(
      "Nama atau password baru tidak valid (minimal 12 karakter)",
    );
  return store.transaction(async (tx, mysql) => {
    const current = await tx.get(
      "SELECT password_hash,email FROM users WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    if (!current) throw new DomainError("Akun tidak ditemukan", 404);
    if (
      newPassword &&
      !checkPassword(String(input.currentPassword || ""), current.password_hash)
    )
      throw new DomainError("Password saat ini salah", 401);
    await tx.run(
      "UPDATE users SET name=?" +
        (newPassword ? ",password_hash=?" : "") +
        " WHERE id=?",
      ...(newPassword
        ? [name, hashPassword(newPassword), user.id]
        : [name, user.id]),
    );
    if (newPassword)
      await tx.run(
        "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
        user.id,
      );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PROFILE_UPDATED",
      JSON.stringify({ passwordChanged: Boolean(newPassword) }),
    );
    return {
      user: { id: user.id, name, email: current.email, role: "CUSTOMER" },
      passwordChanged: Boolean(newPassword),
    };
  });
}
