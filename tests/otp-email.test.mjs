import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-otp-email-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(root, "warkost.db");
process.env.SESSION_SECRET =
  "otp-session-secret-with-more-than-thirty-two-bytes";
process.env.OTP_SECRET = "otp-hmac-secret-with-more-than-thirty-two-bytes";
process.env.EMAIL_TRANSPORT = "development";
process.env.OTP_OUTBOX_PATH = path.join(root, ".uat", "otp-outbox.json");

const { db } = await import("../lib/db.mjs");
const { authenticateCustomer, registerCustomer } =
  await import("../lib/customer-auth.mjs");
const { checkPassword, currentUser, issueSession } =
  await import("../lib/auth.mjs");
const {
  OTP_PURPOSES,
  requestPasswordReset,
  resendOtp,
  resetPassword,
  verifyPasswordResetOtp,
  verifyRegistrationOtp,
} = await import("../lib/otp.mjs");
const { emailTransportConfig, sendOtpEmail } = await import("../lib/email.mjs");

const database = db();
const password = "Password-Aman#2026";
const registration = (suffix) => ({
  name: `Pelanggan OTP ${suffix}`,
  email: `otp-${suffix}@example.test`,
  phone: `08123456${String(suffix).padStart(4, "0")}`,
  birthDate: "1996-09-18",
  password,
  passwordConfirmation: password,
  consent: true,
});
const outbox = () =>
  fs.existsSync(process.env.OTP_OUTBOX_PATH)
    ? JSON.parse(fs.readFileSync(process.env.OTP_OUTBOX_PATH, "utf8"))
    : [];
const latestCode = () =>
  outbox()
    .at(-1)
    .text.match(/\b\d{6}\b/)[0];

let activeUser;

test("registration OTP membuat pending account tanpa sesi lalu aktivasi tepat sekali", async () => {
  const result = await registerCustomer(registration(1));
  assert.equal(result.pending, true);
  assert.equal("otp" in result, false);
  assert.equal("user" in result, false);
  const pending = database
    .prepare(
      "SELECT id,name,email,role,active,email_verified_at,password_hash FROM users WHERE email=?",
    )
    .get("otp-1@example.test");
  assert.equal(pending.role, "CUSTOMER");
  assert.equal(pending.active, 0);
  assert.equal(pending.email_verified_at, null);
  assert.notEqual(pending.password_hash, password);
  assert.ok(checkPassword(password, pending.password_hash));
  await assert.rejects(issueSession(pending), /akun aktif/);

  const challenge = database
    .prepare(
      "SELECT otp_hash,attempts,consumed_at FROM otp_challenges WHERE public_id=?",
    )
    .get(result.challengeId);
  assert.equal(challenge.attempts, 0);
  assert.equal(challenge.consumed_at, null);
  assert.doesNotMatch(challenge.otp_hash, /^\d{6}$/);
  assert.equal(challenge.otp_hash.includes(latestCode()), false);

  const verified = await verifyRegistrationOtp({
    challengeId: result.challengeId,
    code: latestCode(),
  });
  assert.equal(verified.alreadyVerified, false);
  activeUser = verified.user;
  const activated = database
    .prepare("SELECT active,email_verified_at FROM users WHERE id=?")
    .get(activeUser.id);
  assert.equal(activated.active, 1);
  assert.ok(activated.email_verified_at);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM loyalty_accounts WHERE user_id=?")
      .get(activeUser.id).count,
    1,
  );

  const duplicate = await verifyRegistrationOtp({
    challengeId: result.challengeId,
    code: latestCode(),
  });
  assert.deepEqual(duplicate, { alreadyVerified: true });
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM users WHERE email=?")
      .get("otp-1@example.test").count,
    1,
  );
});

test("OTP salah, kedaluwarsa, batas percobaan, dan purpose isolation ditegakkan", async () => {
  const limited = await registerCustomer(registration(2));
  const correct = latestCode();
  for (let attempt = 1; attempt <= 4; attempt += 1)
    await assert.rejects(
      verifyRegistrationOtp({
        challengeId: limited.challengeId,
        code: "000001",
      }),
      /tidak valid/,
    );
  await assert.rejects(
    verifyRegistrationOtp({
      challengeId: limited.challengeId,
      code: "000001",
    }),
    /Batas percobaan/,
  );
  await assert.rejects(
    verifyRegistrationOtp({
      challengeId: limited.challengeId,
      code: correct,
    }),
    /Batas percobaan/,
  );
  assert.equal(
    database
      .prepare("SELECT attempts FROM otp_challenges WHERE public_id=?")
      .get(limited.challengeId).attempts,
    5,
  );

  const expired = await registerCustomer(registration(3));
  const expiredCode = latestCode();
  database
    .prepare("UPDATE otp_challenges SET expires_at=? WHERE public_id=?")
    .run(Date.now() - 1, expired.challengeId);
  await assert.rejects(
    verifyRegistrationOtp({
      challengeId: expired.challengeId,
      code: expiredCode,
    }),
    /kedaluwarsa/,
  );
  await assert.rejects(
    verifyPasswordResetOtp({
      challengeId: expired.challengeId,
      code: expiredCode,
    }),
    /tidak valid/,
  );
});

