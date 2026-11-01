import { authStage } from "./auth-timing.mjs";
import * as store from "./store.mjs";
import { checkPasswordAsync, hashPasswordAsync } from "./auth.mjs";
import { normalizeCustomerPhone, validateBirthDate } from "./account.mjs";
import { DomainError } from "./domain.mjs";
import { issueRegistrationOtp } from "./otp.mjs";
import { isGuestEmail } from "./customer-kind.mjs";

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
    isGuestEmail(email) ||
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
  const data = authStage("register.validate", () =>
    validateRegistration(input),
  );
  const passwordHash = await authStage("register.password_hash", () =>
    hashPasswordAsync(data.password),
  );
  let user;
  try {
    user = await authStage("register.customer_transaction", () =>
      store.transaction(async (tx, mysql) => {
        const existing = await authStage("register.customer_lookup", () =>
          tx.get(
            `SELECT id,name,email,phone,role,active,email_verified_at FROM users WHERE email=? OR phone=? LIMIT 1${mysql ? " FOR UPDATE" : ""}`,
            data.email,
            data.phone,
          ),
        );
        if (existing) {
          if (
            existing.role !== "CUSTOMER" ||
            existing.active === 1 ||
            existing.email_verified_at ||
            existing.email !== data.email ||
            existing.phone !== data.phone
          )
            throw new DomainError("Email atau nomor HP sudah terdaftar");
          await authStage("register.customer_write", () =>
            tx.run(
              "UPDATE users SET name=?,birth_date=?,password_hash=?,terms_accepted_at=CURRENT_TIMESTAMP WHERE id=?",
              data.name,
              data.birthDate,
              passwordHash,
              existing.id,
            ),
          );
          return {
            id: existing.id,
            name: data.name,
            email: data.email,
            role: "CUSTOMER",
          };
        }
        const created = await authStage("register.customer_write", () =>
          tx.run(
            "INSERT INTO users(name,email,phone,birth_date,password_hash,role,terms_accepted_at,active,email_verified_at) VALUES(?,?,?,?,?,'CUSTOMER',CURRENT_TIMESTAMP,0,NULL)",
            data.name,
            data.email,
            data.phone,
            data.birthDate,
            passwordHash,
          ),
        );
        return {
          id: created.lastInsertRowid,
          name: data.name,
          email: data.email,
          role: "CUSTOMER",
        };
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (
      error.code === "ER_DUP_ENTRY" ||
      /UNIQUE constraint failed/.test(error.message || "")
    )
      throw new DomainError("Email atau nomor HP sudah terdaftar");
    throw error;
  }
  const challenge = await issueRegistrationOtp(user);
  return {
    pending: true,
    message: "Kode verifikasi telah dikirim ke email Anda.",
    ...challenge,
  };
}

export async function authenticateCustomer(identifier, password) {
  const raw = String(identifier || "").trim();
  let account;
  if (raw.includes("@")) {
    account = await authStage("login.user_lookup", () =>
      store.get("SELECT * FROM users WHERE email=?", raw.toLowerCase()),
    );
  } else {
    let phone;
    try {
      phone = normalizeCustomerPhone(raw);
    } catch {
      throw new DomainError("Email/nomor HP atau password salah", 401);
    }
    account = await authStage("login.user_lookup", () =>
      store.get("SELECT * FROM users WHERE phone=?", phone),
    );
  }
  if (
    !account ||
    account.active !== 1 ||
    isGuestEmail(account.email) ||
    !(await authStage("login.password_verify", () =>
      checkPasswordAsync(String(password || ""), account.password_hash),
    ))
  )
    throw new DomainError("Email/nomor HP atau password salah", 401);
  return account;
}
