# Warkost Bahagia — Project Checkpoint

## Active baseline

- Branch: `session/2a-customer-ui-polish`
- Accepted Customer UI baseline: `42fc282cad623492413b33db849f5765c7a4e50d`
- Shipping core implementation commit: `f2007d5d02376981c8d7d402cba048ca651e398a`
- Shipping core checkpoint: `b1c5c27b4f3f016a48fea7a80dab543da9b597e1`
- Voucher lifecycle implementation: `24f51b147b47028875b049435f991145a415e93f`
- Voucher lifecycle checkpoint: `4ffb05b3e1a2b27fcb7134faef0b64e447dc88b8`
- Loyalty core implementation: `ff0aeaf66555546849902ba0769be6fc6b0f9048`
- Milestone: Customer Functional Completion #3 — Loyalty Core
- Status: **COMPLETED / AUTOMATED VERIFIED**
- Verification date: 2026-10-04

## Scope completed

- Customer homepage desktop and mobile were aligned to the two approved design references.
- Customer header now exposes Notifikasi, Keranjang with item badge, Akun, and Bantuan while preserving the existing drawers and account flow.
- Brand logo, name, and tagline remain readable without mobile overlap.
- Active promotions use the existing server-side period logic and display through a responsive hero carousel.
- Homepage includes responsive heading, service benefits, menu search, Semua/Makanan/Minuman filters, and a Menu Pilihan section.
- Product cards use existing local demo assets, visual badges, responsive descriptions, price hierarchy, and existing quantity/cart state.
- Customer help exposes the configured WhatsApp chat and telephone actions.
- Mobile bottom navigation contains Notifikasi, Keranjang, Akun, and Bantuan.
- A floating cart summary appears above the mobile bottom navigation and retains the existing quick-cart drawer.
- Checkout, notification page, order page, account settings, address UI, customer session, pricing, promotion filtering, and backend behavior were not changed.

## Final verification

- Production build: **PASS**
- Full unit suite: **48/48 PASS**
- Targeted customer homepage browser test: **2/2 PASS**
  - Desktop Chromium: 1440 × 900
  - Mobile Chromium: 390 × 844
- Fresh SQLite demo database and readiness health check: **PASS**
- Logo/header, promo CTA, search, category filters, product images, quantity control, cart badge, cart drawer, help actions, and mobile bottom navigation: **PASS**
- Desktop and mobile horizontal overflow check: **PASS**
- Browser console/page errors in targeted successful flows: **NONE**
- Critical/High application bugs remaining in session scope: **NONE**
- Cross-role UAT and database recovery suites were not rerun because this session changed only customer homepage presentation and targeted browser coverage. Their VERIFIED source-checkpoint results remain unchanged.

## Primary files changed in this session

- `app/page.js`
- `app/style.css`
- `tests/uat/roles.spec.mjs`
- `PROJECT_CHECKPOINT.md`

## Guardrails preserved

- No Checkout, Notifikasi page, Pesanan page, Pengaturan Akun, or Alamat redesign.
- No Manager role or RBAC change.
- No role removal or Kasir change.
- No loyalty redesign or birthday voucher.
- No Google Maps API or API key.
- No pricing/checkout engine change.
- No backend refactor or dependency upgrade.
- No merge to `main`.

## Next-action gate

Do not open another milestone from this checkpoint without a new explicit scope. Use `cac62b9e79fccb7d552196509de44112fe14590f` as the verified functional baseline for the approved Customer Homepage implementation.
---

## Customer UI Completion — ACCEPTED

Date: 2026-10-03

Status: **COMPLETED / MANUAL UAT ACCEPTED**

### Scope accepted

- Customer Homepage Desktop
- Customer Homepage Mobile
- 2-column responsive product grid on mobile
- Mobile bottom navigation:
  - Menu
  - Keranjang
  - Akun
  - Bantuan
- Checkout UI
- Post-checkout / Order Success
- Order Tracking
- Notification Desktop
- Notification Mobile
- Pesanan Desktop
- Pesanan Mobile
- Cart Sheet
- Account Sheet
- Customer Support UI
- Customer Support interaction
- Hubungi Admin opens internal Customer Support
- WhatsApp retained only as general/fallback contact
- Hubungi Driver remains dependent on driver assignment/delivery phase
- Responsive mobile polish