test("resend cooldown berlaku, OTP lama invalid, dan OTP terbaru aktif", async () => {
  const startedAt = Date.now();
  const pending = await registerCustomer(registration(4));
  const oldCode = latestCode();
  await assert.rejects(
    resendOtp(
      {
        challengeId: pending.challengeId,
        purpose: OTP_PURPOSES.REGISTRATION,
      },
      startedAt + 10_000,
    ),
    /Silakan tunggu/,
  );
  const resent = await resendOtp(
    {
      challengeId: pending.challengeId,
      purpose: OTP_PURPOSES.REGISTRATION,
    },
    startedAt + 61_000,
  );
  assert.notEqual(resent.challengeId, pending.challengeId);
  assert.equal(
    database
      .prepare("SELECT consumed_at FROM otp_challenges WHERE public_id=?")
      .get(pending.challengeId).consumed_at !== null,
    true,
  );
  await assert.rejects(
    verifyRegistrationOtp({
      challengeId: pending.challengeId,
      code: oldCode,
    }),
    /sudah digunakan/,
  );
  const verified = await verifyRegistrationOtp(
    { challengeId: resent.challengeId, code: latestCode() },
    startedAt + 62_000,
  );
  assert.equal(verified.user.email, "otp-4@example.test");
});

test("forgot password anti-enumeration, reset aman, dan seluruh sesi lama dicabut", async () => {
  const missingOutboxCount = outbox().length;
  const missing = await requestPasswordReset("tidak-ada@example.test");
  assert.equal(
    missing.message,
    "Jika akun ditemukan, kode verifikasi telah dikirim ke email yang terdaftar.",
  );
  assert.equal(missing.destination, "email terdaftar");
  assert.equal(outbox().length, missingOutboxCount);

  const valid = await requestPasswordReset("otp-1@example.test");
  assert.deepEqual(Object.keys(valid).sort(), Object.keys(missing).sort());
  assert.equal(valid.destination, missing.destination);
  const repeated = await requestPasswordReset("otp-1@example.test");
  assert.equal(repeated.message, missing.message);
  assert.equal(repeated.destination, missing.destination);
  const resetCode = latestCode();
  await assert.rejects(
    verifyPasswordResetOtp({
      challengeId: valid.challengeId,
      code: "123456",
    }),
    /tidak valid/,
  );
  await assert.rejects(
    verifyRegistrationOtp({
      challengeId: valid.challengeId,
      code: resetCode,
    }),
    /tidak valid/,
  );
  const verified = await verifyPasswordResetOtp({
    challengeId: valid.challengeId,
    code: resetCode,
  });
  assert.ok(verified.resetToken);
  assert.equal("otp" in verified, false);
  const session = await issueSession(activeUser);
  const request = {
    cookies: {
      get: (name) => (name === "wb_session" ? { value: session } : null),
    },
  };
  assert.equal((await currentUser(request)).id, activeUser.id);

  const newPassword = "Password-Baru#2026";
  await resetPassword({
    resetToken: verified.resetToken,
    password: newPassword,
    passwordConfirmation: newPassword,
  });
  assert.equal(await currentUser(request), null);
  await assert.rejects(
    authenticateCustomer("otp-1@example.test", password),
    /password salah/,
  );
  assert.equal(
    (await authenticateCustomer("otp-1@example.test", newPassword)).id,
    activeUser.id,
  );
  await assert.rejects(
    resetPassword({
      resetToken: verified.resetToken,
      password: "Password-Lain#2026",
      passwordConfirmation: "Password-Lain#2026",
    }),
    /tidak valid atau kedaluwarsa/,
  );
});

test("password reset OTP expired ditolak", async () => {
  const reset = await requestPasswordReset("otp-4@example.test");
  const code = latestCode();
  database
    .prepare("UPDATE otp_challenges SET expires_at=? WHERE public_id=?")
    .run(Date.now() - 1, reset.challengeId);
  await assert.rejects(
    verifyPasswordResetOtp({ challengeId: reset.challengeId, code }),
    /kedaluwarsa/,
  );
});

test("transport development lokal dan konfigurasi SMTP production gagal aman tanpa secret", async () => {
  const before = outbox().length;
  await sendOtpEmail({
    to: "mail@example.test",
    purpose: OTP_PURPOSES.REGISTRATION,
    otp: "654321",
    expiresMinutes: 10,
  });
  assert.equal(outbox().length, before + 1);
  assert.match(outbox().at(-1).text, /Warkost Bahagia/);
  assert.match(outbox().at(-1).text, /berlaku 10 menit/);
  assert.doesNotMatch(outbox().at(-1).text, /password|session token/i);
  assert.throws(
    () =>
      emailTransportConfig({
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "development",
      }),
    /tidak boleh|wajib memakai/,
  );
  assert.throws(
    () => emailTransportConfig({ NODE_ENV: "production" }),
    /SMTP_HOST/,
  );
  const production = emailTransportConfig({
    NODE_ENV: "production",
    EMAIL_TRANSPORT: "smtp",
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASS: "smtp-password",
    SMTP_FROM: "Warkost <noreply@example.test>",
  });
  assert.equal(production.mode, "smtp");
  assert.equal(production.secure, false);
});

test("API dan UI mengikat OTP nyata tanpa mengekspos SMTP atau debug stage", () => {
  const route = fs.readFileSync(
    new URL("../app/api/[action]/route.js", import.meta.url),
    "utf8",
  );
  const page = fs.readFileSync(
    new URL("../app/page.js", import.meta.url),
    "utf8",
  );
  const envExample = fs.readFileSync(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  assert.match(route, /verifyRegistrationOtp/);
  assert.match(route, /verifyPasswordResetOtp/);
  assert.doesNotMatch(route, /otp:\s*result/);
  assert.doesNotMatch(page, /SMTP_PASS|OTP_SECRET/);
  assert.match(page, /autoComplete="one-time-code"/);
  assert.match(page, /Kirim ulang dalam/);
  assert.match(page, /Atur Ulang Password/);
  assert.doesNotMatch(page, />\s*(Intro|OTP|Selesai)\s*<\/button>/);
  assert.match(envExample, /^#?\s*SMTP_HOST=/m);
  assert.match(envExample, /^#?\s*SMTP_PASS=/m);
  assert.doesNotMatch(envExample, /smtp-password|password-asli/i);
});
