import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "customer-batch-b-")),
  "data.db",
);
process.env.SESSION_SECRET =
  "customer-batch-b-test-secret-more-than-32-characters";
process.env.OTP_SECRET = "customer-batch-b-otp-secret-more-than-32-characters";
process.env.EMAIL_TRANSPORT = "development";
process.env.OTP_OUTBOX_PATH = path.join(
  path.dirname(process.env.DATABASE_PATH),
  "otp-outbox.json",
);

const { db } = await import("../lib/db.mjs");
const { checkPassword } = await import("../lib/auth.mjs");
const { authenticateCustomer, registerCustomer, validateRegistration } =
  await import("../lib/customer-auth.mjs");
const { verifyRegistrationOtp } = await import("../lib/otp.mjs");

const database = db();
const validRegistration = {
  name: "Customer Batch B",
  email: "batch-b@example.test",
  phone: "0812 3456 7890",
  birthDate: "1996-08-17",
  password: "password-customer-aman",
  passwordConfirmation: "password-customer-aman",
  consent: true,
};

test("registrasi menyimpan profil wajib sebagai pending dan mengaktifkan melalui OTP", async () => {
  const result = await registerCustomer(validRegistration);
  assert.equal(result.pending, true);
  assert.equal("otp" in result, false);
  const stored = database
    .prepare(
      "SELECT id,name,email,phone,birth_date,password_hash,terms_accepted_at,active,email_verified_at FROM users WHERE email=?",
    )
    .get(validRegistration.email);
  assert.equal(stored.phone, "6281234567890");
  assert.equal(stored.birth_date, "1996-08-17");
  assert.equal(stored.active, 0);
  assert.equal(stored.email_verified_at, null);
  assert.ok(stored.terms_accepted_at);
  assert.notEqual(stored.password_hash, validRegistration.password);
  assert.ok(checkPassword(validRegistration.password, stored.password_hash));
  const outbox = JSON.parse(
    fs.readFileSync(process.env.OTP_OUTBOX_PATH, "utf8"),
  );
  const code = outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  await verifyRegistrationOtp({ challengeId: result.challengeId, code });
});

test("login menerima email atau nomor HP dengan password server-side", async () => {
  const byEmail = await authenticateCustomer(
    "batch-b@example.test",
    validRegistration.password,
  );
  const byPhone = await authenticateCustomer(
    "081234567890",
    validRegistration.password,
  );
  assert.equal(byEmail.id, byPhone.id);
  await assert.rejects(
    authenticateCustomer("081234567890", "password-salah"),
    /password salah/,
  );
});

test("registrasi menolak field wajib, konfirmasi, tanggal lahir, dan consent invalid", () => {
  assert.throws(
    () =>
      validateRegistration({
        ...validRegistration,
        passwordConfirmation: "berbeda",
      }),
    /Konfirmasi password/,
  );
  assert.throws(
    () => validateRegistration({ ...validRegistration, consent: false }),
    /Persetujuan/,
  );
  assert.throws(
    () =>
      validateRegistration({ ...validRegistration, birthDate: "2099-01-01" }),
    /Tanggal lahir/,
  );
  assert.throws(
    () => validateRegistration({ ...validRegistration, phone: "123" }),
    /Nomor HP/,
  );
});

test("registrasi duplicate email/phone tidak membuat akun kedua", async () => {
  await assert.rejects(
    registerCustomer({ ...validRegistration, email: "other@example.test" }),
    /sudah terdaftar/,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) count FROM users WHERE phone='6281234567890'")
      .get().count,
    1,
  );
});

test("kontrak UI tidak mengekspos social login atau input koordinat mentah dan memakai OTP nyata", () => {
  const page = fs.readFileSync(
    new URL("../app/page.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    page,
    /Google Sign-In|Masuk dengan Google|Apple Sign-In|Masuk dengan Apple/,
  );
  assert.match(page, /name="code"/);
  assert.match(page, /password-reset-request/);
  assert.doesNotMatch(page, /name="latitude"\s+type="number"/);
  assert.doesNotMatch(page, /name="longitude"\s+type="number"/);
  assert.match(page, /name="latitude" type="hidden"/);
  assert.match(page, /Email atau Nomor HP/);
  assert.match(page, /<strong>Voucher &amp; Poin<\/strong>/);
  assert.match(page, /<strong>Akun &amp; Alamat<\/strong>/);
  assert.match(page, /<strong>FAQ<\/strong>/);

  const mobileNavigation = page.match(
    /<nav className="mobile-customer-nav"[\s\S]*?<\/nav>/,
  )?.[0];
  assert.ok(mobileNavigation);
  assert.doesNotMatch(mobileNavigation, /aria-label="Bantuan"/);
  assert.match(page, /quick-account-menu[\s\S]*?<span>Bantuan<\/span>/);

  const style = fs.readFileSync(
    new URL("../app/style.css", import.meta.url),
    "utf8",
  );
  assert.match(style, /\.quick-sheet\s*{[\s\S]*?width:\s*min\(460px, 100%\)/);
  assert.match(style, /\.support-sheet\s*{[\s\S]*?height:\s*100dvh/);
  assert.match(
    style,
    /\.mobile-customer-nav\s*{[\s\S]*?grid-template-columns:\s*repeat\(3, 1fr\)/,
  );
});