### Verification

- Production build: PASS
- Unit tests: 48/48 PASS
- Manual Desktop UAT: PASS
- Manual Mobile UAT: PASS
- Customer Mobile Final Fix: ACCEPTED

### Known deferred functional work

The following are NOT part of this completed UI milestone and remain for Customer Functional Completion:

- QRIS payment integration
- Birthday voucher automation
- OTP email delivery
- Maps API integration
- Final payment status automation

### Next milestone

**CUSTOMER FUNCTIONAL COMPLETION**

Do not redesign Customer UI unless a functional implementation requires a minimal compatibility change.

---

## Customer Functional Completion #1 — Shipping / Ongkir Core

Date: 2026-10-03

Status: **COMPLETED / AUTOMATED VERIFIED**

### Clean source-control baseline

- Accepted Customer UI parent: `42fc282cad623492413b33db849f5765c7a4e50d`
- Clean shipping implementation: `f2007d5d02376981c8d7d402cba048ca651e398a`
- The shipping commit contains only Shipping/Ongkir Core implementation and related tests.

### Final delivery rule

- `0–5 km`: gratis ongkir.
- `>5–15 km`: `ceil(distance_km - free_radius_km) × delivery_fee_per_km`.
- `>15 km`: quote unavailable; checkout blocked and create-order rejected server-side.
- Default demo configuration remains 5 km free radius, Rp2.500 per started additional kilometer, and 15 km maximum radius.
- Quote and create-order use the same Haversine/config foundation; create-order always recalculates distance, delivery fee, and final total server-side.

### Scope completed

- Added `POST /api/delivery/quote` using the saved customer address coordinates.
- Checkout displays actual distance, free/paid delivery status, server-calculated fee, and final total.
- Out-of-radius and invalid quotes disable checkout without creating an order.
- Delivery configuration is validated and no longer returned/saved as hardcoded values by the settings API.
- Invalid coordinates, negative configuration, and free radius greater than max radius are rejected.
- Client-supplied distance, delivery fee, and total are not trusted.

### Verification

- Reconciliation targeted shipping/settings tests: **6/6 PASS**.
- Original shipping full unit suite: **49/49 PASS**.
- Original shipping production build: **PASS**, including dynamic route `/api/delivery/quote`.
- Reconstructed shipping files were byte-equivalent to the previously passing `be29d22` implementation, so build was not repeated during source-control reconciliation.
- Boundary coverage: 0 m, 5.000 m, 5.001 m, 15.000 m, and 15.001 m.
- Invalid latitude/longitude: rejected.
- Manipulated client delivery fee: ignored; persisted order values come from server calculation.
- Invalid `free_radius > max_radius`: rejected.
- Out-of-radius create-order inserts no order.

### Guardrails preserved

- Customer UI Desktop/Mobile remains the accepted `42fc282` baseline.
- No voucher, loyalty, birthday voucher, QRIS/payment gateway, OTP, Maps API, Manager/RBAC, Kasir removal, Admin redesign, Kitchen/Driver redesign, dependency upgrade, or deployment work.

---

## Customer Functional Completion #2 — Voucher Claim & Redeem

Date: 2026-10-03

Status: **COMPLETED / AUTOMATED VERIFIED**

### Source-control baseline

- Parent checkpoint: `b1c5c27b4f3f016a48fea7a80dab543da9b597e1`
- Implementation commit: `24f51b147b47028875b049435f991145a415e93f`
- Customer UI and Shipping/Ongkir Core remain locked.

### Scope completed

