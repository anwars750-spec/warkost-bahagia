# Owner Demo Guide

Tanggal persiapan: 28 September 2026 (Asia/Jakarta)

## Tujuan

Mendemonstrasikan Core MVP Warkost Bahagia menggunakan data demo lokal agar
owner dapat menilai alur operasional Customer, Admin/Kasir, Kitchen, Driver, dan Owner sebelum
keputusan pembelian hosting atau penggunaan data nyata.

Launcher selalu membuat database SQLite baru di temporary directory, hanya
bind ke `127.0.0.1`, menghasilkan session secret baru, dan menolak
`DATABASE_URL`. Demo tidak terhubung ke Vercel, Hostinger, atau database lain.

## Persiapan

Gunakan Node.js 24 dan source pada release candidate terbaru. Jika dependencies
atau production build belum tersedia pada mesin demo, jalankan `npm ci` dan
`npm run build` satu kali.

Mulai demo dengan password sementara minimal 10 karakter:

```bash
OWNER_DEMO_PASSWORD='ganti-password-demo' node scripts/owner-demo.mjs
```

Jika port 3000 sedang digunakan:

```bash
OWNER_DEMO_PASSWORD='ganti-password-demo' OWNER_DEMO_PORT=3100 node scripts/owner-demo.mjs
```

Buka URL `OWNER_DEMO_READY` yang ditampilkan. Kelima akun memakai password
sementara yang sama:

- Customer: `customer@warkost.local`
- Admin: `admin@warkost.local`
- Kitchen: `kitchen@warkost.local`
- Driver: `driver@warkost.local`
- Owner: `owner@warkost.local`

Jangan memakai password pribadi atau data pelanggan nyata. Tekan `Ctrl+C`
setelah demo selesai.

## Alur demo 12–15 menit

| Waktu       | Peran            | Demonstrasi                                                    | Bukti yang harus terlihat                                         |
| ----------- | ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0–2 menit   | Publik           | Buka menu dan kategori                                         | Brand, produk, harga, dan tampilan mobile/desktop                 |
| 2–5 menit   | Customer         | Login, tambah produk, buka keranjang, pilih transfer, checkout | Order baru berstatus PENDING dan total dihitung server            |
| 5–7 menit   | Admin/Kasir      | Tandai PAID, konfirmasi, dan siapkan item minuman              | Pembayaran, stok, dan tiket Kasir tercatat                        |
| 7–9 menit   | Kitchen          | Buka antrean makanan, mulai masak, tandai makanan siap         | Kitchen hanya melihat makanan; order READY setelah semua stasiun  |
| 9–11 menit  | Admin dan Driver | Assign Driver; terima, pickup, antar, dan selesaikan           | Kapasitas Driver terlihat dan order DELIVERED                     |
| 11–13 menit | Customer         | Buka Pesanan, Notifikasi, lalu Akun                            | Status DELIVERED dan poin bertambah tepat sekali                  |
| 13–15 menit | Owner            | Buka dashboard, Stok, Audit log, dan Laporan                   | Revenue, ledger stok, audit, status, dan produk terlaris tercatat |

## Pertanyaan penerimaan

Owner harus menjawab seluruh pertanyaan berikut berdasarkan kebutuhan operasi
Warkost, bukan hanya tampilan:

1. Apakah customer dapat memahami proses memilih menu sampai checkout?
2. Apakah Admin dapat memproses pembayaran dan pesanan tanpa langkah membingungkan?
3. Apakah penugasan serta pembaruan status Driver sesuai proses lapangan?
4. Apakah status dan notifikasi cukup jelas bagi setiap peran?
5. Apakah laporan harian menampilkan informasi minimum yang dibutuhkan owner?
6. Apakah aturan poin loyalitas sudah sesuai kebijakan bisnis?
7. Apakah lima peran Core MVP dan pemisahan Dapur/Kasir sudah sesuai?
8. Apakah Core MVP layak masuk persiapan hosting dengan data tetap demo?

Catat jawaban dan keputusan pada `docs/OWNER_ACCEPTANCE_RECORD.md`. Perubahan
fitur baru tidak dikerjakan dalam sesi demo; masukkan sebagai backlog terpisah.
