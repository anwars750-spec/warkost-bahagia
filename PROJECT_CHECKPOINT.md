# Warkost Bahagia — Project Checkpoint

## Active baseline

- Branch: `session/2a-customer-ui-polish`
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
- Milestone: Customer UI Batch B
- Status: **VERIFIED / ACCEPTED / LOCKED**
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
