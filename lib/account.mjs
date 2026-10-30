import * as store from "./store.mjs";
import { checkPassword, hashPassword } from "./auth.mjs";
import { DomainError, required } from "./domain.mjs";
import { coordinate } from "./delivery.mjs";

export function normalizeCustomerPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62") || digits.length < 10 || digits.length > 15)
    throw new DomainError("Nomor HP tidak valid");
  return digits;
}

export function validateBirthDate(value) {
  const birthDate = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
    throw new DomainError("Tanggal lahir tidak valid");
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== birthDate ||
    parsed >= new Date() ||
    parsed.getUTCFullYear() < 1900
  )
    throw new DomainError("Tanggal lahir tidak valid");
  return birthDate;
}

function addressText(input) {
  const label = String(input.label || "").trim();
  const detail = String(input.detail || "").trim();
  if (
    label.length < 2 ||
    label.length > 60 ||
    detail.length < 10 ||
    detail.length > 500
  )
    throw new DomainError("Alamat tidak valid");
  return { label, detail };
}

function validCoordinatePair(input, fallback) {
  const hasLatitude = input.latitude !== "" && input.latitude != null;
  const hasLongitude = input.longitude !== "" && input.longitude != null;
  if (hasLatitude !== hasLongitude)
    throw new DomainError("Titik lokasi tidak lengkap");
  if (!hasLatitude) return fallback;
  return {
    latitude: coordinate(input.latitude, -90, 90, "Latitude"),
    longitude: coordinate(input.longitude, -180, 180, "Longitude"),
  };
}

async function businessCoordinates(tx) {
  const rows = await tx.all(
    "SELECT `key`,value FROM settings WHERE `key` IN ('business_latitude','business_longitude')",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    latitude: coordinate(
      values.business_latitude ?? -6.9217,
      -90,
      90,
      "Latitude Warkost",
    ),
    longitude: coordinate(
      values.business_longitude ?? 106.9272,
      -180,
      180,
      "Longitude Warkost",
    ),
  };
}

export async function getCustomerAccount(user) {
  required(user, ["CUSTOMER"]);
  const profile = await store.get(
    "SELECT name,email,phone,birth_date FROM users WHERE id=? AND role='CUSTOMER' AND active=1",
    user.id,
  );
  if (!profile) throw new DomainError("Akun tidak ditemukan", 404);
  const addresses = await store.all(
    "SELECT id,label,detail,latitude,longitude,is_default,created_at FROM addresses WHERE user_id=? AND active=1 ORDER BY is_default DESC,id DESC",
    user.id,
  );
  return { profile, addresses };
}

export async function addAddress(user, input) {
  required(user, ["CUSTOMER"]);
  const { label, detail } = addressText(input);
  return store.transaction(async (tx, mysql) => {
    await tx.get(
      "SELECT id FROM users WHERE id=?" + (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    const coordinates = validCoordinatePair(
      input,
      await businessCoordinates(tx),
    );
    const count = await tx.get(
      "SELECT COUNT(*) count FROM addresses WHERE user_id=? AND active=1",
      user.id,
    );
    const isDefault = Number(count.count) === 0 || input.isDefault === true ? 1 : 0;
    if (isDefault)
      await tx.run(
        "UPDATE addresses SET is_default=0 WHERE user_id=? AND active=1",
        user.id,
      );
    const result = await tx.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude,is_default) VALUES(?,?,?,?,?,?)",
      user.id,
      label,
      detail,
      coordinates.latitude,
      coordinates.longitude,
      isDefault,
    );
    return { id: result.lastInsertRowid, isDefault: Boolean(isDefault) };
  });
}

