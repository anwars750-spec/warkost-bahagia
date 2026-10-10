# Warkost Bahagia — Project Checkpoint

## Active baseline

- Branch: `ui/admin-operasional-v1`
- Accepted Customer UI baseline: `42fc282cad623492413b33db849f5765c7a4e50d`
- Shipping core implementation commit: `f2007d5d02376981c8d7d402cba048ca651e398a`
- Shipping core checkpoint: `b1c5c27b4f3f016a48fea7a80dab543da9b597e1`
- Voucher lifecycle implementation: `24f51b147b47028875b049435f991145a415e93f`
- Voucher lifecycle checkpoint: `4ffb05b3e1a2b27fcb7134faef0b64e447dc88b8`
- Loyalty core implementation: `ff0aeaf66555546849902ba0769be6fc6b0f9048`
- Loyalty core checkpoint: `f61c9f0943a21f05aa0c69675082f54d067e829e`
- QRIS/Payment provider-neutral implementation: `e0ac1dd4514e642c48e9dbaa8592d346dc609bdd`
- Customer UI Batch B implementation: `a038abf3dd92416f3aa1835dfb144ae182d40031`
- Customer UI Batch B checkpoint: `ab7854cca9c643cf6185847b606f7c384bea5b13`
- Batch B UAT hotfix implementation: `a38a115ad068f16021a8d9729b703d4e7c91f199`
- Batch B final visual polish implementation: `1da678313b3fb18cf4454099c1fe36988e3eaa87`
- Batch B voucher UAT correction implementation: `9fabbc126764f010a58e787aedf073a5063dfb28`
- Batch B Final UAT Polish Round 3 implementation: `c610503e02c377e1e35b20e2e66f4713429edd62`
- Batch B transparent logo + Checkout Quick Address implementation: `142225de0c9dae246085ea400103b392fc598d50`
- Batch B final pre-lock checkpoint: `b1495990d8a5f12df44930e49373edca54c634a0`
- Customer UI Batch B final lock: `75f049c5cd53b5d98b28f58231c13dc2a3f7b251`
- Customer UI Batch B status: **VERIFIED / ACCEPTED / LOCKED**
- Customer OTP Email Core implementation: `236028a0708298d8d0a6825efaac19e662bb1668`
- Manager / RBAC Core + Kasir Removal implementation: `53636e8c01b887afe3cac9134cfa0fd8f9b81ff9`
- Manager RBAC Settings hotfix implementation: `038c82d7c159d1bd2bee17cdc03553fa4b24385e`
- Admin + Driver Operational Flow hotfix implementation: `72d2685295d5a86c587a4aa09373f4925a193db9`
- Admin UI Final Regression Stabilization implementation: `5db3642804c4cb264410ae24e245da8064cae6eb`
- COD Payment Integrity + Cash Settlement implementation: `acfd4ad440b1af996f68df2284d0be3bdd219849`
- Admin Order Filter Architecture implementation: `4456119cee6fb5e0d62eb9c1564f4daf75aa8c9c`
- Batch COD Settlement Backend implementation: `590d56f727f5d1cb2ff47d590678e24b213affed`
- Driver Multi-order Trip + Grouped COD UI implementation: `d506e466ad999a708be69fbd1a5d582978c8dadf`
- Manager Control Center V1 implementation: `0289d0eb593f162900c5f2f039ef0100f96bde96`
- Current milestone: Manager Control Center V1
- Current status: **VERIFIED**
- Verification date: 2026-10-10

## Manager Control Center V1

### Manager dashboard and analytics

- Added a Manager-only, server-authoritative analytics service and API with one shared period contract: Hari ini, Kemarin, 7 hari, Bulan ini, and validated custom date range.
- Ringkasan Penjualan reports Total Pesanan, verified Revenue, Qty Terjual, AOV, PAID, Selesai, Menunggu, Disiapkan, Siap Antar, and Dalam Pengantaran from the same selected period.
- Revenue uses orders whose payment status is `PAID` and excludes `CANCELLED`; status analytics use the valid operational states `PENDING` through `DELIVERED`. Failed, expired, and unpaid payments never contribute revenue.
- Trend combines order count and revenue using hourly buckets for a single day and daily buckets for multi-day ranges.
- Category contribution is limited to the three main categories (`Makanan`, `Minuman`, `Bahan Baku`); subcategories remain separate in their own ranking.
- Product ranking supports Revenue and Qty. GRAM quantities render as `100 g`, `500 g`, `1 kg`, and `1,5 kg`; PCS stays integer-based.
- Deterministic insights are generated only from actual aggregate results. Empty periods return intentional zero/empty states and never fabricate insight.

### Product Master, routing, and stock

- Manager Dashboard, Produk & Menu, Subkategori, and unified Stok now use a dedicated responsive React workspace matching the approved warm Warkost desktop/mobile direction.
- Product create/edit/deactivate continues to mutate the existing shared `products` record. No per-role product copy or analytics table was introduced.
- Product image upload reuses the existing validated media pipeline; Product Master includes a safe local fallback thumbnail.
- Category/subcategory ownership, active-state, PCS/GRAM, price unit, minimum, step, stock threshold, and integer-Rupiah validation remain server-side.
- Routing stays derived from the main category: Makanan → Customer + Kitchen; Minuman/Bahan Baku → Customer + Admin.
- New API requests immediately read the latest Product Master. Existing authenticated screens use bounded 20-second refresh for relevant catalog/stock visibility without introducing a broad realtime engine.
- Deactivated products disappear from the orderable Customer catalog while historical `order_items` name/price/unit snapshots remain intact.
- Manager stock reuses the unified inventory engine and exposes Current, Reserved, Available, unit, low-stock state, and reasoned/audited adjustment. Existing Admin/Kitchen read-only scopes are unchanged.
- Desktop navigation: Dashboard, Produk & Menu, Subkategori, Stok, Promo, Notifikasi, Keluar. Mobile navigation: Dashboard, Produk & Menu, Stok, Promo, Lainnya; Lainnya exposes Subkategori, Notifikasi, and Keluar.

### Security and verification

- Manager analytics is enforced server-side as Manager-only; unauthenticated access returns 401 and unauthorized roles return 403.
- Existing Product, Subcategory, media upload, and stock mutation capabilities remain server-authoritative and were not weakened.
- Dedicated Manager Control Center tests: **7/7 PASS**.
- Manager/Product/Stock/RBAC focused suite: **29/29 PASS** before final source formatting; final affected retest: **26/26 PASS**.
- Customer Cart/Checkout, Admin, Kitchen, Driver, inventory, and operational relevant regression: **50/50 PASS**.
- Full unit suite: **205/205 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- `git diff --check`: **PASS**.
- Migration: **none**.
- Critical defects: **0**.
- High defects: **0**.

## Driver Multi-order Trip + Customer Wait Notice + Grouped COD UI

### Server-authoritative availability and trip lifecycle

- Customer order responses now derive the delivery wait indicator from current server state: an unassigned active order shows the delay notice when no online Driver is immediately available at the store, including when Drivers still have nominal capacity but are already away with `PICKED_UP`/`ON_DELIVERY` work.
- An idle online Driver suppresses the notice; assignment suppresses it and returns the Customer to the normal assigned/delivery status flow.
- `MAX_ACTIVE_DELIVERIES` remains locked at 5. `Ambil Semua Pesanan` atomically claims only unassigned `READY` orders up to the authenticated Driver's remaining capacity.
- Driver, order, and unique delivery ownership checks run inside the existing SQLite/MySQL transaction abstraction. Concurrent Drivers cannot claim the same order, and offline Drivers are rejected.
- A Driver with a `PICKED_UP` or `ON_DELIVERY` trip cannot claim a new pickup group. Individual claim follows the same realistic trip guard.
- `Pickup Semua` atomically moves only that Driver's accepted `ASSIGNED` orders to `PICKED_UP`, recording an order event, audit entry, and Customer notification for every affected order. Retrying is idempotent and creates no duplicate events.
- Delivery remains strictly per order through `ON_DELIVERY` and `DELIVERED`; no batch delivery-completion action was introduced.

