# Warkost Bahagia — V0.8.1 Foundation Hardening

V0.8.1 adalah hardening di atas V0.8. Fokusnya memperketat role/permission dan status transition tanpa membuka milestone V0.9.

## Fokus V0.8
- Role separation: Customer, Admin, Kasir, Kitchen, Driver, Owner.
- Login redirect berdasarkan role.
- Customer tidak melihat dashboard staff.
- Admin: menu, harga, stock, delivery settings, campaign foundation, printer, report.
- Kasir: menerima order dan hanya boleh melakukan cross-check → confirmed pada order yang sudah paid.
- Kitchen: hanya boleh mengubah confirmed → processing → ready.
- Admin/Owner: mengelola transition operasional sesuai state machine.
- Cart +/- yang benar; qty 1 - menghapus item.
- Checkout menampilkan harga satuan, subtotal, diskon, delivery, dan total.
- Stock validation.
- Central order flow foundation.

## Akun demo
Password semua akun: `123456`

- Customer: `customer@local`
- Admin: `admin@local`
- Kasir: `kasir@local`
- Kitchen: `kitchen@local`
- Driver: `driver1@local`
- Owner: `owner@local`

## Menjalankan
```powershell
cd "D:\Warkost\Warkost_Bahagia_V08_System_Foundation\warkost-bahagia-v07"
python -m pip install -r requirements.txt
python run.py
```

Buka `http://127.0.0.1:5000`

## Urutan test V0.8
1. Login setiap role dan pastikan redirect benar.
2. Customer: tambah item, +, -, hapus qty 1, cek subtotal/total.
3. Customer: checkout valid dan invalid.
4. Admin: tambah/edit harga dan stock.
5. Admin: buat campaign foundation.
6. Kasir: lihat order dan cross-check; tidak mempunyai menu Admin.
7. Kitchen: lihat queue dan ubah status proses/ready.
8. Driver: online → claim → complete.
9. Owner/Admin: lihat report.
10. Uji negative access: Kasir tidak boleh processing/ready/completed; Kitchen tidak boleh completed; Customer tidak boleh /dashboard.

## Catatan
QRIS, GPS browser, Dine-In QR, promo engine lengkap, POS walk-in penuh, sales integration lintas channel, dan production security adalah milestone berikutnya. Jangan dikerjakan sebelum foundation lolos test.


## Repository Baseline

- Baseline version: V0.8.6.2
- Baseline source: Warkost_Bahagia_V08.6.2_Order_Confirmation
- Current architecture: Flask + SQLite (offline/local baseline)
- Target architecture: Supabase Auth + PostgreSQL + RLS + server-side business rules
- This repository is the source of truth for the Warkost Bahagia application.
- V0.8.6.2 is preserved as the known-working starting point.
- Future development must use branches and be validated before merging.

## Next Milestone

Migrate the application foundation from SQLite/local authentication to Supabase while preserving the working customer checkout and role-based operational flows.
