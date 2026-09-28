# Owner Feedback Requirements

Tanggal pencatatan: 28 September 2026 (Asia/Jakarta)

Dokumen ini menjadi baseline business acceptance setelah demo Core MVP tiga
role. Requirement di bawah belum dianggap selesai sampai implementasi,
security test, browser UAT desktop/mobile, dan rehearsal lintas role PASS.

## UI Customer dan Promo

- Header seluruh role menggunakan logo Warkost Bahagia dengan background
  transparan dan proporsi asli.
- Halaman Menu Customer menampilkan promo yang sedang aktif, periode berlaku,
  syarat, dan CTA yang relevan.
- Promo kedaluwarsa atau belum mulai tidak boleh tampil sebagai promo aktif.
- Desain mengambil pola yang baik dari referensi: hero promo, filter kategori,
  kartu menu informatif, informasi pengantaran, dan layout responsif; tidak
  menyalin referensi secara identik.

## Bantuan Customer dan WhatsApp

- Customer dapat membuka Chat Admin dari halaman Customer.
- Setelah checkout, halaman transaksi menampilkan Chat Admin dengan pesan
  awal berisi nomor order, tanpa menyertakan data sensitif yang tidak perlu.
- Setelah Driver ditugaskan dan menerima order, halaman transaksi menampilkan
  Chat Driver untuk koordinasi lokasi.
- Kontak Driver hanya tersedia pada order yang memang ditugaskan kepadanya dan
  harus disembunyikan kembali setelah jendela layanan berakhir.
- Nomor WhatsApp bisnis dan nomor Driver tidak boleh di-hard-code pada frontend.

## Ongkir Berdasarkan Jarak

- Jarak sampai dengan 5 km mendapatkan gratis ongkir.
- Jarak lebih dari 5 km mendapatkan biaya tambahan sesuai tarif yang disetujui
  Owner.
- Server menghitung dan menyimpan jarak, ongkir, sumber koordinat, dan aturan
  tarif yang digunakan; nilai ongkir dari browser tidak boleh dipercaya.
- Checkout harus menolak alamat di luar radius layanan maksimum.

## Kitchen dan Admin/Kasir

- Item makanan dirutekan ke Kitchen.
- Item minuman dirutekan ke Admin/Kasir.
- Order campuran baru menjadi READY setelah seluruh item makanan dan minuman
  selesai di stasiun masing-masing.
- Admin/Kasir melihat keseluruhan order; Kitchen hanya melihat item makanan
  yang perlu disiapkan.

## Printer Otomatis

- Order valid menghasilkan tiket Admin/Kasir dan tiket Kitchen makanan-only.
- Pencetakan harus idempotent: retry tidak boleh menghasilkan duplikasi tanpa
  penanda reprint.
- Status print QUEUED, PRINTED, FAILED, dan REPRINTED dicatat beserta waktu,
  printer, order, actor, dan error.
- Auto-print tanpa dialog browser menggunakan local print agent/kiosk atau
  printer jaringan yang disetujui; tidak bergantung pada window.print biasa.

## Payment Observability

- Dashboard mencatat status pembayaran PENDING, PAID, FAILED, dan EXPIRED.
- Perubahan otomatis berasal dari webhook payment gateway yang diverifikasi,
  tahan replay, dan idempotent.
- Pembayaran manual tetap mencatat actor verifikasi dan audit trail.
- Owner dapat melihat jumlah keberhasilan, kegagalan, timeout, serta detail
  alasan kegagalan tanpa membuka data rahasia gateway.

## Kapasitas Driver dan Informasi Keterlambatan

- Satu Driver maksimal membawa lima order aktif secara bersamaan.
- Sistem menolak penugasan keenam secara atomic, termasuk saat dua Admin
  melakukan penugasan bersamaan.
- Peringatan keterlambatan ditampilkan apabila tidak ada Driver online dengan
  slot tersisa, bukan hanya karena salah satu Driver sedang bertugas.
- Peringatan Customer: "Mohon maaf, pesanan Anda mungkin membutuhkan waktu
  lebih lama karena seluruh driver sedang bertugas."
- Dashboard Admin menampilkan kapasitas aktif setiap Driver (contoh: 3/5).

## Owner, Stok, dan Audit

- Admin dapat membuat atau mengubah menu dan melakukan stok masuk.
- Admin tidak dapat melakukan koreksi stok turun manual.
- Owner dapat melakukan stok masuk dan koreksi stok turun dengan alasan wajib.
- Pengurangan stok karena transaksi dilakukan otomatis oleh sistem.
- Owner memiliki halaman audit log untuk perubahan menu, stok, pembayaran,
  order, penugasan Driver, akun, pengaturan, dan aktivitas keamanan penting.
- Audit menyimpan actor, role, action, entity, entity ID, before/after yang
  relevan, waktu, dan alasan; audit tidak dapat diedit oleh role operasional.

## Keputusan Bisnis yang Masih Dibutuhkan

1. Tarif ongkir per kilometer atau tier setelah 5 km dan radius maksimum.
2. Nomor WhatsApp Business Admin serta kebijakan menampilkan nomor Driver.
3. Payment gateway yang digunakan dan alur CASH/transfer manual.
4. Model, jumlah, dan koneksi printer Admin/Kasir dan Kitchen (USB/LAN).
5. Penugasan Driver manual oleh Admin atau auto-dispatch.
