# Warkost Bahagia — checkpoint MVP

Next.js 16, React, API/service terpisah. Database development SQLite (`node:sqlite`, Node 24+); adapter MySQL memakai `mysql2/promise` dan transaksi. MySQL 8 recovery dan production-mode staging UAT berjalan otomatis di GitHub Actions. Deployment Hostinger tetap harus melewati staging publik sebelum production.

## Development SQLite

1. `npm install` dan salin `.env.example` ke `.env.local`; ganti `SESSION_SECRET` (minimal 32 byte acak untuk produksi).
2. `SEED_DEMO_PASSWORD='password-unik-minimal-10' node scripts/seed.mjs`, lalu `npm run dev`.
3. Login demo memakai `customer@warkost.local`, `admin@warkost.local`, `kitchen@warkost.local`, `driver@warkost.local`, atau `owner@warkost.local` dengan password seed.
4. `npm test`, `npm run build`; dengan server di port 3000, `SEED_DEMO_PASSWORD='...' node scripts/http-smoke.mjs` menguji lima role sampai poin loyalitas.

## Production preflight dan health

Sebelum server production dijalankan, set `NODE_ENV=production`, `SESSION_SECRET` minimal 32 byte, database, `UPLOAD_DIRECTORY`, dan `BACKUP_DIRECTORY` memakai path absolut. Jalankan `npm run preflight`; proses gagal jika konfigurasi, koneksi database, skema inti, storage, atau lokasi backup tidak siap. `GET /api/health/live` hanya memeriksa proses hidup. `GET /api/health/ready` memeriksa konfigurasi, database, storage, dan backup tanpa menampilkan secret atau detail error internal.

Untuk Hostinger staging, ikuti [runbook Hostinger](docs/HOSTINGER_STAGING.md). Startup `npm run start:hostinger` menjalankan migrasi, bootstrap staging, verifikasi schema, dan preflight sebelum membuka server.

## Development MySQL (database khusus development)

1. Siapkan MySQL 8.0+ dan database **kosong khusus development**. Set `DATABASE_URL=mysql://user:password@host:3306/database` dalam environment shell. Jangan commit URI/rahasia.
2. `node scripts/migrate-mysql.mjs` menerapkan migrasi bernomor di `migrations/` secara berurutan; perubahan berikutnya perlu migrasi baru, bukan mengubah tabel produksi manual.
3. `SEED_DEMO_PASSWORD='password-unik-minimal-10' node scripts/seed.mjs` untuk database development saja.
4. Jalankan `npm run dev`; lakukan uji HTTP end-to-end memakai `SEED_DEMO_PASSWORD='...' node scripts/http-smoke.mjs` terhadap server yang memakai `DATABASE_URL` yang sama. Jangan jalankan seed atau smoke pada database pelanggan.
5. Untuk staf produksi, siapkan akun lewat `STAFF_ROLE=ADMIN STAFF_NAME='...' STAFF_EMAIL='...' STAFF_PASSWORD='password-panjang-unik' node scripts/create-staff.mjs`. Nilai `STAFF_ROLE` yang tersedia adalah `ADMIN`, `DRIVER`, `KITCHEN`, dan `OWNER`; semuanya tidak tersedia melalui register publik.

### Backup dan restore MySQL

`DATABASE_URL='mysql://...' BACKUP_DIRECTORY=/path/aman npm run backup:mysql` membuat logical dump konsisten dan checksum SHA-256. Kredensial diteruskan ke `mysqldump` melalui option file sementara berizin `600`, bukan command line. Untuk lokasi binary nonstandar, set `MYSQLDUMP_BINARY`.

Restore hanya menerima database target yang benar-benar kosong: `DATABASE_URL='mysql://.../database_kosong' npm run restore:mysql -- /path/backup.sql`. Checksum diperiksa sebelum koneksi dan hasil restore diverifikasi terhadap charset `utf8mb4`, engine InnoDB, tabel, kolom, serta checksum seluruh migration. Set `MYSQL_BINARY` bila client `mysql` tidak ada di `PATH`. Jangan mengarahkan restore ke database aktif.

`npm run test:mysql` menyediakan MySQL 8.0 sementara, menerapkan dan mengulang migrasi, menjalankan HTTP E2E lima peran, membuat backup, memulihkan ke database baru, lalu membandingkan seluruh jumlah record. Test ini memerlukan environment yang mengizinkan TCP dan UNIX socket lokal serta download binary MySQL pada eksekusi pertama.

## Implementasi