- Added customer voucher states: `AVAILABLE`, `CLAIMED`, `USED`, `EXPIRED`, and `UNAVAILABLE`.
- Claim ownership is bound server-side to the authenticated customer; duplicate claim is idempotent and cannot create a second row.
- Checkout accepts only a claimed, unused, active, in-period, in-quota voucher owned by that customer.
- Percent and fixed discounts, minimum order, maximum discount, and global quota are calculated and validated server-side.
- Final total is recalculated server-side as `subtotal - voucher_discount + delivery_fee`; client-supplied discount and total are not trusted.
- Voucher redemption, order creation, global `used_count`, and per-customer claim state commit in one transaction.
- Checkout idempotency prevents double redemption; a failed pre-commit order rolls back voucher usage.
- Voucher + Loyalty Reward stacking is blocked by the v1.0 contract without implementing the Loyalty engine.
- Checkout UI reuses the accepted layout and exposes claim, select, eligibility feedback, actual discount, and final total without redesign.
- Added MySQL migration `013_voucher_claims.sql` and equivalent SQLite runtime upgrade/schema support.

### Verification

- Targeted voucher lifecycle retest: **10/10 PASS**.
- Targeted voucher/promo/shipping/MySQL-operations set: **20/20 PASS**.
- Full unit suite: **58/58 PASS**.
- Production build: **PASS**.
- Ownership, unclaimed rejection, minimum order, expired/inactive rejection, percent/fixed calculation, maximum cap, manipulated client discount, used-voucher rejection, double submit, shipping fee inclusion, quota consistency, non-stacking, and pre-commit rollback: **PASS**.

### Guardrails preserved

- No Loyalty earn/redeem engine, Owner Loyalty Rules, birthday voucher, QRIS/payment gateway, Maps API, OTP, Manager/RBAC, Kasir removal, Admin/Kitchen/Driver redesign, dependency upgrade, or deployment.
- No Customer UI redesign and no Shipping/Ongkir formula change.

---

## Customer Functional Completion #3 — Loyalty Core

Date: 2026-10-04

Status: **COMPLETED / AUTOMATED VERIFIED**

### Source-control baseline

- Parent checkpoint: `4ffb05b3e1a2b27fcb7134faef0b64e447dc88b8`
- Implementation commit: `ff0aeaf66555546849902ba0769be6fc6b0f9048`
- Customer UI, Shipping/Ongkir Core, and Voucher Claim & Redeem remain locked.

### Final earn and redeem rules

- Earn rate is fixed at Rp10.000 eligible merchandise net per point, using completed multiples (`floor`).
- Earn base is merchandise subtotal after the applied voucher or loyalty reward discount and excludes delivery fee.
- Points are credited only after an order is both `DELIVERED` and payment is `PAID`; pending, failed, expired, or cancelled orders earn no points.
- Completion/payment retries are idempotent per order and cannot award points twice.
- Owner-configurable rewards support `PERCENT` and `FIXED`, minimum order, optional maximum discount, points required, and active/inactive state.
- Customers may use one eligible loyalty reward per checkout; reward, balance, discount, and final total are recalculated server-side.
- Voucher and loyalty reward stacking is rejected.
- Redemption is atomic with order creation, cannot make the balance negative, and double submit cannot deduct twice.
- Cancelling an order restores redeemed points exactly once and never awards earned points.
- Loyalty ledger entries are auditable as `EARN`, `REDEEM`, and `RESTORE`, with order and reward-rule context.

### Verification

- Dedicated Loyalty Core tests: **14/14 PASS**.
- Targeted loyalty/voucher/delivery/settings/flow/payment/MySQL-operation tests: **39/39 PASS**.
- Full unit suite: **73/73 PASS**.
- Production build: **PASS**.
- Boundary earn values Rp9.999, Rp10.000, Rp19.999, Rp20.000, Rp52.000, and shipping exclusion: **PASS**.
- Server-side reward validation/calculation, insufficient balance, inactive reward, minimum order, percent/fixed discount, maximum cap, manipulation resistance, non-stacking, double-submit protection, negative-balance prevention, cancellation restore, and net-merchandise earn after redemption: **PASS**.

### Guardrails preserved

- No Customer UI redesign and no Shipping/Ongkir or Voucher lifecycle reimplementation.
- No QRIS/payment gateway, birthday voucher, OTP, Maps API, Manager/RBAC, Kasir removal, Admin/Kitchen/Driver redesign, Web Push, dependency upgrade, or deployment work.
- Do not open the next functional milestone without a new explicit scope.