### Driver and grouped COD presentation

- Driver order UI now includes a responsive trip summary for active load, ready orders, picked-up orders, and authoritative grouped COD amount.
- Contextual actions expose `Ambil Semua Pesanan`, `Pickup Semua`, and `Setoran COD`; the first two call one atomic server operation rather than a client-side loop.
- Per-order Driver cash amount/reference inputs and per-order COD submission buttons were removed. Delivered COD cards retain read-only settlement status.
- The existing grouped COD settlement model and center remain authoritative. The Driver center groups every eligible delivered/unverified COD order automatically, uses the server-calculated expected amount, and excludes QRIS.
- Existing Admin grouped verification, per-order payment transition, loyalty idempotency, and the locked `cod_max_order_amount = 150000` rule remain unchanged.

### Verification

- Driver multi-order, wait-notice, dispatch, delivery communications, and grouped COD targeted suite: **30/30 PASS**.
- Final Driver/COD focused retest after cleanup: **25/25 PASS**.
- Admin filtering/stabilization, COD settlement, idempotency, loyalty, payment, and QRIS relevant regression: **38/38 PASS**.
- Full unit suite: **159/159 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- Critical defects: **0**.
- High defects: **0**.

## Batch COD Settlement Backend

### Architecture and data integrity

- Added a batch layer over the locked per-order `cod_settlements` records; every batch item references both its authoritative order and existing settlement record.
- MySQL migration `020_cod_settlement_batches.sql` and the SQLite runtime schema add `cod_settlement_batches` plus `cod_settlement_batch_items`, including unique order/settlement ownership and indexed Driver/status lookups.
- Driver batch eligibility is computed server-side and includes only assigned, delivered, unpaid/unverified `CASH` orders that are not already owned by another batch.
- QRIS, bank transfer, undelivered, cancelled/invalid, another Driver's, already paid, and already verified orders are excluded from batch cash totals.
- The expected batch amount is the sum of authoritative order totals and must remain consistent with payment and per-order settlement amounts.

### Batch lifecycle, concurrency, and compatibility

- Exact Driver submission enters `SUBMITTED`; underpayment or overpayment enters `NEEDS_REVIEW` and leaves every included payment unpaid.
- A Driver can correct the same unresolved batch; correction never allocates a batch discrepancy arbitrarily to an individual order.
- Only Admin can verify, and verification revalidates the Driver, every item, payment method/status, delivered status, and all authoritative amounts.
- Exact verification runs in one database transaction and atomically marks the batch and all per-order settlements `VERIFIED`, moves all included COD payments to `PAID`, records verifier/time, audits every payment transition, and runs loyalty independently/idempotently per order.
- Duplicate Driver submission and Admin verification are idempotent. Driver-row locking, batch-row locking, unique batch-item ownership, and conditional updates prevent duplicate active ownership and double verification.
- A forced mid-transaction payment failure rolls back the batch, every settlement/payment mutation, loyalty, and verification audit event.
- Existing single-order COD settlement remains available for orders not owned by a batch; conflicting individual actions are rejected once an order belongs to a batch.

### COD maximum transaction rule

- Locked setting: `cod_max_order_amount = 150000`.
- COD is accepted when the server-calculated final payable amount is at most Rp150.000.
- COD is rejected server-side when final payable exceeds Rp150.000, before order/payment/redemption data is committed.
- QRIS and other non-cash methods remain available above the COD limit.

### API and audit contract

- Driver backend contract: eligible/current batch (`cod-batch-driver`), batch detail (`cod-batch`), and submit/correct (`cod-batch-submit`).
- Admin backend contract: pending/history list (`cod-batches`), detail (`cod-batch`), and atomic verification (`cod-batch-verify`).
- Audit coverage includes `BATCH_CREATED`, `BATCH_SUBMITTED`, `BATCH_DISCREPANCY`, `BATCH_CORRECTED`, `BATCH_VERIFIED`, `BATCH_CLOSED`, per-order COD settlement close, and each payment transition with actor/role, Driver, batch, orders, amounts, and database timestamp.
- Locked Admin and Customer UI were not redesigned. Batch settlement UI/UAT remains a separate presentation milestone.

### Verification

- Dedicated Batch COD backend tests: **13/13 PASS**.
- Final Batch COD + existing single-order COD targeted regression: **18/18 PASS**.
- Payment, QRIS, loyalty, Driver/RBAC, Admin filter/stabilization, and MySQL migration relevant regression: **53/53 PASS**.
- Full unit suite: **152/152 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- Critical defects: **0**.
- High defects: **0**.

## Admin Order Filter Architecture

### Root cause and final architecture

- React previously rendered every Admin order while `AdminUiEnhancer` attempted to hide cards after render, leaving two competing filter owners and allowing stale `DELIVERED` cards under `Menunggu (0)`.
- Admin now has dedicated React state for status filter and search, separate from Customer order filters.
- `filterAdminOrders` computes the exact order array before React `.map()` renders cards; counts use the same order data and status mapping.
- Search covers numeric/order display ID (`#id` and `WBxxxxxx`), customer name, and address, and combines with the selected status filter.
- A refreshed order that leaves a status group immediately disappears from that React view and appears under its new group without a browser refresh.

### Removed legacy mechanism

- Removed imperative tool creation, DOM-owned `activeFilter/query`, `ensureTools`, `applyFilter`, filter listeners, and card visibility mutation from `AdminUiEnhancer`.
- Removed `AdminOrderFilterGuard` and its root layout mount.
- Removed legacy `[hidden]` CSS overrides used to force filter visibility.
- `AdminUiEnhancer` retains presentation-only card decoration; it no longer owns filtering or search.
- COD settlement shortcut resets the React-owned filter through an event contract and no longer edits the search/filter DOM.

### Verification

- Focused Admin filter architecture tests: **6/6 PASS**.
- Combined Admin filter + Admin UI stabilization + COD regression: **15/15 PASS**.
- Three complete `Semua → Menunggu → Selesai → Menunggu → Semua` cycles: **PASS**.
- Delivered-only count/visibility contract, combined search, live status movement, detail contract, and COD settlement contract: **PASS**.
- Full unit suite: **139/139 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- Playwright Chromium executable: **UNAVAILABLE**; browser dependencies were not downloaded.
- Critical defects: **0**.
- High defects: **0**.

## COD Payment Integrity + Cash Settlement

### Final state machine and integrity guards

- COD (`CASH`) remains `UNPAID` before and after terminal `DELIVERED`; it cannot be marked `PAID` or `FAILED` through the generic Admin payment action.
- Reaching `DELIVERED` creates one idempotent `AWAITING_COD_SETTLEMENT` record using the server-owned payment amount and assigned driver.
- Only the assigned driver can submit cash, only after delivery, without any ability to change the expected amount or payment status.
- Driver submission moves the settlement to `SUBMITTED`; mismatched cash moves it to `NEEDS_REVIEW` with a signed discrepancy and keeps payment unpaid.
- Exact Admin verification moves the settlement to `VERIFIED`, records the verifier/time, and atomically changes payment to `PAID`.
- A verified settlement cannot be edited. Repeated verification is idempotent and does not repeat payment, loyalty, or financial audit effects.

### Data, audit, and compatibility

