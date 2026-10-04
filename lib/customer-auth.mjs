import * as store from "./store.mjs";
import { checkPassword, hashPassword } from "./auth.mjs";
import { normalizeCustomerPhone, validateBirthDate } from "./account.mjs";
import { DomainError } from "./domain.mjs";

export function validateRegistration(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizeCustomerPhone(input.phone);
  const birthDate = validateBirthDate(input.birthDate);
  const password = String(input.password || "");
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 10 ||
    password.length > 128
  )
    throw new DomainError(
      "Nama, email, nomor HP, atau password tidak valid (minimal 10 karakter)",
    );
  if (password !== String(input.passwordConfirmation || ""))
    throw new DomainError("Konfirmasi password tidak cocok");
  if (input.consent !== true)
    throw new DomainError("Persetujuan Syarat & Ketentuan wajib diberikan");
  return { name, email, phone, birthDate, password };
}

export async function registerCustomer(input) {
  const data = validateRegistration(input);
  try {
    const id = await store.transaction(async (tx) => {
      const created = await tx.run(
        "INSERT INTO users(name,email,phone,birth_date,password_hash,role,terms_accepted_at) VALUES(?,?,?,?,?,'CUSTOMER',CURRENT_TIMESTAMP)",
        data.name,
        data.email,
        data.phone,
        data.birthDate,
        hashPassword(data.password),
      );
      await tx.run(
        "INSERT INTO loyalty_accounts(user_id) VALUES(?)",
        created.lastInsertRowid,
      );
      return created.lastInsertRowid;
    });
    return {
      user: {
        id,
        name: data.name,
        email: data.email,
        role: "CUSTOMER",
      },
      emailVerification: "NOT_CONFIGURED",
    };
  } catch (error) {
    if (
      error.code === "ER_DUP_ENTRY" ||
      /UNIQUE constraint failed/.test(error.message || "")
    )
      throw new DomainError("Email atau nomor HP sudah terdaftar");
    throw error;
  }
}

export async function authenticateCustomer(identifier, password) {
  const raw = String(identifier || "").trim();
  let account;
  if (raw.includes("@")) {
    account = await store.get(
      "SELECT * FROM users WHERE email=?",
      raw.toLowerCase(),
    );
  } else {
    let phone;
    try {
      phone = normalizeCustomerPhone(raw);
    } catch {
      throw new DomainError("Email/nomor HP atau password salah", 401);
    }
    account = await store.get("SELECT * FROM users WHERE phone=?", phone);
  }
  if (
    !account ||
    account.active !== 1 ||
    !checkPassword(String(password || ""), account.password_hash)
  )
    throw new DomainError("Email/nomor HP atau password salah", 401);
  return account;
}
