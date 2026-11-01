# Customer auth, user and homepage regression cleanup

Date: 2026-10-29
Repository: anwars750-spec/warkost-bahagia
Branch: work/customer-qris-demo-uat-v1
Base: f6427c10ec1751b63aa95eb307de3a6d137a3ade
Acceptance: PRODUCT OWNER UAT REQUIRED. Live staging registration remains blocked by an unresolved server error.

## Defensible root cause

The production-bundle reproduction separates a working submit handler from invisible failure feedback:

- On the unchanged local production bundle and the public staging frontend, valid fields produced exactly one register POST and transitioned to the existing OTP card when the response was intercepted with the real success response shape. There were no browser exceptions or invalid form fields.
- The Product Owner confirmed a laptop and a password of at least 10 characters. An additional native-validation gap with shorter passwords was reproduced, but it is not claimed as the cause of their valid-input UAT case.
- With the explicitly authorized UAT mailbox, the actual staging POST /api/register returned HTTP 500 with only {"error":"Terjadi kesalahan server"}. The frontend caught the error, but the alert was above the onboarding form and outside the laptop viewport: top -263.578125px, inViewport false. There was no OTP-success response. Thus clicking appeared to do nothing even though the request had run and failed.
- The shared API error handler deliberately maps unexpected server exceptions to that generic response. Public evidence cannot distinguish a database exception, OTP configuration issue or SMTP transport failure. The user confirmed that staging server logs are unavailable. No infrastructure cause or real mail-delivery success is invented.

## Modern sources of truth

App remains the single owner of authenticated user, session resolution, auth mode, OTP challenge and account data. CustomerAuth renders only the selected React form. Seven simultaneously mounted forms hidden by CSS have been replaced by conditional rendering. Registration/login/guest/OTP/reset submit handlers keep their existing API methods, payloads and response contracts.

Auth requests have an independent synchronous lock and AbortController. Repeated submit events cannot launch a second request. Leaving auth cancels the outstanding presentation request and ignores stale completion. Busy state is explicit. Client validation mirrors the existing server constraints; the server remains authoritative. Validation, API, network and session-expiry errors are visible inside the active form, receive focus and scroll into view. There is no fake OTP success or timed visibility mask.

The existing registration success screen and OTP/reset flow remain. A successful login explicitly refreshes authoritative session/account data. Initial session lookup failures keep the session unresolved with a retry action rather than rendering a guessed guest identity. Customer logout uses a direct React confirmation with the approved shared styling, one existing logout API path, request cancellation and account/notification/order cleanup. Guest-to-member navigation keeps its cart draft.

## Homepage and removed paths

The approved hero/header/navigation are retained. The menu catalog now renders its all-category filter, headings, category/subcategory groups, product metadata and compact quantity labels directly from the same menu/cart state. Existing order-step, stock and price domain helpers remain. The banner owns its React selection, autoplay, dots and pointer swipe lifecycle.

Deleted fully superseded files:

- app/CustomerCatalogPolish.js
- app/CustomerQuantityUnitPolish.js
- app/CustomerBannerCarouselRuntime.js

Their global mounts/imports and the obsolete detached catalog-button CSS mask are removed. Customer logout is excluded from the global role detector and handled in React. Other role confirmations remain.

Retained dependencies are explicitly scoped in page.js instead of mounting across all roles/auth screens: CustomerHelpRoutingRuntime and CustomerGeneralSupportRuntime for public/Customer non-auth views; CustomerLocationLauncher, CustomerLocationPickerUx, CustomerAccountAddressLocationFirst, CustomerQrisOnlyRuntime and CustomerLoyaltyPickerRuntime for authenticated Customer only. Their address, checkout, QRIS and support functionality has not been redesigned. The entire checkout/location experience is not claimed to be decorator-free.

## Backend/security audit and boundaries

