# Core MVP release readiness

Tanggal audit: 28 September 2026 (Asia/Jakarta)

## Scope release candidate

Core MVP mencakup tiga peran berikut:

- Customer: login, menu, cart, checkout idempotent, riwayat order, alamat,
  notifikasi, dan poin loyalitas.
- Admin: dashboard, produk/kategori, customer, driver, pembayaran manual,
  pemrosesan order, penugasan driver, laporan, dan pengaturan.
- Driver: melihat tugas miliknya, menerima tugas, pickup, memulai pengantaran,
  dan menyelesaikan pengantaran.

Hosting publik, domain, pembayaran gateway, maps/routing nyata, dan deployment
Hostinger tidak termasuk milestone ini.

## Requirement traceability

| Area               | Implementasi                                                                                      | Bukti verifikasi                                       | Status |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| Auth dan session   | Password hash, session server-side yang dapat dicabut, cookie HttpOnly/SameSite/Secure production | Unit tests dan HTTP smoke                              | PASS   |
| RBAC               | Pemeriksaan role di service/API untuk Customer, Admin, Driver                                     | Unit tests, HTTP smoke, remote smoke                   | PASS   |
| Request security   | Same-origin POST, JSON 64 KiB, validasi input, error internal disamarkan                          | Request tests dan HTTP smoke                           | PASS   |
| Abuse control      | Rate limit login/register per identitas dan perubahan password per akun, persisten di database    | Rate-limit tests dan HTTP smoke                        | PASS   |
| Checkout           | Harga dihitung server-side dan UUID idempotency mencegah order/payment ganda                      | Idempotency tests dan HTTP smoke                       | PASS   |
| Order lifecycle    | PENDING sampai DELIVERED dengan transisi dan ownership tervalidasi                                | Flow tests, HTTP smoke, browser vertical flow          | PASS   |
| Pembayaran         | Tunai/transfer manual dan verifikasi Admin atomic                                                 | Payment tests dan browser vertical flow                | PASS   |
| Loyalty            | Poin diberikan sekali saat DELIVERED                                                              | Flow/settings tests, HTTP smoke, browser vertical flow | PASS   |
| Operational UI     | Menu, order, customer, driver, produk, laporan, pengaturan, notifikasi                            | Browser UAT desktop/mobile                             | PASS   |
| Database           | SQLite lokal; DAL dan migration MySQL 8 dengan checksum/lock                                      | MySQL Recovery #13                                     | PASS   |
| Backup/restore     | SQLite snapshot/checksum/failure cases; MySQL dump/restore/parity                                 | Backup test dan MySQL Recovery #13                     | PASS   |
| Production runtime | Build, production preflight, live/readiness checks                                                | Staging UAT #7 dan local readiness                     | PASS   |

## Evidence

- Unit/regression: 35/35 PASS pada head `b2ef1b6`.
- MySQL Recovery #13: migration, schema, HTTP E2E, backup, restore, dan parity
  PASS.
- Staging UAT #7: production startup, preflight, health, HTTP smoke, dan browser
  UAT PASS.
- Audit ini menambahkan browser vertical flow Customer → Admin → Driver →
  loyalty; full browser regression sekarang 8/8 PASS pada desktop dan mobile.
- Local readiness: config, database, storage, dan backup semuanya `true`.
- `git diff --check`, syntax check test, dan pemeriksaan pola berbahaya PASS.

## Batas release candidate

- Gunakan data demo saja sampai deployment staging publik dan UAT pengguna
  selesai.
- Rate limit IP/edge, audit observability penuh, reset-password recovery, dan
  performance/load review adalah gate production berikutnya, bukan penambahan
  fitur Core MVP pada release candidate lokal.
- Migrasi Hostinger tetap ditunda sampai aplikasi disetujui pada UAT pengguna.

## Keputusan

Core MVP memenuhi gate teknis release candidate lokal. Langkah berikutnya adalah
UAT pengguna terarah menggunakan skenario bisnis nyata dan data demo, kemudian
menutup defect yang ditemukan sebelum migrasi hosting.