export async function replaceAddress(user, id, input) {
  required(user, ["CUSTOMER"]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Alamat tidak valid");
  const { label, detail } = addressText(input);
  return store.transaction(async (tx, mysql) => {
    const previous = await tx.get(
      "SELECT id,latitude,longitude,is_default FROM addresses WHERE id=? AND user_id=? AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      id,
      user.id,
    );
    if (!previous) throw new DomainError("Alamat tidak ditemukan", 404);
    const coordinates = validCoordinatePair(input, {
      latitude: previous.latitude,
      longitude: previous.longitude,
    });
    const isDefault =
      input.isDefault === true || previous.is_default === 1 ? 1 : 0;
    if (isDefault)
      await tx.run(
        "UPDATE addresses SET is_default=0 WHERE user_id=? AND active=1",
        user.id,
      );
    await tx.run("UPDATE addresses SET active=0,is_default=0 WHERE id=?", id);
    const created = await tx.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude,is_default) VALUES(?,?,?,?,?,?)",
      user.id,
      label,
      detail,
      coordinates.latitude,
      coordinates.longitude,
      isDefault,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADDRESS_REPLACED",
      JSON.stringify({ previousId: id, newId: created.lastInsertRowid }),
    );
    return { id: created.lastInsertRowid, isDefault: Boolean(isDefault) };
  });
}

export async function setDefaultAddress(user, id) {
  required(user, ["CUSTOMER"]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Alamat tidak valid");
  return store.transaction(async (tx, mysql) => {
    await tx.get(
      "SELECT id FROM users WHERE id=?" + (mysql ? " FOR UPDATE" : ""),
      user.id,
    );
    const address = await tx.get(
      "SELECT id FROM addresses WHERE id=? AND user_id=? AND active=1",
      id,
      user.id,
    );
    if (!address) throw new DomainError("Alamat tidak ditemukan", 404);
    await tx.run(
      "UPDATE addresses SET is_default=0 WHERE user_id=? AND active=1",
      user.id,
    );
    await tx.run("UPDATE addresses SET is_default=1 WHERE id=?", id);
    return { id, isDefault: true };
  });
}

export async function removeAddress(user, id) {
  required(user, ["CUSTOMER"]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Alamat tidak valid");
  return store.transaction(async (tx, mysql) => {
    const address = await tx.get(
      "SELECT is_default FROM addresses WHERE id=? AND user_id=? AND active=1" +
        (mysql ? " FOR UPDATE" : ""),
      id,
      user.id,
    );
    if (!address) throw new DomainError("Alamat tidak ditemukan", 404);
    await tx.run("UPDATE addresses SET active=0,is_default=0 WHERE id=?", id);
    if (address.is_default === 1) {
      const replacement = await tx.get(
        "SELECT id FROM addresses WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 1",
        user.id,
      );
      if (replacement)
        await tx.run(
          "UPDATE addresses SET is_default=1 WHERE id=?",
          replacement.id,
        );
    }
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
  const name = String(input.name || "").trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizeCustomerPhone(input.phone);
  const birthDate = validateBirthDate(input.birthDate);
  const newPassword = String(input.newPassword || "");
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    (newPassword && (newPassword.length < 12 || newPassword.length > 128))
  )
    throw new DomainError("Data profil tidak valid");
  try {
    return await store.transaction(async (tx, mysql) => {
      const current = await tx.get(
        "SELECT password_hash FROM users WHERE id=? AND role='CUSTOMER'" +
          (mysql ? " FOR UPDATE" : ""),
        user.id,
      );
      if (!current) throw new DomainError("Akun tidak ditemukan", 404);
      if (
        newPassword &&
        !checkPassword(
          String(input.currentPassword || ""),
          current.password_hash,
        )
      )
        throw new DomainError("Password saat ini salah", 401);
      await tx.run(
        "UPDATE users SET name=?,email=?,phone=?,birth_date=?" +
          (newPassword ? ",password_hash=?" : "") +
          " WHERE id=?",
        ...(newPassword
          ? [name, email, phone, birthDate, hashPassword(newPassword), user.id]
          : [name, email, phone, birthDate, user.id]),
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
        user: { id: user.id, name, email, role: "CUSTOMER" },
        profile: { name, email, phone, birth_date: birthDate },
        passwordChanged: Boolean(newPassword),
      };
    });
  } catch (error) {
    if (
      error.code === "ER_DUP_ENTRY" ||
      /UNIQUE constraint failed/.test(error.message || "")
    )
      throw new DomainError("Email atau nomor HP sudah terdaftar");
    throw error;
  }
}