- Added `cod_settlements` with one row per order, driver ownership, expected/submitted amounts, evidence reference, verifier, timestamps, status, and discrepancy.
- Added MySQL migration `019_cod_settlements.sql`, SQLite runtime schema/upgrade support, MySQL schema validation, and readiness probing.
- Existing delivered/unpaid COD orders are backfilled to `AWAITING_COD_SETTLEMENT`; historical already-paid records are not reclassified without proof.
- Audit records cover settlement awaiting, driver submission, discrepancy, verification, close, and payment transition with actor, role, order, amounts, and timestamps.
- Loyalty remains gated by `DELIVERED + PAID`; COD verification triggers the existing idempotent award path exactly once.

### UI integration

- Locked Admin Operasional layout was preserved; only settlement status and an eligible Admin verification action were added.
- Generic `Tandai lunas/gagal` actions now apply only to bank transfer, never COD.
- Driver receives a minimal delivered-order cash handoff form; discrepancy can be corrected and resubmitted.

### Verification

- Targeted COD/payment/order/loyalty/report/notification/MySQL regression: **31/31 PASS**.
- Dedicated COD settlement scenarios (16 required integrity cases across 5 focused tests): **PASS**.
- Full unit suite: **133/133 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- Critical defects in milestone scope: **0**.
- High defects in milestone scope: **0**.
- Manual UAT remains required for the exact Driver submission → Admin verification click path.

## Admin UI Final Regression Stabilization

### Root cause

- Admin enhancers were mounted globally from `app/layout.js` even when their view was inactive.
- Multiple body-wide `MutationObserver` instances inferred routes from headings/native panels and competed over React-owned navigation, body classes, enhanced roots, and portal content.
- Floating Stok navigation, successive Printer/Customer guards, delayed callbacks, and CSS route fences could restore stale or mixed UI after React view changes.

### Deterministic lifecycle fix

- React `role + view` in `app/page.js` is now the single Admin workspace lifecycle owner.
- Admin navigation is React-owned in the final order: `Operasional | Pelanggan | Stok | Printer | Notifikasi | Keluar`; active state and icons no longer depend on DOM injection.
- Operasional, Pelanggan, Stok, and Printer enhancers mount only while their matching view is active and clean up on React unmount.
- Stok and Printer retain their approved portal presentations, with body class/root cleanup bound to the active view.
- Pelanggan mobile and Operasional card polish use explicit render events instead of global body observers.
- Obsolete view coordinator, stability guard, singleton guard, legacy Stock/Printer enhancers, polling heartbeat, floating navigation, and CSS route fences were removed.
- Existing Admin business permissions and all non-Admin flows were unchanged.

### Focused verification

- Targeted Admin lifecycle/customer/notification/RBAC tests: **15/15 PASS**.
- New structural lifecycle suite: **4/4 PASS**.
- Production build with Next.js 16.3.6: **PASS**.
- Desktop/mobile Playwright 3-cycle regression spec: **2 projects discovered and ready**.
- Browser execution in this Work environment: **BLOCKED before app launch** because the Playwright Chromium executable is not installed; no browser download was attempted.
- Structural checks confirm one React-owned active view, deterministic Stok/Printer roots, removal of heading-based routing/global observers, no stale route-fence CSS, and view-keyed notification cleanup.

### Files and areas changed

- `app/page.js`, `app/layout.js`
- Active Admin Operasional, Pelanggan, Stok, Printer, and Notifikasi enhancers
- Admin stability/icon CSS
- Obsolete Admin coordinator/guard/enhancer files removed
- `tests/admin-ui-stabilization.test.mjs`
- `tests/uat/admin-ui-stabilization.spec.mjs`
- `ADMIN_UI_REGRESSION_AUDIT.md`

### Remaining verification limitation

- Run `tests/uat/admin-ui-stabilization.spec.mjs` on a local machine with Playwright Chromium to execute the specified cross-view sequence three times at desktop and mobile viewports. This is an environment/browser availability limitation, not a known application defect.
- No Critical or High defect was found by the completed focused tests and production build.

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

- Production QRIS provider adapter and credentials
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

---

## Customer Functional Completion #4 — QRIS / Payment Core

Date: 2026-10-04

Status: **PROVIDER-NEUTRAL VERIFIED / PRODUCTION PROVIDER BLOCKED**

### Source-control baseline

- Parent checkpoint: `f61c9f0943a21f05aa0c69675082f54d067e829e`
- Implementation commit: `e0ac1dd4514e642c48e9dbaa8592d346dc609bdd`
- Customer UI, Shipping/Ongkir, Voucher Claim & Redeem, and Loyalty Core remain locked.

### Provider audit result

- The repository did not contain a real QRIS provider integration, production credentials, or an official provider webhook contract.
- A provider-neutral payment lifecycle and adapter boundary were implemented without inventing or naming a production vendor.
- Local QRIS simulation is available only when explicitly enabled for local/test use.
- Production configuration rejects simulation mode, and customer/API requests cannot mark QRIS as paid.

### Scope completed

- Added QRIS as a payment method with server-calculated payment amount, unique transaction/provider references, QR/payment payload fields, server expiry, and customer-safe payment status retrieval.
- Added trusted webhook processing with signature verification, event-id uniqueness, transaction locking, and idempotent terminal processing.
- Added stock reservations for pending QRIS; `PAID` commits stock and fulfillment exactly once, while `FAILED`/`EXPIRED` release reservations exactly once.
- Active QRIS reservations are respected by other order flows, preventing reserved stock from being consumed by a concurrent non-QRIS confirmation.
- Checkout replay, duplicate webhook, refresh, and repeated terminal callbacks do not create duplicate orders, stock movements, fulfillment, print jobs, or critical notifications.
- QRIS amount always uses server total: `subtotal - voucher_discount OR loyalty_discount + delivery_fee`.
- Failed/expired payments restore consumed voucher or loyalty redemption exactly once and do not earn loyalty points.
- Late `PAID` after `expires_at` is rejected, including when the expiry worker has not yet changed the stored status.
- Added provider-neutral webhook route `/api/payment/webhook` and MySQL migration `015_qris_payment_core.sql` with equivalent SQLite runtime upgrade support.
- Locked checkout/tracking UI received only minimal QRIS method, amount, countdown, status refresh, and terminal-state compatibility changes.

### Verification

- Dedicated QRIS/payment lifecycle tests: **7/7 PASS**.
- Targeted payment plus locked-core regression set: **53/53 PASS** before the final reservation/late-payment hardening; both final hardening cases then passed in the dedicated QRIS suite.
- Full unit suite after final hardening: **81/81 PASS**.
- Production build after final hardening: **PASS**, including dynamic route `/api/payment/webhook`.
- Server-total integrity, manipulated client amount, pending creation, trusted paid callback, stock commit/release, duplicate callbacks, fulfillment idempotency, invalid webhook, provider reference, expiry, refresh, checkout replay, voucher, loyalty, shipping, non-stacking, and no loyalty earn on failed/expired payment: **PASS**.

### External production blocker

- A real QRIS provider has not been selected or integrated, and no provider credentials or official webhook-signature specification are available in this environment.
- Production cannot generate or accept a real QRIS payment until a provider is selected and its adapter, secure environment credentials, endpoint configuration, and official callback verification are supplied.
- No secrets were requested, generated, or hardcoded.

### Guardrails preserved

- No redesign or reimplementation of Customer UI, Shipping, Voucher, or Loyalty.
- No birthday promo, OTP, Maps API, Manager/RBAC, Kasir removal, Admin/Kitchen/Driver redesign, Web Push, deployment, dependency upgrade, or unrelated refactor.
- Stop at the external provider boundary; do not start another milestone without explicit scope.

