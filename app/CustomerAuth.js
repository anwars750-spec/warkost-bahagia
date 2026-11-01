"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { validateAuthForm } from "./customer-auth-form.mjs";

// App owns auth mode, challenge and session. Only the selected form mounts.
export default function CustomerAuth({
  mode,
  setMode,
  otpFlow,
  setOtpFlow,
  passwordVisibility,
  togglePassword,
  busy,
  error,
  setError,
  otpResendRemaining,
  submitAuth,
  submitGuest,
  submitForgotPassword,
  submitOtp,
  submitNewPassword,
  resendCurrentOtp,
  continueAfterRegistration,
  storyIcons,
}) {
  const feedback = useRef(null);
  useEffect(() => {
    if (!error) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "center" });
  }, [error]);
  function validateSubmit(event) {
    const values = Object.fromEntries(new FormData(event.target));
    values.consent = values.consent === "on";
    const problem = validateAuthForm(mode, values);
    if (busy || problem) {
      event.preventDefault();
      event.stopPropagation();
      if (problem) setError(problem.message);
    }
  }
  return (
    <section
      className="auth-onboarding"
      data-auth-mode={mode}
      aria-busy={busy}
      onSubmitCapture={validateSubmit}
      onClickCapture={(event) => {
        if (busy && event.target.closest("button")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      aria-label="Onboarding pelanggan Warkost"
    >
      {["login", "register", "guest"].includes(mode) ? (
        <div className="auth-mobile-switch" aria-label="Pilih formulir akun">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Masuk
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            onClick={() => setMode("register")}
          >
            Daftar
          </button>
          <button
            className={mode === "guest" ? "active" : ""}
            type="button"
            onClick={() => setMode("guest")}
          >
            Guest
          </button>
        </div>
      ) : (
        <div className="auth-flow-back">
          <button
            type="button"
            onClick={() => {
              setOtpFlow(null);
              setMode("login");
            }}
          >
            ← Kembali ke Masuk
          </button>
        </div>
      )}

      <article className="auth-story-card">
        <div className="auth-story-copy">
          <span className="auth-story-badge">WARKOST BAHAGIA</span>
          <h1>Makan Enak Lebih Mudah di Warkost Bahagia</h1>
          <p>
            Pilih menu favorit, nikmati promo, dan tunggu pesanan hangat sampai
            di tujuan.
          </p>
          <ul className="auth-benefits">
            <li>
              {storyIcons.food}
              <span>
                <strong>Pesan Makanan Favorit</strong>
                <small>Menu hangat dari dapur Warkost</small>
              </span>
            </li>
            <li>
              {storyIcons.ticket}
              <span>
                <strong>Banyak Promo &amp; Loyalty</strong>
                <small>Lebih hemat di setiap pesanan</small>
              </span>
            </li>
            <li>
              {storyIcons.truck}
              <span>
                <strong>Diantar Sampai Tujuan</strong>
                <small>Pengantaran aman dan terpantau</small>
              </span>
            </li>
          </ul>
        </div>
        <div className="auth-story-visual">
          <Image
            src="/demo/promo-warkost.webp"
            alt="Menu makanan dan minuman Warkost Bahagia"
            fill
            sizes="(max-width: 760px) 100vw, 34vw"
            priority
          />
          <span>Hangat · Lezat · Bahagia</span>
        </div>
      </article>

      {mode === "guest" && (
        <article className="auth-card auth-guest-card active">
          <div className="auth-card-heading compact">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">CHECKOUT TANPA AKUN</span>
            <h2>Lanjut sebagai Guest</h2>
            <p>
              Pesan tanpa membuat akun. Voucher dan loyalty khusus member tidak
              tersedia.
            </p>
          </div>
          <form noValidate aria-busy={busy} onSubmit={submitGuest}>
            <label>
              Nama Pemesan
              <input
                name="name"
                required
                minLength="2"
                maxLength="80"
                autoComplete="name"
                placeholder="Nama penerima pesanan"
              />
            </label>
            <div className="guest-benefit-note">
              {storyIcons.truck}
              <span>
                <strong>Benefit ongkir tetap berlaku</strong>
                <small>
                  Gratis hingga 3 km dan berbayar sampai maksimal 10 km.
                </small>
              </span>
            </div>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Menyiapkan…" : "Lanjut sebagai Guest"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              onClick={() => setMode("login")}
            >
              Sudah punya akun? Masuk
            </button>
          </form>
        </article>
      )}

      {mode === "login" && (
        <article className="auth-card auth-login-card active">
          <div className="auth-card-heading">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">SELAMAT DATANG KEMBALI</span>
            <h2>Masuk ke Akun</h2>
            <p>Masuk untuk melanjutkan pesanan dan melihat loyalty.</p>
          </div>
          <form
            noValidate
            aria-busy={busy}
            onSubmit={(event) => submitAuth(event, "login")}
          >
            <label>
              Email atau Nomor HP
              <input
                name="identifier"
                required
                autoComplete="username"
                placeholder="customer@warkost.local"
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  name="password"
                  type={passwordVisibility.login ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                />
                <button
                  type="button"
                  aria-label={
                    passwordVisibility.login
                      ? "Sembunyikan password"
                      : "Tampilkan password"
                  }
                  onClick={() => togglePassword("login")}
                >
                  {passwordVisibility.login ? "Sembunyikan" : "Lihat"}
                </button>
              </span>
            </label>
            <div className="auth-form-meta">
              <span>Sesi aman hingga 7 hari</span>
              <button
                type="button"
                onClick={() => setMode("password-reset-request")}
              >
                Lupa password?
              </button>
            </div>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Memproses…" : "Masuk"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              onClick={() => setMode("register")}
            >
              Belum punya akun? Daftar Akun
            </button>
            <button
              className="auth-secondary auth-guest-link"
              type="button"
              onClick={() => setMode("guest")}
            >
              Lanjut sebagai Guest
            </button>
          </form>
        </article>
      )}

      {mode === "register" && (
        <article className="auth-card auth-register-card active">
          <div className="auth-card-heading compact">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">MULAI PESAN DI WARKOST</span>
            <h2>Daftar Akun</h2>
            <p>Lengkapi data berikut untuk membuat akun pelanggan.</p>
          </div>
          <form
            noValidate
            aria-busy={busy}
            onSubmit={(event) => submitAuth(event, "register")}
          >
            <p className="auth-note" id="registration-password-help">
              Password minimal 10 dan maksimal 128 karakter. Konfirmasi harus
              sama.
            </p>
            <div className="auth-field-grid">
              <label>
                Nama Lengkap
                <input name="name" required minLength="2" autoComplete="name" />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Nomor HP
                <input
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="08xxxxxxxxxx"
                />
              </label>
              <label>
                Tanggal Lahir
                <input name="birthDate" type="date" required max="2099-12-31" />
              </label>
            </div>
            <label>
              Password
              <span className="password-field">
                <input
                  name="password"
                  type={passwordVisibility.register ? "text" : "password"}
                  required
                  minLength="10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => togglePassword("register")}
                >
                  {passwordVisibility.register ? "Sembunyikan" : "Lihat"}
                </button>
              </span>
            </label>
            <label>
              Konfirmasi Password
              <span className="password-field">
                <input
                  name="passwordConfirmation"
                  type={passwordVisibility.confirmation ? "text" : "password"}
                  required
                  minLength="10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => togglePassword("confirmation")}
                >
                  {passwordVisibility.confirmation ? "Sembunyikan" : "Lihat"}
                </button>
              </span>
            </label>
            <label className="consent-field auth-consent">
              <input name="consent" type="checkbox" required />
              <span>
                Saya menyetujui Syarat &amp; Ketentuan dan Kebijakan Privasi.
              </span>
            </label>
            <p className="auth-note">
              Setelah mendaftar, kode OTP akan dikirim ke email untuk
              mengaktifkan akun.
            </p>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Memproses…" : "Daftar Akun"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              onClick={() => setMode("login")}
            >
              Sudah punya akun? Masuk
            </button>
            <button
              className="auth-secondary auth-guest-link"
              type="button"
              onClick={() => setMode("guest")}
            >
              Checkout sebagai Guest
            </button>
          </form>
        </article>
      )}

      {mode === "password-reset-request" && (
        <article className="auth-card auth-recovery-card active">
          <div className="auth-card-heading compact">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">PEMULIHAN AKUN</span>
            <h2>Lupa Password</h2>
            <p>Masukkan email atau nomor HP akun Warkost Anda.</p>
          </div>
          <form noValidate aria-busy={busy} onSubmit={submitForgotPassword}>
            <label>
              Email atau Nomor HP
              <input
                name="identifier"
                required
                autoComplete="username"
                placeholder="Email atau nomor HP"
              />
            </label>
            <p className="auth-note">
              Jika akun ditemukan, kode akan dikirim ke email yang terdaftar.
            </p>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Mengirim…" : "Kirim Kode OTP"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              onClick={() => setMode("login")}
            >
              Kembali ke Masuk
            </button>
          </form>
        </article>
      )}

      {["registration-otp", "password-reset-otp"].includes(mode) && (
        <article className="auth-card auth-otp-card active">
          <div className="auth-card-heading compact">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">VERIFIKASI EMAIL</span>
            <h2>Masukkan Kode OTP</h2>
            <p>
              Kode 6 digit telah dikirim ke{" "}
              {otpFlow?.destination || "email Anda"}.
            </p>
          </div>
          <form noValidate aria-busy={busy} onSubmit={submitOtp}>
            <label>
              Kode OTP
              <input
                className="otp-code-input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength="6"
                maxLength="6"
                required
                autoFocus
                placeholder="000000"
              />
            </label>
            <p className="auth-note">
              Kode berlaku 10 menit dan maksimal 5 percobaan.
            </p>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Memverifikasi…" : "Verifikasi Kode"}
            </button>
            <button
              className="auth-secondary"
              type="button"
              disabled={busy || otpResendRemaining > 0}
              onClick={resendCurrentOtp}
            >
              {otpResendRemaining > 0
                ? `Kirim ulang dalam ${otpResendRemaining} detik`
                : "Kirim Ulang Kode"}
            </button>
          </form>
        </article>
      )}

      {mode === "password-reset-new" && (
        <article className="auth-card auth-reset-card active">
          <div className="auth-card-heading compact">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-card-kicker">PASSWORD BARU</span>
            <h2>Atur Ulang Password</h2>
            <p>Gunakan password baru yang aman, minimal 10 karakter.</p>
          </div>
          <form noValidate aria-busy={busy} onSubmit={submitNewPassword}>
            <label>
              Password Baru
              <span className="password-field">
                <input
                  name="password"
                  type={passwordVisibility.reset ? "text" : "password"}
                  required
                  minLength="10"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => togglePassword("reset")}>
                  {passwordVisibility.reset ? "Sembunyikan" : "Lihat"}
                </button>
              </span>
            </label>
            <label>
              Konfirmasi Password Baru
              <span className="password-field">
                <input
                  name="passwordConfirmation"
                  type={
                    passwordVisibility.resetConfirmation ? "text" : "password"
                  }
                  required
                  minLength="10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => togglePassword("resetConfirmation")}
                >
                  {passwordVisibility.resetConfirmation
                    ? "Sembunyikan"
                    : "Lihat"}
                </button>
              </span>
            </label>
            {error && (
              <p
                className="auth-feedback"
                id="auth-feedback"
                role="alert"
                tabIndex={-1}
                ref={feedback}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary auth-submit"
              disabled={busy}
            >
              {busy ? "Menyimpan…" : "Simpan Password Baru"}
            </button>
          </form>
        </article>
      )}

      {["registration-success", "password-reset-success"].includes(mode) && (
        <article className="auth-card auth-success-card active">
          <div className="auth-card-heading">
            <Image
              className="auth-card-logo"
              src="/warkost-bahagia-logo-clean.png"
              alt="Warkost Bahagia"
              width={1672}
              height={941}
            />
            <span className="auth-success-mark" aria-hidden="true">
              ✓
            </span>
            <span className="auth-card-kicker">BERHASIL</span>
            <h2>
              {mode === "registration-success"
                ? "Akun Sudah Aktif"
                : "Password Diperbarui"}
            </h2>
            <p>
              {mode === "registration-success"
                ? "Email telah terverifikasi. Anda dapat mulai memesan."
                : "Silakan masuk kembali menggunakan password baru."}
            </p>
          </div>
          {error && (
            <p
              className="auth-feedback"
              role="alert"
              tabIndex={-1}
              ref={feedback}
            >
              {error}
            </p>
          )}
          <div className="auth-success-actions">
            {mode === "registration-success" ? (
              <button
                className="primary auth-submit"
                type="button"
                disabled={busy}
                onClick={continueAfterRegistration}
              >
                {busy ? "Memuat…" : "Mulai Pesan"}
              </button>
            ) : (
              <button
                className="primary auth-submit"
                type="button"
                onClick={() => setMode("login")}
              >
                Kembali ke Masuk
              </button>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
