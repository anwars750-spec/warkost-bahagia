# Operational UAT dan release candidate sign-off

Tanggal verifikasi: 28 September 2026 (Asia/Jakarta)

## Keputusan

**PASS — Core MVP disetujui sebagai release candidate teknis lokal.** Seluruh
skenario wajib lulus pada desktop dan mobile, tidak ada defect aplikasi Sev-1
atau Sev-2 yang terbuka, dan health/readiness tetap sehat setelah UAT.

Persetujuan ini tidak mengaktifkan deployment. Migrasi ke Hostinger tetap
ditahan sampai demo dan penerimaan pemilik selesai serta hosting telah dibeli.

## Baseline dan batas scope

- Baseline remote: commit `7dd87a30e926135fc3b6b1128962d9949523703f`
  pada `main`, ditambah gate UAT operasional di workspace saat ini.
- Runtime: Next.js 16.3.6, React 19.3.0, Node.js 24.
- Data: akun dan transaksi demo; tidak ada data pelanggan nyata.
- Peran: Customer, Admin, dan Driver.
- Di luar scope: hosting publik, domain, payment gateway, maps/routing,
  perluasan fitur bisnis, dan konfigurasi infrastruktur Hostinger.

## Matriks UAT

| ID           | Skenario                                                | Bukti wajib                                                             | Desktop | Mobile |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------- | ------ |
| OP-UAT-01    | Login salah ditolak dan tidak membuat sesi              | Alert generik, HTTP 401, tombol Keluar tidak muncul                     | PASS    | PASS   |
| OP-UAT-02    | Checkout transfer manual sampai pesanan selesai         | PENDING → PAID → ASSIGNED → PICKED_UP → ON_DELIVERY → DELIVERED         | PASS    | PASS   |
| OP-UAT-02A   | Isolasi Customer                                        | Endpoint inventory Admin ditolak 403                                    | PASS    | PASS   |
| OP-UAT-02B   | Isolasi Driver sebelum assignment                       | Pesanan tidak terlihat dan detail ditolak 403                           | PASS    | PASS   |
| OP-UAT-02C   | Notifikasi lintas peran                                 | Driver menerima assignment dan Customer menerima status delivered       | PASS    | PASS   |
| OP-UAT-02D   | Integritas akhir                                        | Riwayat memuat DELIVERED dan ledger loyalty tepat satu entri            | PASS    | PASS   |
| REG-CUSTOMER | Menu, pesanan, akun, dan responsive shell               | Tidak ada overlay, page error, overflow, atau console error tak terduga | PASS    | PASS   |
| REG-ADMIN    | Operasional, driver, pelanggan, laporan, dan pengaturan | Seluruh area utama dapat dibuka                                         | PASS    | PASS   |
| REG-DRIVER   | Tugas dan notifikasi                                    | Kedua area dapat dibuka                                                 | PASS    | PASS   |

Setiap eksekusi OP-UAT-02 menyimpan screenshot Customer, Admin, Driver, hasil
akhir Customer, serta attachment JSON berisi order ID, metode pembayaran,
status akhir, ledger loyalty, dan hasil isolasi role. Workflow staging mengunggah
`playwright-report/` dan `test-results/` sebagai artefak bukti.

## Hasil gate

| Gate                         | Hasil                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Unit/regression              | 35/35 PASS                                                         |
| SQLite backup/restore        | PASS: data, skema, checksum, overwrite guard, foreign key          |
| Production build             | PASS                                                               |
| Production preflight         | PASS: config, database, storage, backup                            |
| Health `/live`               | PASS                                                               |
| Readiness `/ready`           | PASS sebelum dan sesudah UAT                                       |
| Playwright Chromium          | 10/10 PASS, desktop dan mobile                                     |
| HTTP E2E                     | PASS: auth, RBAC, checkout, Admin, Driver, delivered, loyalty once |
| Syntax, format, diff hygiene | PASS                                                               |

## Defect log

Tidak ada defect aplikasi yang ditemukan. Tiga defect pada test harness ditutup:

1. Locator alert ambigu dengan route announcer bawaan Next.js; diperbaiki dengan
   memilih alert aplikasi secara spesifik.
2. API request UAT tidak membawa cookie sesi HttpOnly secara otomatis;
   diperbaiki dengan meneruskan cookie sesi secara eksplisit pada pemeriksaan
   API terautentikasi.
3. Respons 401 yang memang diharapkan pada skenario login salah semula dianggap
   console error tak terduga; assertion kini mensyaratkan tepat satu 401.

Severity terbuka: Sev-1 = 0, Sev-2 = 0, Sev-3 = 0.

## Sign-off

- Technical release candidate: **APPROVED**.
- Operational automated UAT: **APPROVED**.
- Human business acceptance: belum dilakukan; menjadi milestone berikutnya.
- Hosting migration: **ON HOLD** sesuai keputusan pemilik.