---

## Customer UI Batch B Finalization

Date: 2026-10-04

Status: **COMPLETED / AUTOMATED VERIFIED**

### Source-control baseline

- Parent checkpoint: `a7ec5f8202870be9227f59fc14a09c7526cc3922`
- Implementation commit: `a038abf3dd92416f3aa1835dfb144ae182d40031`
- Customer UI, Shipping/Ongkir, Voucher, Loyalty, and QRIS/Payment Core remain locked.

### Targeted audit result

- Account/profile: **PARTIAL → PASS**. Existing secure password/session foundation was retained; own-profile response, email/phone/birth-date editing, server validation, and safe public fields were completed.
- Saved addresses: **PARTIAL → PASS**. Existing ownership/versioned-history/checkout foundation was retained; deterministic default-address behavior and non-technical coordinate UI were completed.
- Help Center: **PARTIAL → PASS**. Existing internal support/order context and driver gating were retained; required topics, desktop title/drawer contract, and mobile Account-only full-height access were completed.
- Login/Register: **PARTIAL → PASS**. Existing scrypt/session/rate-limit foundation was retained; email-or-phone login, complete registration fields, password confirmation, consent, and birth-date persistence were completed.
- Google/Apple customer login: **PASS** (not exposed).
- OTP backend/provider: **DEFERRED BY SCOPE**; no fake OTP success path was introduced.

### Scope completed

- Customer profile returns only `name`, `email`, `phone`, and `birth_date`; password hashes and internal identifiers are not included in the account payload.
- Profile changes and password changes are validated server-side; a password change revokes prior sessions and issues only the new current session.
- Login accepts customer email or normalized Indonesian phone number; registration enforces all required fields, password confirmation, consent, and a valid past birth date.
- Saved addresses support add, history-preserving edit, delete, multiple records, and one deterministic default per customer. The first address becomes default; deleting the default promotes the newest remaining active address.
- Address CRUD/default operations enforce authenticated-customer ownership. Raw latitude/longitude fields are hidden from customer forms while stored coordinates and checkout delivery calculations remain intact.
- Help Center includes Pesanan, Pembayaran, Voucher & Poin, Pengiriman & Ongkir, Akun & Alamat, and FAQ; active order context remains customer-scoped, Admin support remains internal, and Driver contact remains gated by assignment plus delivery phase.
- Desktop Help remains a 460px right drawer. Mobile Help is removed from bottom navigation and opens from Akun as a full-height support experience.

### OTP boundary

- No email provider, OTP generation, delivery, verification backend, resend backend, or password-reset OTP was implemented.
- Registration explicitly reports `emailVerification: NOT_CONFIGURED`; it does not claim that an email or OTP was verified.
- Future OTP integration point: gate session issuance/account activation after `registerCustomer` persists the pending account, then activate only after a dedicated verified OTP transaction.

### Verification

- Targeted Batch B plus locked checkout/support tests: **20/20 PASS**.
- Targeted regression fixes for MySQL migration ordering, SQLite legacy upgrade, and driver phone uniqueness: **6/6 PASS**.
- Final dedicated Batch B contract test: **5/5 PASS**.
- Full unit suite after fixes: **89/89 PASS**.
- Production build: **PASS**.
- Responsive source contracts for desktop drawer width, mobile full-height Help, three-item mobile navigation, Account→Bantuan access, required topics, and no raw coordinate input: **PASS**.
- Live browser visual UAT was not rerun because no existing Chromium/browser executable was available; no browser download or Cloud Browser localhost retry was attempted.

### Guardrails preserved

- No Customer Homepage/Checkout redesign, OTP Email implementation, Google Maps API, birthday promo, Manager/RBAC, Kasir removal, BTN adapter, Admin/Kitchen/Driver redesign, deployment, dependency upgrade, or unrelated refactor.
- Do not start OTP Email, Maps, or another milestone without explicit scope.

---

## Batch B Visual + Login UAT Hotfix

Date: 2026-10-04

Status: **VERIFIED**

### Source-control baseline

- Parent checkpoint: `ab7854cca9c643cf6185847b606f7c384bea5b13`
- Implementation commit: `a38a115ad068f16021a8d9729b703d4e7c91f199`
- Customer UI, Shipping/Ongkir, Voucher, Loyalty, QRIS/Payment, and Batch B functional behavior remain locked.

### Root-cause audit

- Guest catalog was not blocked by API or frontend authorization. The local runtime used the default SQLite path, but no populated `data/warkost.db` existed, so the public storefront received an empty catalog.
- `customer@warkost.local` was seed-only and its password depended on the first `SEED_DEMO_PASSWORD` value used for that database. This made previously quoted local credentials non-deterministic even though scrypt verification and account-status enforcement were working correctly.
- The hydration warning was caused by a browser extension injecting attributes. Incognito was clean; no application hydration logic was changed.

### Scope completed

- Guest storefront continues to use the public `/api/menu` path and now exposes only public-safe category/product fields together with active in-period promotions.
- Guest search, category filters, product imagery, prices, and promo discovery remain available; protected product/order actions route to Login.
- Login/Register now use the approved warm Warkost onboarding family: branded food hero, benefits, dedicated desktop Login and Register cards, and responsive mobile Intro/Login/Register with visual-ready future OTP/Success steps.
- Google/Apple sign-in remains absent. Registration retains name, email, phone, password confirmation, birth date, and consent. No OTP success or account-verification bypass was added.
- Added explicit local-only `npm run setup:uat`. It rejects production and remote/MySQL databases, uses a standard scrypt hash, is idempotent, and only refreshes the reserved `customer@warkost.local` fixture when deliberately invoked.
- Local fixture also ensures the existing three demo products, categories, active demo campaigns, loyalty account, and default address are available without inventing a second catalog foundation.

### Local development UAT account

- Setup: `npm run setup:uat`
- Email: `customer@warkost.local`
- Password: `WarkostLocal#2026`
- Scope: **LOCAL DEVELOPMENT ONLY**. The fixture cannot run in production and is not part of production request/runtime code.

### Verification

- Dedicated UAT hotfix tests: **8/8 PASS**.
- Batch B affected plus locked Shipping/Voucher/Loyalty/Payment regression set: **58/58 PASS**.
- Full unit suite: **97/97 PASS**.
- Production build: **PASS**.
- Live HTTP verification: **PASS** — 3 public products, 2 categories, 2 active promotions, private account returns 401 for guest, local customer login returns 200, and authenticated own-account lookup returns 200 without a password hash.
- Desktop/mobile onboarding source and responsive CSS contracts: **PASS**; updated Playwright UAT now scopes the Login card and covers guest storefront → protected-action Login routing.
- Browser visual automation was not rerun because no Chromium or `agent-browser` executable exists in the environment. No browser download or Cloud Browser localhost retry was attempted.

### Guardrails preserved

- Production authentication was not weakened: password hashing, active-account checks, email-or-phone login, customer ownership, rate limiting, and session behavior remain intact.
- No OTP backend/provider, fake OTP success, Maps, Manager/RBAC, Birthday Promo, BTN QRIS adapter, deployment, dependency upgrade, hydration workaround, or unrelated milestone work.
- Stop after this checkpoint; do not start another milestone without explicit scope.

---

## Batch B Final Visual Polish — 8 Corrections

Date: 2026-10-04

Status: **VERIFIED — NOT YET LOCKED**

### Source-control baseline

- Parent checkpoint: `f4c4713c0655e8e8c960bcd55f783ae8155814ca`
- Implementation commit: `1da678313b3fb18cf4454099c1fe36988e3eaa87`
- No Git bundle was created in this session.

### Corrections completed

