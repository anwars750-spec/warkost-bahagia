import test from "node:test";
import assert from "node:assert/strict";
import {
  stagingOrigin,
  validateStagingEnvironment,
} from "../lib/staging-environment.mjs";

const valid = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "staging",
  DATABASE_URL: "mysql://user:password@localhost:3306/warkost_staging",
  SESSION_SECRET: "s".repeat(32),
  OTP_SECRET: "o".repeat(32),
  EMAIL_TRANSPORT: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "staging-user",
  SMTP_PASS: "staging-smtp-password",
  SMTP_FROM: "Warkost Bahagia <no-reply@example.com>",
  STAGING_UAT_PASSWORD: "staging-password-unique",
  UPLOAD_DIRECTORY: "/home/app/storage/uploads",
  BACKUP_DIRECTORY: "/home/app/storage/backups",
  PORT: "3000",
};

test("konfigurasi staging yang lengkap diterima", () => {
  assert.deepEqual(validateStagingEnvironment(valid), []);
});

test("staging menolak SQLite, path relatif, password lemah, dan port invalid", () => {
  const errors = validateStagingEnvironment({
    ...valid,
    DATABASE_URL: "",
    DATABASE_PATH: "/tmp/app.db",
    SESSION_SECRET: "CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME",
    OTP_SECRET: "short",
    EMAIL_TRANSPORT: "development",
    SMTP_HOST: "",
    SMTP_PORT: "70000",
    SMTP_SECURE: "invalid",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "",
    STAGING_UAT_PASSWORD: "pendek",
    UPLOAD_DIRECTORY: "./uploads",
    PORT: "70000",
  });
  for (const expected of [
    "DATABASE_URL",
    "DATABASE_PATH",
    "SESSION_SECRET",
    "OTP_SECRET",
    "EMAIL_TRANSPORT",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "STAGING_UAT_PASSWORD",
    "UPLOAD_DIRECTORY",
    "PORT",
  ])
    assert.ok(errors.some((message) => message.includes(expected)));
});

test("origin staging wajib HTTPS publik dan tanpa credential atau path", () => {
  assert.equal(
    stagingOrigin("https://staging.example.com"),
    "https://staging.example.com",
  );
  for (const value of [
    "http://staging.example.com",
    "https://localhost",
    "https://user:pass@staging.example.com",
    "https://staging.example.com/path",
  ])
    assert.throws(() => stagingOrigin(value), /HTTPS publik/);
});
