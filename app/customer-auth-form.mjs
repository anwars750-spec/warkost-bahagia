// Presentation validation mirrors existing backend requirements; the server
// remains authoritative for registration, authentication and OTP security.
export function validateAuthForm(mode, values, now = Date.now()) {
  const problem = (field, message) => ({ field, message });
  if (
    ["login", "password-reset-request"].includes(mode) &&
    !String(values.identifier || "").trim()
  )
    return problem("identifier", "Email atau nomor HP wajib diisi.");
  if (mode === "login" && !values.password)
    return problem("password", "Password wajib diisi.");
  if (["guest", "register"].includes(mode)) {
    const name = String(values.name || "").trim();
    if (name.length < 2 || name.length > 80)
      return problem("name", "Nama wajib diisi antara 2 sampai 80 karakter.");
  }
  if (mode === "register") {
    if (!/^\S+@\S+\.\S+$/.test(String(values.email || "").trim()))
      return problem("email", "Masukkan alamat email yang valid.");
    let phone = String(values.phone || "").replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    else if (phone.startsWith("8")) phone = "62" + phone;
    if (!phone.startsWith("62") || phone.length < 10 || phone.length > 15)
      return problem("phone", "Masukkan nomor HP Indonesia yang valid.");
    const birth = String(values.birthDate || "");
    const parsed = new Date(birth + "T00:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== birth ||
      parsed.getTime() >= now ||
      parsed.getUTCFullYear() < 1900
    )
      return problem(
        "birthDate",
        "Masukkan tanggal lahir yang valid sebelum hari ini.",
      );
  }
  if (["register", "password-reset-new"].includes(mode)) {
    const password = String(values.password || "");
    if (password.length < 10 || password.length > 128)
      return problem(
        "password",
        "Password harus terdiri dari 10 sampai 128 karakter.",
      );
    if (password !== values.passwordConfirmation)
      return problem(
        "passwordConfirmation",
        "Konfirmasi password tidak cocok.",
      );
  }
  if (mode === "register" && values.consent !== true)
    return problem(
      "consent",
      "Persetujuan Syarat & Ketentuan dan Kebijakan Privasi wajib diberikan.",
    );
  if (
    ["registration-otp", "password-reset-otp"].includes(mode) &&
    !/^\d{6}$/.test(String(values.code || "").trim())
  )
    return problem("code", "Kode OTP harus terdiri dari 6 digit.");
  return null;
}