1. Guest mobile header now reserves clear space between the full logo/brand and a compact elevated Login button at 360px widths.
2. Guest product action is shortened to `Pesan`; price and action have independent compact space in the two-column mobile card.
3. Desktop Login/Register logos use their full intrinsic 1672×941 aspect ratio with `object-fit: contain` and no negative offset.
4. Desktop onboarding now shows only the active form, defaults to Login, and reveals Register only through the explicit account switch action while retaining the brand hero.
5. Mobile auth order is branding/header → Login/Register selector → active form → promotional hero, with Login active by default.
6. Customer-facing Intro/Login/Register/OTP/Selesai stage chips were removed without adding or changing OTP backend behavior.
7. Mobile cart summary now presents cart badge, item count, subtotal, and a compact `Buka` action above the bottom navigation; homepage safe padding prevents content overlap.
8. Duplicate Account-page shortcut buttons were removed. The primary quick Account menu remains the single navigation entry point for Pesanan Aktif, Riwayat, Tracking, Voucher & Loyalty, Alamat, Pengaturan Akun, Bantuan, and Keluar.

### Verification

- Dedicated guest/auth/cart/account visual contract tests: **11/11 PASS**.
- Local fixture login, wrong-password rejection, inactive-account rejection, guest catalog, active promo, expired/inactive promo filtering, private-account blocking, and production fixture guard remain **PASS** in the same targeted suite.
- Final production build: **PASS** with `/` and all existing API routes compiled.
- Mobile breakpoint contracts covering 360×800 and 390×844: **PASS** — two-column products, compact CTA, auth form before hero, full contain logos, cart/nav separation, and safe bottom padding.
- Desktop breakpoint contracts covering 1366×768 and 1440×900: **PASS** — two-column hero/form composition, one active auth form, full logo, and preserved account navigation.
- Updated Playwright UAT covers guest `Pesan` → Login, Login/Register explicit switching, absence of stage chips, and mobile form-before-hero order. It was not executed because no existing Chromium or `agent-browser` executable is available; no browser was downloaded.

### Guardrails preserved

- No backend/business-rule, auth-security, OTP, Maps, Manager/RBAC, BTN QRIS, Shipping, Voucher, Loyalty, Payment, Checkout, address ownership, Orders/Tracking, or unrelated screen change.
- This visual polish is verified but does not mark Batch B as locked/final. Await explicit manual acceptance before any lock or bundle handoff.
- At this checkpoint, Checkout Quick Address remained gated; it was opened later by an explicit dedicated scope.

---

## Batch B Final Visual Polish + Voucher UAT

Date: 2026-10-04

Status: **VERIFIED**

### Recovery result

- Recovery started from a clean working tree with no staged or unstaged changes.
- The interrupted session had already committed all eight visual corrections in `1da678313b3fb18cf4454099c1fe36988e3eaa87` and its checkpoint in `a80c1baf640c9a2d70a28ecce3c24996ce17ce19`; those changes were preserved and not rebuilt.
- Each of the eight visual corrections was re-inspected and remained **PASS**.

### Voucher UAT correction

- A successful voucher claim now shows `Voucher berhasil diklaim.` for 2.5 seconds and dismisses automatically.
- A single managed timer is cleared before subsequent actions and on unmount, preventing stale or repeatedly recreated success feedback.
- Failure paths continue to show their actual error and never set the success message.
- Claiming and selecting are now separate actions; a newly claimed voucher is not silently auto-selected.

### `/api/voucher-quote` 422 audit

- The observed 422 was legitimate server validation: the claimed demo voucher requires a Rp30.000 minimum while a common single-item cart can be Rp18.000–Rp25.000.
- The request payload contained the claimed promotion ID plus the current cart items. The voucher remained selected and the quote effect ran again whenever the item/quantity signature changed; development Strict Mode may also remount effects, but repeated completed invalid requests were avoidable application behavior.
- The client now checks cart presence, claimed ownership state, minimum subtotal, and voucher/loyalty non-stacking before requesting a quote. Invalid/incomplete state receives local explanatory feedback instead of repeatedly calling the endpoint.
- Valid voucher quotes and order creation remain server-authoritative. Voucher rules, minimum order, discounts, quota, ownership, shipping totals, and non-stacking were not weakened.

### Verification

- Syntax, dedicated UAT-hotfix contract, and diff validation: **12/12 PASS**.
- Affected Voucher/Loyalty/QRIS-Payment regression set: **43/43 PASS**.
- Production build: **PASS** with `/` and all existing API routes compiled.
- Existing responsive contracts for 360×800, 390×844, and desktop remain **PASS**; no browser executable was available, so no browser download or repeated browser attempt was made.
- Guest catalog/auth routing and deterministic local customer login remain **PASS** in the affected UAT-hotfix regression.

### Guardrails preserved

- No bundle was created.
- No Checkout Quick Address, OTP, Maps, Manager/RBAC, Birthday Promo, BTN QRIS adapter, or unrelated milestone work was started.

---

## Batch B Final UAT Polish Round 3

Date: 2026-10-04

Status: **VERIFIED — NOT YET LOCKED**

### Source-control baseline

- Parent checkpoint: `f680b439d6c7e80a6c88c95866ce4f340cc8f939`
- Implementation commit: `c610503e02c377e1e35b20e2e66f4713429edd62`
- No Git bundle was created in this session.

### Corrections completed

1. Removed the redundant `Beranda` action from the customer auth header. Desktop auth navigation is now `Menu | Bantuan | Masuk`; mobile retains its compact auth header without a redundant Beranda action.
2. Replaced the unreliable transparent PNG used by Login/Register cards with the existing complete 1536×864 Warkost JPG asset. The PNG exposed metadata but failed full pixel decoding with a libpng read error, which made its rendered result unreliable.
3. Added auth-specific logo sizing for the header and both form states, with intrinsic 16:9 proportion, automatic height, centered `object-fit: contain`, no border-radius mask, no clip path, and visible heading overflow. Mobile uses constrained responsive widths without changing the artwork.

### Targeted verification

- Guest/auth/local-login and touched visual contract suite: **13/13 PASS**.
- Desktop contract: Menu, Bantuan, and Masuk remain; Beranda is absent; Login and Register use the full decodable logo asset with contain sizing: **PASS**.
- Mobile 360×800 and 390×844 source/CSS contract: no Beranda, full contain logo, responsive width, existing form-before-hero order preserved: **PASS**.
- Local customer login, guest catalog, protected-action Login routing, cart summary, account navigation cleanup, voucher auto-dismiss, and voucher quote guard remain **PASS** in the same targeted suite.
- No browser executable was available and none was downloaded. The previous production build remains the latest build result; no broad build or unrelated suite was rerun for these two presentation-only corrections.

### Guardrails preserved

- No auth logic, OTP, Checkout, Shipping, Voucher, Loyalty, Payment, account ownership, Saved Addresses, Orders/Tracking, or unrelated UI was changed.
- Batch B was not marked locked/final at this checkpoint; Checkout Quick Address was subsequently opened by an explicit dedicated scope.

---

## Batch B Transparent Logo + Checkout Quick Address

Date: 2026-10-04

Status: **VERIFIED — NOT YET LOCKED**

### Source-control baseline

- Parent checkpoint: `ac8e64f882168ac4a059054c13950e66067d98d4`
- Implementation commit: `142225de0c9dae246085ea400103b392fc598d50`
- No Git bundle was created in this session.

### Transparent Warkost logo