Customer: registrasi/login dengan sesi yang dapat dicabut, ubah nama/password, alamat ber-pin koordinat, menu, checkout server-side, riwayat, notifikasi, WhatsApp bantuan, dan poin ledger. Ongkir gratis sampai 5 km, lalu Rp2.500 per kilometer dimulai berikutnya, dengan batas layanan 15 km; jarak dan tarif dihitung server dan nilai dari browser diabaikan. Nomor Driver baru terlihat oleh pemilik order setelah tugas diterima sampai dua jam setelah `DELIVERED`. Admin/Kasir: KPI, katalog, customer, driver, pembayaran, stasiun minuman, stok masuk, laporan, pengaturan, serta print queue struk 80 mm. Kitchen hanya menerima item makanan dan tiket makanan. Pesanan campuran menjadi `READY` setelah Dapur dan Kasir sama-sama siap. Owner memiliki dashboard, laporan, kontrol stok naik/turun, audit log hanya-baca, dan pantauan printer. Stok dipotong atomik saat konfirmasi, dipulihkan sekali saat pembatalan yang valid, dan seluruh perubahan memiliki ledger. Driver menangani maksimal lima pesanan aktif sekaligus; tugas keenam ditolak atomik dan checkout memberi peringatan keterlambatan ketika seluruh Driver penuh. Driver: notifikasi, terima tugas, pickup, antar, selesai. Poin diberikan sekali saat `DELIVERED`. Tunai dan transfer manual tersedia tanpa gateway; transfer `PENDING` yang melewati batas waktu menjadi `EXPIRED` dan tercatat pada audit/dashboard.

Body JSON API dibatasi 64 KiB dan harus berupa objek JSON dengan `Content-Type: application/json`; format rusak dan ukuran berlebih mendapat respons 400/413. Endpoint gambar memiliki batas terpisah.

Checkout melalui HTTP mewajibkan `idempotencyKey` berupa UUID. Frontend memakai kembali kunci yang sama saat mencoba ulang keranjang/alamat/metode identik; database menjamin satu order per customer dan kunci. Pengulangan dengan isi berbeda ditolak 409, dan pembayaran/notifikasi tidak diduplikasi.

Laporan harian Admin menampilkan jumlah dan nilai pesanan aktif berdasarkan tanggal dibuat, pembayaran terverifikasi berdasarkan tanggal verifikasi, status pesanan, serta sepuluh produk terlaris. Rentang hari menggunakan waktu Asia/Jakarta dan tersedia indeks tanggal order untuk query laporan.

## Backup SQLite

`BACKUP_DIRECTORY=/path/aman node scripts/backup.mjs` menghasilkan snapshot konsisten beserta file checksum `.sha256`; simpan keduanya secara terenkripsi di luar server. Saat restore, **hentikan aplikasi**, lalu `node scripts/restore.mjs /path/backup.db /path/target-baru.db`, arahkan `DATABASE_PATH` ke file baru, dan hidupkan aplikasi. Restore menolak checksum hilang/salah, skema tidak lengkap, relasi rusak, dan target yang sudah ada. Jalankan `npm run test:backup` untuk menguji snapshot dan restore dengan record serta failure scenario. Jalur MySQL setara tersedia melalui `backup:mysql`, `restore:mysql`, dan recovery drill `test:mysql`.

## Gambar produk dan backup file

Admin dapat unggah JPEG, PNG, WebP, atau AVIF maksimal 8 MB. Server memvalidasi isi gambar, membatasi 25 megapiksel, dan menghasilkan WebP maksimal 1280 piksel. Metadata tersimpan di tabel `media_assets`, file berada di `UPLOAD_DIRECTORY` (default `./data/uploads`). Atur folder ini di volume persisten dengan backup terpisah. Untuk backup: `UPLOAD_DIRECTORY=/path/gambar MEDIA_BACKUP_DIRECTORY=/path/backup node scripts/backup-media.mjs`. Untuk restore ke folder **baru**: `node scripts/restore-media.mjs /path/backup/media-TIMESTAMP /path/gambar-baru`; skrip memeriksa hash SHA-256 dan menolak menimpa folder yang ada. Setelah restore, arahkan `UPLOAD_DIRECTORY` ke folder baru. Jalankan backup database lebih dahulu lalu backup gambar karena file gambar tidak diubah setelah unggah.

## Batas saat ini

MySQL adapter, migrasi ber-checksum, backup/restore, schema verifier, recovery drill MySQL 8, health check, HTTP smoke, browser UAT desktop/mobile, ongkir radius, bantuan WhatsApp, observabilitas pembayaran manual, dan print queue simulasi tersedia. ORM belum dipakai. Printer LAN fisik belum dipasangkan dan upload gambar serta backup path belum diverifikasi pada filesystem Hostinger nyata. Promo, payment gateway, maps/routing berbayar, profil driver lanjutan, reset password, rate limit berbasis IP/tepi jaringan, CSRF token tambahan, review keamanan/performa menyeluruh, Hostinger PoC publik, UAT pengguna, dan handover masih tertunda. Jangan gunakan data pelanggan nyata sampai gate tersebut selesai.