Inspected app/page.js, app/layout.js and app/style.css (this repository has no app/globals.css), Customer auth/home/account integrations, API register/login/logout/me/account/OTP/reset handlers, lib/customer-auth.mjs, lib/auth.mjs, lib/otp.mjs, lib/email.mjs and relevant schema/migration/tests.

No backend, API route, schema/migration, payment, delivery, permission or production-secret source file changed. Existing pending-account creation, signed/revocable sessions, OTP hashing, 10-minute expiry, five-attempt verification limit, 60-second resend cooldown, purpose separation, password-reset anti-enumeration and session revocation remain authoritative. Backend tests also verify that a mailer failure consumes the undelivered challenge and keeps the account inactive.

QRIS-only Customer checkout, free delivery through 3 km / paid delivery through 10 km, Kitchen food-only scope and stock permissions remain covered by the full safe suite. The existing customer@warkost.local account was used only in an isolated local fixture; its staging/production password and state were not modified.

## Verification evidence

- Full safe unit/regression suite: **537/537 PASS**, zero failures/skips.
- Combined desktop/mobile browser gate: **54/54 PASS** (Customer, Admin, Kitchen, Manager/Owner and existing Staging UAT).
- Final Customer suite after the session-expiry/quantity review: 12 unaffected cases PASS; the two banner gesture cases PASS on focused recheck after native image dragging was disabled. Final Customer coverage: **14/14 PASS** across final runs; total unique browser cases across suites: **56 PASS**.
- Affected auth/banner presentation unit recheck: **9/9 PASS**.
- Final production build: **PASS**, Next.js 16.4.3, **33/33** static pages.
- git diff --check: **PASS**.

- Safe unit/regression command uses the repository's existing WARKOST_TEST_STORE_NOW_MS hook fixed to 2026-10-23T05:00:00Z, so unrelated order tests run during deterministic open hours. The production guard is unchanged.
- Existing Admin, Kitchen, Manager/Owner and Staging UAT browser suites run against the production bundle with a new, GUID-named local SQLite fixture and dedicated demo accounts.
- Customer browser coverage includes one form per mode, exactly-one registration request, busy state, visible validation/server failures, wrong OTP, cooldown/resend, activation, invalid/valid login, password visibility, cache-bypass refresh, no guest/auth leakage, profile/address/notifications, catalog grouping, banner selection/autoplay/swipe and React logout.
- A separate real-backend local case uses the development mail outbox privately to exercise pending-account creation, mailer invocation, wrong OTP, resend, real OTP activation, existing demo Customer login and the full password-reset UI. It does not prove SMTP delivery. OTP values and credentials are not printed; these tests disable trace, screenshot and video retention.
- The final homepage was inspected visually on desktop and mobile. No visual redesign was introduced.
- Initial harness corrections covered the Next route announcer alert selector and the local fixture selector. Only exact GUID-named fixture directories are accepted; browser output directories cannot become the database fixture.
- No push, merge, workflow dispatch or deployment was performed. Hosted MySQL Recovery and Staging UAT results are not claimed for the new commit.

## Real SMTP status: BLOCKED

Actual authorized staging registration: HTTP 500, generic server error, no successful challenge response and no verified mailbox delivery. Server logs are needed to identify the internal failing dependency. No production secrets were read or changed and no OTP was requested from the user or exposed.

The service commits a pending account before OTP delivery. Therefore the failed authorized staging attempt may have left an inactive fixture record; this could not be checked without staging database/log access. The staging operator should inspect that authorized fixture record before reusing the same mailbox for the next registration UAT. No live database cleanup was attempted.

## Product Owner acceptance still required

After the staging server failure is resolved and this commit is deliberately released to staging, use a brand-new real email (or an operator-verified clean fixture), receive the OTP in that mailbox, verify wrong-code rejection and correct-code activation, log in, hard refresh, log out, log in again and confirm the approved modern homepage. Local mail-outbox and mocked browser passes do not substitute for this acceptance.
