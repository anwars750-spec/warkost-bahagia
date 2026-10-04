import crypto from "node:crypto";
import * as store from "./store.mjs";
import { hashPassword, sessionSecret } from "./auth.mjs";
import { normalizeCustomerPhone } from "./account.mjs";
import { DomainError } from "./domain.mjs";
import { sendOtpEmail } from "./email.mjs";

export const OTP_PURPOSES = Object.freeze({
  REGISTRATION: "REGISTRATION",
  PASSWORD_RESET: "PASSWORD_RESET",
});
export const OTP_EXPIRY_MS = 10 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_EXPIRY_MS = 10 * 60_000;
const RESET_GENERIC_MESSAGE =
  "Jika akun ditemukan, kode verifikasi telah dikirim ke email yang terdaftar.";

function otpSecret() {
  const value = process.env.OTP_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!value || Buffer.byteLength(value) < 32)
  )
    throw Error("OTP_SECRET harus diisi minimal 32 byte pada produksi");
  return value || sessionSecret();
}

function hashOtp(userId, purpose, otp) {
  return crypto
    .createHmac("sha256", otpSecret())
    .update(`${userId}:${purpose}:${otp}`)
    .digest("hex");
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function secureEqual(left, right) {
  const one = Buffer.from(String(left || ""));
  const two = Buffer.from(String(right || ""));
  return one.length === two.length && crypto.timingSafeEqual(one, two);
}

function otpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function publicChallengeId() {
  return crypto.randomUUID();
}

export function maskEmail(value) {
  const [local, domain] = String(value || "").split("@");
  if (!local || !domain) return "email terdaftar";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function challengeResponse(challenge, destination) {
  return {
    challengeId: challenge.publicId,
    destination,
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  };
}

async function markDeliveryFailure(challengeId) {
  await store.run(
    "UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE public_id=? AND consumed_at IS NULL",
    challengeId,
  );
}

async function createChallenge(user, purpose, now = Date.now()) {
  const otp = otpCode();
  const challenge = await store.transaction(async (tx, mysql) => {
    const previous = await tx.get(
      `SELECT id,last_sent_at FROM otp_challenges WHERE user_id=? AND purpose=? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1${mysql ? " FOR UPDATE" : ""}`,
      user.id,
      purpose,
    );
    if (
      previous &&
      now - Number(previous.last_sent_at) < OTP_RESEND_COOLDOWN_MS
    )
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil(
          (OTP_RESEND_COOLDOWN_MS - (now - Number(previous.last_sent_at))) /
            1000,
        ),
      };
    await tx.run(
      "UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE user_id=? AND purpose=? AND consumed_at IS NULL",
      user.id,
      purpose,
    );
    const publicId = publicChallengeId();
    await tx.run(
      "INSERT INTO otp_challenges(public_id,user_id,purpose,otp_hash,expires_at,attempts,last_sent_at) VALUES(?,?,?,?,?,0,?)",
      publicId,
      user.id,
      purpose,
      hashOtp(user.id, purpose, otp),
      now + OTP_EXPIRY_MS,
      now,
    );
    return { publicId, otp };
  });
  if (challenge.blocked)
    throw new DomainError(
      `Silakan tunggu ${challenge.retryAfterSeconds} detik sebelum meminta kode baru.`,
      429,
    );
  try {
    await sendOtpEmail({
      to: user.email,
      purpose,
      otp: challenge.otp,
      expiresMinutes: OTP_EXPIRY_MS / 60_000,
    });
  } catch (error) {
    await markDeliveryFailure(challenge.publicId);
    throw error;
  }
  return challengeResponse(challenge, maskEmail(user.email));
}

export async function issueRegistrationOtp(user, now = Date.now()) {
  return createChallenge(user, OTP_PURPOSES.REGISTRATION, now);
}

async function findPasswordResetAccount(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  if (raw.includes("@"))
    return store.get(
      "SELECT id,email FROM users WHERE email=? AND role='CUSTOMER' AND active=1",
      raw.toLowerCase(),
    );
  let phone;
  try {
    phone = normalizeCustomerPhone(raw);
  } catch {
    return null;
  }
  return store.get(
    "SELECT id,email FROM users WHERE phone=? AND role='CUSTOMER' AND active=1",
    phone,
  );
}

export async function requestPasswordReset(identifier, now = Date.now()) {
  const user = await findPasswordResetAccount(identifier);
  let issued = {
    challengeId: publicChallengeId(),
    destination: "email terdaftar",
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  };
  if (user) {
    try {
      issued = await createChallenge(user, OTP_PURPOSES.PASSWORD_RESET, now);
      issued.destination = "email terdaftar";
    } catch (error) {
      if (!(error instanceof DomainError) || error.status !== 429) throw error;
    }
  }
  return { message: RESET_GENERIC_MESSAGE, ...issued };
}

export async function resendOtp({ challengeId, purpose }, now = Date.now()) {
  if (!Object.values(OTP_PURPOSES).includes(purpose))
    throw new DomainError("Tujuan OTP tidak valid");
  const challenge = await store.get(
    "SELECT c.user_id,u.email,u.active,u.email_verified_at FROM otp_challenges c JOIN users u ON u.id=c.user_id WHERE c.public_id=? AND c.purpose=?",
    String(challengeId || ""),
    purpose,
  );
  if (!challenge) {
    if (purpose === OTP_PURPOSES.PASSWORD_RESET)
      return {
        message: RESET_GENERIC_MESSAGE,
        challengeId: publicChallengeId(),
        destination: "email terdaftar",
        expiresInSeconds: OTP_EXPIRY_MS / 1000,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      };
    throw new DomainError("Permintaan verifikasi tidak ditemukan", 404);
  }
  if (
    purpose === OTP_PURPOSES.REGISTRATION &&
    (challenge.active === 1 || challenge.email_verified_at)
  )
    throw new DomainError("Akun sudah aktif", 409);
  if (purpose === OTP_PURPOSES.PASSWORD_RESET && challenge.active !== 1)
    return {
      message: RESET_GENERIC_MESSAGE,
      challengeId: publicChallengeId(),
      destination: "email terdaftar",
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    };
  const issued = await createChallenge(
    { id: challenge.user_id, email: challenge.email },
    purpose,
    now,
  );
  return {
    message: "Kode baru telah dikirim ke email Anda.",
    ...issued,
    destination:
      purpose === OTP_PURPOSES.PASSWORD_RESET
        ? "email terdaftar"
        : issued.destination,
  };
}

function codeValidation(code) {
  const normalized = String(code || "").trim();
  if (!/^\d{6}$/.test(normalized))
    throw new DomainError("Kode OTP harus terdiri dari 6 digit");
  return normalized;
}

async function verifyChallenge({ challengeId, purpose, code }, now) {
  const otp = codeValidation(code);
  const result = await store.transaction(async (tx, mysql) => {
    const row = await tx.get(
      `SELECT c.*,u.name,u.email,u.role,u.active,u.email_verified_at FROM otp_challenges c JOIN users u ON u.id=c.user_id WHERE c.public_id=? AND c.purpose=?${mysql ? " FOR UPDATE" : ""}`,
      String(challengeId || ""),
      purpose,
    );
    if (!row) return { error: "Kode OTP tidak valid", status: 401 };
    if (row.consumed_at || row.verified_at)
      return { error: "Kode OTP sudah digunakan", status: 409 };
    if (Number(row.expires_at) < now)
      return { error: "Kode OTP sudah kedaluwarsa", status: 410 };
    if (Number(row.attempts) >= OTP_MAX_ATTEMPTS)
      return { error: "Batas percobaan OTP telah tercapai", status: 429 };
    if (!secureEqual(row.otp_hash, hashOtp(row.user_id, purpose, otp))) {
      const attempts = Number(row.attempts) + 1;
      await tx.run(
        "UPDATE otp_challenges SET attempts=? WHERE id=?",
        attempts,
        row.id,
      );
      return {
        error:
          attempts >= OTP_MAX_ATTEMPTS
            ? "Batas percobaan OTP telah tercapai"
            : "Kode OTP tidak valid",
        status: attempts >= OTP_MAX_ATTEMPTS ? 429 : 401,
      };
    }
    return { row, tx };
  });
  if (result.error) throw new DomainError(result.error, result.status);
  return result.row;
}

export async function verifyRegistrationOtp(input, now = Date.now()) {
  const otp = codeValidation(input.code);
  const result = await store.transaction(async (tx, mysql) => {
    const row = await tx.get(
      `SELECT c.*,u.name,u.email,u.role,u.active,u.email_verified_at FROM otp_challenges c JOIN users u ON u.id=c.user_id WHERE c.public_id=? AND c.purpose='REGISTRATION'${mysql ? " FOR UPDATE" : ""}`,
      String(input.challengeId || ""),
    );
    if (!row) return { error: "Kode OTP tidak valid", status: 401 };
    if (row.consumed_at) {
      if (row.active === 1 && row.email_verified_at)
        return { alreadyVerified: true };
      return { error: "Kode OTP sudah digunakan", status: 409 };
    }
    if (Number(row.expires_at) < now)
      return { error: "Kode OTP sudah kedaluwarsa", status: 410 };
    if (Number(row.attempts) >= OTP_MAX_ATTEMPTS)
      return { error: "Batas percobaan OTP telah tercapai", status: 429 };
    if (
      !secureEqual(
        row.otp_hash,
        hashOtp(row.user_id, OTP_PURPOSES.REGISTRATION, otp),
      )
    ) {
      const attempts = Number(row.attempts) + 1;
      await tx.run(
        "UPDATE otp_challenges SET attempts=? WHERE id=?",
        attempts,
        row.id,
      );
      return {
        error:
          attempts >= OTP_MAX_ATTEMPTS
            ? "Batas percobaan OTP telah tercapai"
            : "Kode OTP tidak valid",
        status: attempts >= OTP_MAX_ATTEMPTS ? 429 : 401,
      };
    }
    await tx.run(
      "UPDATE users SET active=1,email_verified_at=CURRENT_TIMESTAMP WHERE id=? AND active=0 AND email_verified_at IS NULL",
      row.user_id,
    );
    await tx.run(
      "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
      row.user_id,
    );
    await tx.run(
      "UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL",
      row.id,
    );
    return {
      user: {
        id: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
      },
      alreadyVerified: false,
    };
  });
  if (result.error) throw new DomainError(result.error, result.status);
  return result;
}

export async function verifyPasswordResetOtp(input, now = Date.now()) {
  const row = await verifyChallenge(
    {
      challengeId: input.challengeId,
      purpose: OTP_PURPOSES.PASSWORD_RESET,
      code: input.code,
    },
    now,
  );
  const resetToken = crypto.randomBytes(32).toString("base64url");
  const updated = await store.run(
    "UPDATE otp_challenges SET verified_at=CURRENT_TIMESTAMP,reset_token_hash=?,reset_expires_at=? WHERE id=? AND verified_at IS NULL AND consumed_at IS NULL",
    hashResetToken(resetToken),
    now + RESET_TOKEN_EXPIRY_MS,
    row.id,
  );
  if (updated.changes !== 1)
    throw new DomainError("Kode OTP sudah digunakan", 409);
  return { resetToken, expiresInSeconds: RESET_TOKEN_EXPIRY_MS / 1000 };
}

export async function resetPassword(input, now = Date.now()) {
  const password = String(input.password || "");
  if (password.length < 10 || password.length > 128)
    throw new DomainError("Password baru harus 10–128 karakter");
  if (password !== String(input.passwordConfirmation || ""))
    throw new DomainError("Konfirmasi password tidak cocok");
  const tokenHash = hashResetToken(String(input.resetToken || ""));
  const result = await store.transaction(async (tx, mysql) => {
    const row = await tx.get(
      `SELECT id,user_id,reset_expires_at,consumed_at FROM otp_challenges WHERE purpose='PASSWORD_RESET' AND reset_token_hash=?${mysql ? " FOR UPDATE" : ""}`,
      tokenHash,
    );
    if (
      !row ||
      row.consumed_at ||
      !row.reset_expires_at ||
      Number(row.reset_expires_at) < now
    )
      return { error: "Sesi reset password tidak valid atau kedaluwarsa" };
    const changed = await tx.run(
      "UPDATE users SET password_hash=? WHERE id=? AND role='CUSTOMER' AND active=1",
      hashPassword(password),
      row.user_id,
    );
    if (changed.changes !== 1)
      return { error: "Sesi reset password tidak valid atau kedaluwarsa" };
    await tx.run(
      "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
      row.user_id,
    );
    await tx.run(
      "UPDATE otp_challenges SET consumed_at=CURRENT_TIMESTAMP,reset_token_hash=NULL WHERE id=? AND consumed_at IS NULL",
      row.id,
    );
    return { ok: true };
  });
  if (result.error) throw new DomainError(result.error, 401);
  return result;
}
