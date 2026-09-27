# Hostinger persistent staging

Dokumen ini khusus staging. Jangan gunakan database atau data pelanggan produksi.

## Pilihan layanan

Gunakan **Business Web Hosting** untuk satu staging MVP. Hostinger managed Node.js
mendukung Next.js, MySQL, Node.js 24, build/start command, environment variables,
GitHub deployment, restart, dan HTTPS. Naik ke Cloud hanya bila pengukuran resource
staging menunjukkan Business tidak cukup. VPS tidak diperlukan untuk gate MVP ini.

## Source dan build

- Repository: `https://github.com/anwars750-spec/warkost-bahagia`
- Branch staging: `deploy/hostinger-staging`
- Framework: Next.js
- Node.js: `24.x`
- Root directory: `.`
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm run start:hostinger`
- Output directory: `.next`

`start:hostinger` menolak konfigurasi non-production/SQLite, lalu menjalankan migrasi
MySQL dengan advisory lock, bootstrap tiga akun UAT khusus staging, verifikasi schema,
production preflight, dan baru menjalankan `next start`. Restart/redeploy aman karena
migrasi dan bootstrap idempotent.

## Provisioning hPanel

1. Beli/aktifkan Business Web Hosting atau Cloud, lalu pilih **Add Website → Deploy
   Web App → Import Git Repository**. Repository ini publik sehingga URL repository
   dapat digunakan tanpa memberi akses ke repository lain.
2. Pilih branch `deploy/hostinger-staging` dan build settings di atas.
3. Buat database MySQL kosong dari **Databases → Management** dengan charset
   `utf8mb4`. Simpan host, nama database, user, dan password di password manager.
4. Buat dua direktori writable yang terpisah dan berada di luar direktori release
   Node.js yang diganti saat redeploy:
   - `storage/uploads`
   - `storage/backups/database`
5. Salin nama variabel dari `.env.hostinger.example` ke hPanel. Ganti seluruh
   placeholder. Jangan upload file `.env` berisi nilai asli ke GitHub.
6. Deploy. Startup harus gagal tertutup bila database, schema, storage, backup path,
   atau secret belum benar.
7. Gunakan temporary domain HTTPS Hostinger untuk staging atau subdomain staging.
   Jangan arahkan domain produksi pada milestone ini.

## GitHub environment untuk UAT publik

Buat environment GitHub bernama `hostinger-staging`:

- Variable `HOSTINGER_STAGING_URL`: origin HTTPS tanpa trailing path, misalnya
  `https://staging.example.com`.
- Secret `HOSTINGER_STAGING_UAT_PASSWORD`: sama dengan `STAGING_UAT_PASSWORD` di
  hPanel.

Jalankan workflow **Hostinger Staging Verify**. Workflow hanya membaca data bisnis;
ia membuat lalu mencabut sesi login, menguji health/readiness, penolakan cross-origin,
RBAC, katalog, dan enam browser flow Customer/Admin/Driver pada desktop/mobile.

## Backup dan rollback

- Aktifkan backup harian Hostinger untuk website dan MySQL.
- Sebelum setiap deploy, buat backup database dari hPanel dan backup folder upload.
- Pertahankan branch `rollback/pre-pr2-baseline` hanya sebagai rollback source lama;
  rollback staging sehari-hari dilakukan dengan memilih commit release sebelumnya
  dan **Redeploy**.
- Jangan restore ke database aktif. Restore dump ke database kosong, jalankan schema
  verification, ubah `DATABASE_URL`, lalu restart. Prosedur ini sama dengan recovery
  drill yang dijalankan CI.
- Setelah rollback, jalankan kembali **Hostinger Staging Verify**. Rollback baru sah
  bila `/live`, `/ready`, HTTP smoke, dan UAT 6/6 PASS.

## Rotasi akun UAT

Untuk mengganti password tiga akun staging, ubah `STAGING_UAT_PASSWORD`, set
`STAGING_RESET_DEMO_PASSWORD=true`, lalu restart sekali. Setelah startup sukses,
hapus `STAGING_RESET_DEMO_PASSWORD` dan restart kembali. Proses ini mencabut sesi
lama tanpa mencetak password ke log.

## Gate sebelum production

- URL staging HTTPS dan sertifikat valid.
- MySQL, storage upload, dan backup path semuanya `ready`.
- Workflow Hostinger Staging Verify PASS.
- Backup Hostinger dan restore ke database kosong diverifikasi.
- Resource CPU/RAM/I/O diamati saat UAT.
- Tidak ada secret, dump, atau file upload staging dalam repository.