- The black rectangle belonged to the JPG pixels, not the UI container. The previous transparent PNG exposed metadata but failed full pixel decoding with a libpng read error.
- Added `public/warkost-bahagia-logo-clean.png`, a valid 1672×941 RGBA asset generated from the approved logo with the complete lettering and dark outline retained while only the outer rectangular background was removed.
- All customer header and Login/Register logo usages now share this transparent asset. Desktop/mobile rendering uses intrinsic proportion, automatic height, centered `object-fit: contain`, and no mask, clipping, or black fallback asset.
- Pixel verification confirms a valid alpha channel with transparent corners and opaque logo content.

### Checkout Quick Address

- Checkout now provides an inline `+ Tambah lokasi lain` card; customers enter a label and complete address, with optional device-location capture through hidden coordinate fields.
- Save reuses the existing authenticated `address` endpoint. No customer ID is accepted from the client, so the address remains bound to the authenticated customer by the server.
- After creation, the account address list refreshes, the returned address ID is immediately selected for the current checkout, and the existing delivery quote effect recalculates distance and fee from server-stored coordinates.
- Existing default address remains unchanged when one already exists. The existing deterministic rule still makes the first address default when the customer previously had none.
- Cart, payment selection DOM, voucher selection, loyalty selection, subtotal, and checkout state are not reset. A synchronous submission guard plus disabled save state prevents accidental double submission.
- Success shows `Alamat berhasil ditambahkan.` and keeps the customer in Checkout. API/validation errors remain visible without clearing checkout state.

### Verification

- Targeted transparent-logo, Quick Address, guest/auth, and account tests: **20/20 PASS**.
- Address/Checkout/Shipping plus locked Voucher/Loyalty/QRIS-Payment affected regression: **46/46 PASS**.
- Full unit suite: **104/104 PASS**.
- Production build: **PASS** with `/` and all existing API routes compiled.
- No browser executable was downloaded or retried; responsive behavior is covered by the existing mobile/desktop CSS contracts and targeted source assertions.

### Guardrails preserved

- Shipping fee and checkout totals remain server-authoritative; client delivery-fee manipulation remains ignored by covered tests.
- No OTP, Maps API, Birthday Promo, Manager/RBAC, BTN QRIS adapter, broad Customer UI redesign, or unrelated milestone work.
- At this pre-acceptance checkpoint, Batch B remained unlocked; the subsequent manual UAT acceptance below supersedes that temporary gate.

---

## Customer UI Batch B — Final Acceptance and Lock

Date: 2026-10-04

Status: **VERIFIED / ACCEPTED / LOCKED**

### Accepted baseline

- Final Batch B implementation: `142225de0c9dae246085ea400103b392fc598d50`
- Final pre-lock checkpoint: `b1495990d8a5f12df44930e49373edca54c634a0`
- Automated verification and production build: **PASS**.
- Manual local desktop and mobile UAT: **PASS / ACCEPTED**.

### Manual acceptance coverage

- Guest catalog and active promotion visibility, search/filter discovery, and protected guest actions routing to Login: **ACCEPTED**.
- Desktop and mobile Login/Register flow, auth navigation, mobile header, local customer login, and final transparent Warkost logo: **ACCEPTED**.
- Customer product `Pesan` action, mobile cart summary, and Account navigation without duplicate actions: **ACCEPTED**.
- Account, Saved Addresses, Help Center, Orders/Tracking, and customer ownership protections: **ACCEPTED**.
- Voucher success auto-dismiss and corrected voucher-quote behavior: **ACCEPTED**.
- Checkout Quick Address, immediate new-address selection, Shipping/Ongkir recalculation, and preservation of cart/voucher/loyalty checkout state: **ACCEPTED**.
- No unresolved Critical or High issue remains within Customer UI Batch B scope.

### Lock declaration

- Customer UI Batch B is officially closed and locked at this checkpoint.
- Customer UI Batch B must not be redesigned, reopened, or broadly refactored unless a future integration requires a minimal compatibility change.
- Any compatibility change must preserve the accepted desktop/mobile visual language, navigation, customer flows, ownership controls, and locked Shipping/Voucher/Loyalty/Payment behavior.

### Future milestones outside Batch B

- OTP Email functional implementation.
- Google Maps integration.
- Manager/RBAC and Kasir removal.
- Birthday Promo.
- BTN QRIS production adapter.

Do not start any future milestone without a new explicit scope.

---

## Customer Functional — OTP Email + Forgot Password

Date: 2026-10-04

Manual acceptance date: 2026-10-05

Status: **VERIFIED / ACCEPTED / LOCKED**

### Source-control baseline

- Locked Customer UI Batch B parent: `75f049c5cd53b5d98b28f58231c13dc2a3f7b251`.
- OTP Email Core implementation: `236028a0708298d8d0a6825efaac19e662bb1668`.
- Automated verification checkpoint before manual acceptance: `a4e9d68c6cf515d6cda7907b767b196e58f1b519`.
- Customer UI Batch B remains **VERIFIED / ACCEPTED / LOCKED**; only minimal auth-screen compatibility was added.

### Targeted audit result

- **PASS:** scrypt password hashing, signed server session, persistent session revocation, customer ownership gates, registration field validation, login by email/phone, local UAT fixture, and database-backed request rate limiting.
- **PARTIAL:** approved OTP/success visual foundation and `Lupa password?` entry existed, but had no functional backend.
- **MISSING:** persistent OTP challenge, email transport, registration activation gate, resend/expiry/attempt enforcement, and password-reset lifecycle.
- **CONFLICT:** registration previously activated the customer and issued a normal session immediately; this was replaced by a pending-account flow.

### Registration OTP and activation

- Valid registration creates a `CUSTOMER` with `active=0` and no normal session.
- Existing active customers are backfilled as email-verified; pending registration is represented by `active=0` and `email_verified_at=NULL`.
- A cryptographically generated six-digit OTP is valid for 10 minutes, limited to five attempts, and stored only as a keyed HMAC hash.
- Successful verification atomically activates the account, records `email_verified_at`, consumes the challenge, creates the loyalty account if needed, and permits the first authenticated session.
- Duplicate verification is idempotent and cannot create another account, activation, or session.
- Resend has a server-side 60-second cooldown, invalidates the prior challenge, and starts a fresh expiry window.
- `REGISTRATION` and `PASSWORD_RESET` challenges are isolated and cannot authorize each other.

### Forgot password and session safety

- Reset request accepts email or phone and always returns the same generic anti-enumeration response.
- A valid active customer receives the reset OTP at the registered email; invalid/inactive identifiers do not trigger delivery.
- Successful OTP verification issues a short-lived, one-time reset token whose hash is stored server-side.
- Password replacement uses the existing scrypt architecture and runs atomically with reset-challenge consumption and revocation of every prior session.
- Old passwords, expired/consumed OTPs, reused reset tokens, and registration-purpose OTPs are rejected.

### Email transport

- Production transport is provider-neutral SMTP over direct TLS or required STARTTLS; SMTP settings are read only from environment variables.
- Production refuses the development transport and never silently falls back to the local outbox.
- Development/test delivery writes email previews to ignored `.uat/otp-outbox.json` (or `OTP_OUTBOX_PATH`) and never returns OTP plaintext through the browser API.
- `.env.example` documents variable names for `OTP_SECRET`, `EMAIL_TRANSPORT`, and `SMTP_*`; no credential or provider secret is committed.
- Email content contains Warkost branding, OTP purpose/code, 10-minute expiry, and a security notice; it contains no password, password hash, or session token.

### UI compatibility

- The locked Login/Register layout and Warkost branding remain intact.
- Registration now continues to the real OTP and success states; forgot password uses the same OTP visual language and password-reset state.
- Mobile countdown/resend, loading, validation, wrong/expired/attempt-exhausted feedback, and responsive card ordering are connected to server-authoritative behavior.
- Customer-facing debug stage chips remain absent.

