# Warkost Bahagia — Project Checkpoint

## Active baseline

- Branch: `session/2a-customer-ui-polish`
- Accepted Customer UI baseline: `42fc282cad623492413b33db849f5765c7a4e50d`
- Shipping core implementation commit: `f2007d5d02376981c8d7d402cba048ca651e398a`
- Milestone: Customer Functional Completion #1 — Shipping / Ongkir Core
- Status: **COMPLETED / AUTOMATED VERIFIED**
- Verification date: 2026-10-03

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
- Voucher claim/redeem
- Loyalty earn/redeem
- Owner-configurable loyalty rewards
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
