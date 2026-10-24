# Staging Deployment

Dokumen ini adalah runbook staging untuk Warkost Bahagia. Jangan gunakan data pelanggan produksi pada environment staging.

## Deployment target

Target deployment saat ini adalah **IDCloudHost VPS**.

Application deployment tetap dibuat provider-neutral agar dapat dipindahkan ke VPS/provider lain tanpa refactor aplikasi.

Baseline teknis:

- Linux VPS
- Node.js `24.x`
- MySQL 8
- Next.js production build
- HTTPS melalui reverse proxy
- Persistent upload storage
- Persistent database backup storage
- Repository: `https://github.com/anwars750-spec/warkost-bahagia`
- Release Candidate source saat ini: `work/customer-qris-demo-uat-v1`

Jangan merge atau deploy sampai Product Owner memberikan approval deployment.

## Build dan startup

- Framework: Next.js
- Node.js: `24.x`
- Root directory: `.`
- Install: `npm ci`
- Build: `npm run build`
- Start staging: `npm run start:staging`

`start:staging` wajib menolak konfigurasi yang tidak aman, termasuk:

- `NODE_ENV` bukan `production`
- `DEPLOYMENT_ENV` bukan `staging`
- database selain MySQL
- `DATABASE_PATH` SQLite
- session secret lemah
- password UAT staging lemah
- upload path relatif
- backup path relatif
- upload dan backup menggunakan direktori yang sama
- port tidak valid

Startup menjalankan migrasi MySQL, bootstrap staging, verifikasi schema, production preflight, lalu menjalankan Next.js production server.

## Environment

Gunakan `.env.staging.example` sebagai template.

Nilai asli tidak boleh disimpan di GitHub.

Environment minimum:

- `NODE_ENV=production`
- `DEPLOYMENT_ENV=staging`
- `DATABASE_URL`
- `SESSION_SECRET`
- `STAGING_UAT_PASSWORD`
- `UPLOAD_DIRECTORY`
- `BACKUP_DIRECTORY`
- `PORT` bila tidak menggunakan default `3000`

Persistent storage yang direkomendasikan:

- `/srv/warkost/storage/uploads`
- `/srv/warkost/storage/backups/database`

Database, upload, dan backup harus tetap tersedia setelah restart maupun redeploy aplikasi.

## Database

Gunakan MySQL 8 dengan database khusus staging.

Sebelum staging digunakan:

1. Buat database kosong.
2. Buat user database dengan permission yang diperlukan aplikasi.
3. Set `DATABASE_URL`.
4. Jalankan migration melalui startup staging.
5. Jalankan `npm run verify:mysql`.
6. Pastikan `/api/health/ready` mengembalikan status `ready`.

Jangan menggunakan SQLite untuk staging atau production.

## UAT accounts

Bootstrap staging mendukung enam role:

- Customer
- Admin
- Manager
- Kitchen
- Driver
- Owner

Password seluruh akun UAT menggunakan `STAGING_UAT_PASSWORD`.

Untuk rotasi password staging:

1. Ubah `STAGING_UAT_PASSWORD`.
2. Set `STAGING_RESET_DEMO_PASSWORD=true`.
3. Restart satu kali.
4. Setelah berhasil, hapus `STAGING_RESET_DEMO_PASSWORD`.
5. Restart kembali.

Jangan mencetak password atau secret ke log.

## HTTPS dan reverse proxy

Aplikasi Next.js berjalan pada internal application port.

Public staging wajib menggunakan HTTPS melalui reverse proxy.

Sebelum UAT publik:

- domain/subdomain staging sudah mengarah ke VPS
- sertifikat HTTPS valid
- port aplikasi tidak perlu diekspos langsung ke internet
- `/api/health/live` dapat diakses
- `/api/health/ready` dapat diakses
- HTTP dialihkan ke HTTPS

## GitHub staging verification

GitHub environment yang digunakan:

`staging`

Variable:

- `STAGING_URL`

Secret:

- `STAGING_UAT_PASSWORD`

`STAGING_URL` harus berupa HTTPS public origin tanpa trailing path, misalnya:

`https://staging.example.com`

Jalankan workflow **Staging Verify** setelah staging tersedia.

Workflow memverifikasi:

- HTTPS
- liveness
- readiness
- CSRF/origin protection
- login enam role
- RBAC
- catalog
- cross-role browser UAT desktop/mobile

Remote HTTP smoke dapat dijalankan dengan:

`npm run verify:staging`

## Backup dan rollback

Sebelum setiap deployment:

1. Buat backup database.
2. Pastikan backup tersimpan di `BACKUP_DIRECTORY`.
3. Pastikan upload storage ikut diamankan.
4. Catat commit SHA release yang akan dideploy.

Restore tidak boleh langsung menimpa database aktif.

Prosedur recovery:

1. Restore dump ke database kosong.
2. Jalankan schema verification.
3. Arahkan `DATABASE_URL` ke database hasil restore.
4. Restart aplikasi.
5. Verifikasi `/api/health/live`.
6. Verifikasi `/api/health/ready`.
7. Jalankan staging smoke/UAT.

Rollback dianggap PASS hanya setelah health check dan UAT selesai.

## Gate sebelum production

Semua gate berikut wajib selesai:

- Release Candidate sudah Product Owner accepted.
- Full regression PASS.
- Production build PASS.
- Working tree clean.
- VPS staging tersedia.
- MySQL 8 staging tersedia.
- HTTPS valid.
- Upload persistent storage verified.
- Database backup path verified.
- Backup and restore drill PASS.
- `/api/health/live` PASS.
- `/api/health/ready` PASS.
- `npm run verify:staging` PASS.
- Cross-role UAT Customer -> Admin -> Kitchen -> Driver -> Manager -> Owner PASS.
- Tidak ada secret, dump database, atau customer data di repository.
- Rollback procedure diverifikasi.

Production deployment hanya dilakukan setelah Product Owner memberikan approval eksplisit.