### Verification

- Targeted OTP/Auth/Batch B/rate-limit/SQLite regression: **29/29 PASS**.
- Targeted MySQL migration contract: **4/4 PASS**.
- Final OTP transport/security retest after packaging fix: **7/7 PASS**.
- Full unit suite: **111/111 PASS**.
- Production build: **PASS**, including `/` and dynamic `/api/[action]`, with no final build warning.
- Local deterministic UAT customer remains active and can log in without being forced through registration OTP.
- Guest storefront, protected APIs, Checkout Quick Address, Shipping, Voucher, Loyalty, and QRIS/Payment regression coverage remains **PASS**.

### Manual UAT acceptance

- User manual Registration OTP UAT: **PASS** — new customer registration succeeded, the OTP verification screen appeared, and the OTP from the local development outbox verified successfully.
- Account activation UAT: **PASS** — the verified customer became `ACTIVE` and could continue into the normal customer flow.
- Forgot Password OTP UAT: **PASS** — the reset OTP verified successfully and the password update completed.
- Post-reset authentication: **PASS** — the old password was rejected and the new password was accepted.
- OTP expiry, resend cooldown, attempt limit, challenge-purpose separation, consumed-code replay protection, and resend invalidation remain **VERIFIED** by automated security coverage.
- Password reset session revocation is implemented and **VERIFIED**.
- Automated OTP/Auth verification, the full **111/111** unit suite, and production build all passed before manual acceptance.
- No unresolved Critical/High issue remains in Customer OTP Email Core scope.

### Production email configuration requirement

- Real production email delivery still requires deployment-provided `OTP_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` values.
- The development outbox is restricted to local/test environments. Production refuses the development transport and never silently falls back to it.
- This is an external production/deployment configuration requirement, not an unresolved OTP core implementation defect.

### Acceptance lock

- Customer OTP Email Core is officially **VERIFIED / ACCEPTED / LOCKED** following automated verification, production build, and successful user manual UAT.
- This locked core must not be redesigned, reimplemented, or reopened except for minimal production SMTP configuration compatibility or a verified integration defect.
- Google Maps, Manager/RBAC and Kasir removal, Birthday Promo, BTN QRIS production adapter, and every other future milestone remain outside this lock scope.

### Guardrails preserved

- No Google Maps, Manager/RBAC, Kasir removal, Birthday Promo, BTN QRIS adapter, Web Push, deployment, dependency upgrade, or unrelated milestone work.
- No broad Customer UI redesign and no change to locked Shipping/Voucher/Loyalty/Payment business rules.

---

## Manager / RBAC Core + Kasir Removal

Date: 2026-10-05

Status: **VERIFIED**

### Source-control baseline

- Locked Customer OTP Email Core parent: `fb1772c8ed3fc2e7b9c56bafad4b476918805024`.
- Manager/RBAC implementation: `53636e8c01b887afe3cac9134cfa0fd8f9b81ff9`.
- Locked Customer UI Batch B, Customer OTP Email Core, Shipping, Voucher, Loyalty, and Payment Core remain unchanged except for minimal role-integration compatibility.

### Targeted audit result

- The pre-milestone active roles were `OWNER`, `ADMIN`, `KITCHEN`, `DRIVER`, and `CUSTOMER`; `MANAGER` was missing.
- Authorization existed as scattered server role checks. It was consolidated into a reusable capability map and guard while retaining endpoint-level enforcement.
- No legacy Cashier/Kasir user existed in the inspected local runtime database.
- `CASHIER` occurrences in product preparation and order-station data are internal beverage-station identifiers, not an assignable/login role. They remain for order-history and Kitchen/Admin workflow compatibility; all customer/staff-facing labels identify the station as Admin minuman.
- Manager dashboard/navigation, Owner staff controls, final role schema, legacy role migration, and targeted RBAC coverage were previously missing.

### Final role and authorization model

- Final assignable roles are exactly `OWNER`, `MANAGER`, `ADMIN`, `KITCHEN`, `DRIVER`, and `CUSTOMER`.
- Owner retains operational oversight, reports, audit logs, loyalty rules, commercial oversight, and restricted staff management.
- Manager owns catalog/product/category/image/price/availability, stock, promotions/vouchers, and notifications through their dedicated APIs. Manager has no global Settings, Owner audit/security controls, or order-operation access.
- Admin owns order/payment cross-check, customer support/administration, operational coordination, and beverage preparation. Admin is denied catalog, stock master, promotion/voucher, commercial settings, and loyalty-rule mutation.
- Kitchen is limited to food preparation and relevant print/queue operations.
- Driver remains limited to its own assigned delivery context and valid delivery transitions.
- Customer protections and locked customer flows are unchanged.
- Protected server operations now call centralized capability checks and return `401` when unauthenticated and `403` when authenticated without permission. UI visibility is only a convenience and is not the security boundary.

### Cashier/Kasir removal and migration

- SQLite user schema and MySQL migration `018_manager_rbac.sql` enforce the final six-role model.
- Legacy `CASHIER`/`KASIR` users migrate deterministically to `ADMIN` while preserving user identity, dependent sessions/history, and an audit record.
- New Cashier/Kasir users cannot be assigned; stale non-final role sessions are rejected by session resolution.
- No dedicated Cashier dashboard, navigation, seed account, or staff-role selection remains.
- The internal `CASHIER` preparation-station value remains intentionally as a non-user technical identifier so historic order/station data is not destroyed.

### Owner staff and audit controls

- Owner can create Manager/Admin/Driver accounts, manage Driver active state, and reset Manager/Admin credentials only.
- Staff password reset uses the existing secure password hashing, never returns an existing password/hash, revokes all active sessions for that staff member atomically, and writes an audit entry.
- Staff creation, credential reset, Driver activation, catalog/price changes, stock adjustments, promotions/vouchers, and high-level settings continue through the existing audit architecture.
- Manager/Admin cannot create Owner, elevate themselves, or access Owner-only staff/audit operations.

### Verification

- Targeted RBAC, catalog, promo, settings, staff, kitchen/order, reports, media, SQLite migration, and MySQL migration-contract tests: **23/23 PASS**.
- Affected customer/auth/OTP/delivery/order/loyalty/notification/payment/voucher regression set initially produced **75/76 PASS** because one source-contract regex did not tolerate Prettier multiline formatting; the assertion was corrected without changing voucher behavior and its targeted retest passed **14/14**.
- Full unit suite after the retest: **117/117 PASS**, including all affected locked-core regressions.
- SQLite legacy Cashier-to-Admin migration and session/history preservation: **PASS**.
- MySQL migration order/checksum and legacy-role mapping contract: **PASS**.
- Production build: **PASS** with all existing application and API routes compiled.
- Critical/High defects remaining in this milestone scope: **NONE**.

### Manager RBAC Settings hotfix

- Manual Manager UAT confirmed Login/Routing, Kelola menu/Produk, Promo, Stok, and Notifikasi passed, but found that the Manager navigation still exposed global `Pengaturan`.
- Root cause: `settings.read` and `settings.write` were still assigned to Manager, Manager refresh loaded the global Settings endpoint, and both navigation and form rendering allowed Manager.
- Global Settings are now Owner-only server-side. Unauthenticated access returns `401`; Manager and every unauthorized authenticated role receive `403` for read and write.
- Manager final navigation is `Kelola menu | Produk | Promo | Stok | Notifikasi | Keluar`; `Pengaturan` is absent and the global form cannot render for Manager.
- Owner retains the existing global `Pengaturan` page and read/write capability for business identity, contact, store coordinates, delivery configuration, loyalty earning configuration, printer/system settings, and other high-level configuration.
- Manager Product, Promo, Stock, and Notification capabilities remain enabled through their existing dedicated APIs.
- Targeted RBAC/settings/catalog/promotion verification: **12/12 PASS**.
- Production build after the source/UI guard change: **PASS**.
- Full unit suite was intentionally not rerun because the targeted hotfix suite passed and the scope changed only the Settings capability boundary and matching navigation/render guard.
- Manager/RBAC remains **VERIFIED but not yet ACCEPTED/LOCKED**, pending local manual UAT of this final correction.

### Guardrails preserved

- No Birthday Promo implementation, Google Maps, BTN QRIS production adapter, deployment, Web Push, dependency upgrade, Customer UI redesign, or unrelated milestone work.
- No bundle was created.
- Do not open another milestone without a new explicit scope.

---

## Admin + Driver Operational Flow Hotfix

Date: 2026-10-05

Status: **VERIFIED — NOT YET ACCEPTED/LOCKED**

### Source-control baseline

- Parent checkpoint: `eb7470b3984af8ba4924a44e2e5b5c6a29c7c7ff`.
- Implementation commit: `72d2685295d5a86c587a4aa09373f4925a193db9`.
- Locked Customer UI Batch B and Customer OTP Email Core remain unchanged.

### Customer activation boundary

- Root cause: customer listing/search and customer activation shared the same `customers.manage` capability, which gave Admin both support visibility and account-state mutation.
- Customer listing/search remains available to Admin and Owner without exposing password hashes.
- Customer deactivate/reactivate now uses a separate Owner-only capability enforced server-side.
- Unauthenticated mutation returns `401`; Admin, Manager, Kitchen, Driver, and Customer receive `403`; Owner retains the existing active-order safety check, session revocation, and audit trail.
- Admin UI no longer renders activate/deactivate controls. Owner has the sole customer activation control in the existing customer list.

### Driver self-claim dispatch

- Root cause: READY orders were manually assigned by Admin through a driver selector and the `status=ASSIGNED` operation.
- Admin/Owner manual assignment is now forbidden server-side and the selector/actions were removed from operational UI.
- Existing station aggregation remains the READY source of truth: food-only requires Kitchen READY, beverage-only requires Admin beverage READY, and mixed orders require both stations READY.
- Active Drivers see unclaimed READY orders in `Pesanan siap diantar` and claim them with `Ambil Pesanan`.
- Claim runs in one transaction, locks Driver and order state, persists one delivery row, changes READY to ASSIGNED, records event/audit/notifications, and sets acceptance time for the existing customer-driver contact foundation.
- Concurrent claims allow only one Driver to win; duplicate same-Driver claim is idempotent; offline Drivers and unauthorized roles cannot claim.
- Maximum active delivery load remains 5. Capacity is checked atomically and the READY pool is hidden once the Driver is at capacity.
- Existing Driver transitions PICKED_UP → ON_DELIVERY → DELIVERED and customer contact privacy rules are preserved.

### Verification

- Targeted customer RBAC, dispatch, station readiness, race/capacity, order, settings, staff, notification, and loyalty regression: **32/32 PASS**.
- Final focused RBAC/dispatch/station retest after capacity-pool guard: **11/11 PASS**.
- Full unit suite: **124/124 PASS**.
- Production build after final source changes: **PASS**.
- UI source contract confirms Admin assignment controls are absent and Driver self-claim controls are present.
- Critical/High defects remaining in this hotfix scope: **NONE**.

### Guardrails preserved

- No payment logic, customer locked UI redesign, OTP, Maps, Birthday Promo, BTN QRIS adapter, deployment, dependency upgrade, or unrelated milestone work.
- Manager Product, Promo, Stock, and Notification access remains unchanged; Owner Settings remains unchanged.
- No bundle was created and Manager/RBAC was not marked accepted/locked.

---

## Unified Catalog + Category + Subcategory + Stock V1

Date: 2026-10-09

Status: **VERIFIED**

### Source-control baseline

- Required and verified ancestor: `c1f8dc189f5ff7b7eb5d74f4294ef7b9cef6e846`.
- Implementation commit: `ad30ec1dcd22307b0c4f151e54dde3fade1d7022`.
- All newer Customer quantity-control work present in the baseline was preserved.

### Catalog and unit model

- Customer catalog now exposes the three data-backed business categories `Makanan`, `Minuman`, and `Bahan Baku`; `Semua` is no longer a primary category chip.
- Real configurable subcategories are stored in `product_subcategories`; Manager can create, edit, sort, activate, deactivate, and assign them without destructive deletion.
- Products support `PCS` and integer-base `GRAM` stock with price basis, minimum order, order step, and low-stock threshold.
- Existing food and drink semantics remain `PCS`; routing is derived safely as Makanan to Kitchen and Minuman/Bahan Baku to Admin while the internal legacy `CASHIER` station identifier remains compatible.
- The local demo catalog includes `Biji Kopi Arabica Sukabumi – Medium Roast`, priced Rp18.000 per 100 g, minimum/step 100 g, initial stock 10 kg, low-stock threshold 2 kg, and a local raw-coffee SVG asset.

### Unified inventory and role boundary

- `products`, `stock_reservations`, and `stock_movements` remain the single inventory engine for food, drinks, and raw materials; no parallel stock subsystem was introduced.
- Manager can view and adjust all categories. Adjustment requires a non-empty reason, locks the product transactionally, rejects negative/over-reserved availability, and records movement plus audit data.
- Admin receives a server-scoped read-only view of Minuman and Bahan Baku only.
- Kitchen receives a server-scoped read-only `Stok Makanan` view only.
- Owner receives read-only visibility over all inventory plus movement actor/reason history; Owner is not the normal stock or catalog editor.
- Customer and every unauthorized role are rejected by the internal stock endpoint; UI hiding is not the security boundary.

### Order synchronization and fulfillment

- All checkout payment methods reserve inventory server-side before commit; concurrent orders cannot exceed available inventory.
- Confirmation commits exactly the reserved base-unit quantity, cancellation releases pending reservations, and supported post-commit cancellation restores stock with auditable movements.
- Weighted item totals use integer arithmetic. Examples verified: 500 g = Rp90.000 and 1 kg = Rp180.000 at Rp18.000/100 g.
- Quantity below 100 g, a non-100 g step such as 150 g, inactive product/subcategory, wrong category/subcategory relation, invalid unit/step, and quantity above availability are rejected server-side.
- Kitchen tickets contain Makanan only. Admin tickets contain Minuman and Bahan Baku only and include raw-material weight, price basis, subtotal, and item note.

### Migration and verification

- MySQL 8 migration `024_unified_catalog_stock.sql` adds the subcategory and unit model, migrates demo category assignments safely, and adds the raw-coffee demo record.
- SQLite runtime/static schema upgrade has matching tables, columns, constraints, snapshot fields, and backup verification requirements.
- Focused unified inventory coverage: **12/12 PASS**.
- Final affected targeted regression (inventory/RBAC/Cart UX/Checkout/QRIS/Kitchen/Admin/Windows migration contracts): **60/60 PASS**.
- Full unit suite: **198/198 PASS**.
- Customer Cart UX V2 regression: **PASS**.
- Customer Checkout Business Rules V2 regression: **PASS**.
- Kitchen and Admin relevant regression: **PASS**.
- Production build: **PASS**.
- `git diff --check`: **PASS**.
- Critical defects: **0**. High defects: **0**.

### Guardrails preserved

- No realtime, ringtone, Kitchen history, Android/PWA work, new loyalty/voucher logic, unrelated UI redesign, or dependency upgrade.
- Locked Customer, payment, communication, Driver, COD settlement, and Admin operational flows remain covered by the passing full suite.
