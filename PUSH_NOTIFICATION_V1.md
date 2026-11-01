# Push Notification V1 — Control Center handoff

Date: 2026-11-01. Status: **IMPLEMENTED / LOCALLY VERIFIED; CONTROL CENTER REVIEW REQUIRED**.
No staging/production deployment, push, merge or production-secret action was performed. Product Owner UAT for this milestone is **NOT YET PERFORMED**.

## 1. Branch

`work/push-notification-v1`, local isolated worktree. The previous checkout and its untracked AUTH_PATH_HARDENING_V1.patch were left untouched.

## 2. Starting commit

`22d816cc8c372a9ab9222e491985ecf090a8786e`, fetched from the stable work/customer-qris-demo-uat-v1 branch. [Accepted checkpoint](FINAL_OPERATIONS_P0_UAT_2026-11-01.md) records Driver proof, QRIS PAID visibility, Admin ETA +5, migration 034, schema/build/HTTPS smoke and PO PASS. Those implementations/migrations were not reopened or edited.

## 3. Final commit

The delivery message records the exact final local SHA; use git log -1 on this branch to resolve this report's commit. No remote publication is implied.

## 4. Files changed / foundation audit

Before implementation: existing notifications table/list/read API and operational realtime dispatcher/SSE were found and reused. No manifest, service worker, browser Web Push/permission flow, VAPID support, subscription storage or push-device preference existed. Existing audio/device settings remain separate and unchanged.

- lib/realtime.mjs: small integration with the existing post-commit action-event publisher; existing SSE is emitted first and remains unchanged.
- lib/push-dispatcher.mjs: operational event policy, bounded best-effort background queue, authenticated audience selection, persistent claim deduplication, provider lifecycle handling.
- lib/push-subscriptions.mjs, lib/push-api.mjs, lib/web-push-config.mjs, app/api/push/route.js: authenticated subscription lifecycle, receipt authorization and server-only configuration.
- app/PushNotificationSettings.js, app/push-notifications.css, app/page.js, app/layout.js: explicit permission/enable/disable controls and order-area navigation. No role workspace redesign.
- public/sw.js, app/manifest.js, public/push-icon-192.png, public/push-icon-512.png, next.config.mjs: standard service worker/manifest and uncached root-scope script. Icons derive from the existing brand asset.
- migrations/035_web_push_v1.sql, lib/db.mjs, lib/mysql-operations.mjs: additive MySQL/SQLite persistence and schema checks.
- package.json/package-lock.json: pinned web-push 3.6.7, no new infrastructure service.
- tests/web-push.test.mjs, tests/web-push-worker.test.mjs, tests/uat/push-notifications.spec.mjs, tests/mysql-operations.test.mjs: backend, worker, permission UX and migration tests. Migration-count assertions now include 035; no old migration/checksum changed.
- scripts/verify-web-push-bundle.mjs, scripts/verify-web-push-mysql.mjs: repeatable bundle isolation/native MySQL proofs.
- .env.example/.env.staging.example: blank optional variable names only.
- This report and PROJECT_CHECKPOINT.md: scope, verification, operating steps and acceptance checklist.

## 5. Migration

**035_web_push_v1.sql**, after unchanged 034.

push_subscriptions stores authenticated user id, unique SHA-256 endpoint hash plus full endpoint, p256dh/auth, bound session fingerprint/role, refresh generation, timestamps, failure count and disabled timestamp. Endpoint URLs are canonicalized (including host case and default HTTPS port). The capability URL is not indexed as a large TEXT; the unique 64-character hash prevents duplicate subscriptions, with exact endpoint comparison on updates. Another user's existing endpoint cannot be reassigned or revoked.

push_deliveries stores a unique semantic delivery key per subscription/event/order and status CLAIMED/SENT/FAILED. Claim insertion is atomic across processes. No address, customer name, contact detail, payment credentials, image or push body is persisted in this delivery ledger. Generation-checked provider updates cannot disable a subscription refreshed while an old send was pending.

## 6. Environment variables

All server-side, optional as a complete set:

- WEB_PUSH_VAPID_PUBLIC_KEY
- WEB_PUSH_VAPID_PRIVATE_KEY
- WEB_PUSH_CONTACT (valid mailto: operational email or HTTPS contact URI)

The private key never enters client imports, the manifest, service worker, subscription response or Git. The authenticated config API exposes only enabled + publicKey. Missing/invalid/incomplete configuration disables push safely; SSE remains active. No real deployment key was generated/stored by this task. Test key pairs were ephemeral process-only fixtures.

Operators can generate a stable pair through the standard library CLI in a protected operator terminal:

    node node_modules/web-push/src/cli.js generate-vapid-keys

Store the resulting private value only in the existing protected staging environment/secret mechanism. Do not paste it into chat, commits, screenshots or build logs. Preserve the pair across releases; rotation requires browser unsubscribe/re-enrollment. No NEXT_PUBLIC private variable is used.

## 7. Architecture and security

Flow: existing committed business mutation → existing operational event/SSE publisher → push queue → canonical DB order/role/session audience → atomic per-device claim → web-push encryption/VAPID/provider → service worker push → authenticated receipt check → OS notification.

- /api/push GET requires a valid session. POST subscribe/status/unsubscribe requires authentication, supported role, same-origin Origin and JSON request; cross-site requests are rejected. Identity always comes from currentUser, never body user_id. Mutation rate limit: 20/user/minute.
- Subscription keys are length/curve checked. Endpoints must be HTTPS on standard FCM, Mozilla, Apple or Windows browser-push hosts, with no credentials/nonstandard port/fragment. Arbitrary endpoints, localhost and lookalike domains are rejected to prevent endpoint SSRF. A newly introduced browser provider requires explicit reviewed allowlist support.
- Subscription is bound to the current signed session fingerprint and role. Sending joins active users and unrevoked/unexpired sessions. Logout/session expiry or role change stops future delivery without changing auth semantics.
- Before display, the worker fetches /api/push?delivery=<opaque-key> with the current same-origin cookie. Server verifies delivery ownership, current session, role and enabled subscription. Thus an old queued message cannot show another account's notification after account switching. Receipt/network failure fails closed. Clicking an unauthorized old notification opens only the application root.
- Provider errors are handled after business commit. Logs contain static context/allowlisted numeric status only, never raw exceptions, endpoint URLs, keys, payloads or SQL arguments. 404/410 disable expired subscriptions; transient failures increment a counter.
- Four concurrent background event tasks, at most 500 queued events, five-second provider socket timeout, five-minute TTL. Queue overload/failure cannot roll back order/payment or suppress SSE. Unsupported/nonoperational and replayed events are ignored.
- Checkout push uses the committed result id and authoritative DB state; unrelated body orderId/status cannot redirect it. The pre-existing SSE payload contract stays unchanged.
- A semantic delivery key (subscription id + operational event + order) is claimed before sending. Repeated SSE publication, station noise and replay do not resend. DELIVERY_STARTED unifies PICKED_UP/ON_DELIVERY. Kitchen actionable events share one semantic key. This is **at-most-once best-effort attempt**, not exactly-once guaranteed receipt.
- Worker has push, notificationclick and logout-message handlers. No fetch interception or offline/API/auth caching. Click URLs are reconstructed from a positive integer order id and constrained to the same origin. The app opens the role's existing orders workspace, not a new unscoped order-detail API.

The library's VAPID/send/TTL/timeout API follows [web-push documentation](https://github.com/web-push-libs/web-push/blob/master/README.md).

## 8. Events per role

| Role | V1 push |
| --- | --- |
| Customer | Order received; CONFIRMED; PREPARING; READY for PICKUP; delivery started (PICKED_UP/ON_DELIVERY once); DELIVERED/completed; authoritative QRIS PAID |
| Admin | New order and QRIS PAID, the two scoped actionable operational event families |
| Kitchen | Confirmed order containing Kitchen work; no unpaid checkout/minor station-update spam |
| Driver | READY delivery available (all active Drivers when unassigned, otherwise assigned Driver); specific assignment, including batch assignment |
| Manager / Owner | Deferred; existing SSE/in-app notifications unchanged |

Provider webhook, approved staging QRIS simulation, auto-confirm, pickup completion, Driver proof completion and normal/batch order mutations already publish through the existing dispatcher. Their business code is unchanged. Push adds no in-app notifications and does not change unread counts or realtime sound rules.

## 9. Test results

- npm test: **587/587 PASS**, no failures/skips; existing deterministic store-time hook used.
- Focused backend/worker/migration checks: **18/18 PASS**; final push + SSE safety recheck **39/39 PASS** (included in full suite). Covers all required auth, duplicate, unsubscribe, expiry, role-event, provider-failure, worker-click and client-boundary cases.
- Combined affected browser run: **64/64 PASS** desktop/mobile. Customer auth/home 16, Admin 12, Kitchen 10, real Kitchen/Manager/Owner 6, existing staging UAT local equivalent 14, new permission/enable/disable/denied/failure cases 6.
- Real service-worker installation/browser check: **2/2 PASS** on desktop/mobile Chromium: actual root-scope activation, manifest and no-store header checked without prompting for permission.
- Native disposable MySQL: all **35 migrations** and schema verification PASS; duplicate subscription remains one record; **20 concurrent delivery claims → 1 accepted**; unsubscribe PASS. No live MySQL instance was used.
- Browser bundle inspection: **PASS**, 12 static JS/map artifacts inspected for private VAPID name/material.
- Whitespace check: PASS.

The 64-case combined run plus 2 focused worker cases provide **66 unique passing browser cases**, including mobile viewport emulation (not a real iOS device). Final server-only endpoint/provenance refinements passed the full unit suite and native MySQL recheck; no UI source changed after browser verification. The permission-flow tests stub browser push-service APIs, backend transport tests inject a sender, and worker payload/click tests execute the actual worker JavaScript in an isolated VM. Real provider-to-OS delivery, device background constraints and real iOS compatibility remain staging/PO acceptance items; no such PASS is claimed here.

## 10. Build

npm run build: **PASS**, Next.js 16.4.3, **35/35 static pages**. On this Windows path containing &, npm's cmd shim split the path; rerunning with process-local npm_config_script_shell set to PowerShell succeeded. No package build script, machine setting or production environment was changed for that workaround.

## 11. Known limitations

- No live VAPID/provider or OS delivery was exercised. Push remains disabled until reviewed staging configuration is provided.
- Web Push is supplemental/best-effort. Process exit can lose queued work; claimed failures are not retried automatically. A durable retrying outbox is outside V1. Browser/provider/OS permission, focus, battery and background policies can delay/suppress notification display.
- Receipt authorization requires a reachable backend and the same active login cookie. Logout/expiry correctly stops push; re-login requires explicit enable to bind the new session. Another account's endpoint is never silently taken over; unsubscribe the old browser subscription before re-enrollment.
- Notification clicks open the relevant orders workspace with order context, not a new individual-order modal. Existing authorized order loading remains authoritative.
- Subscription and delivery-ledger retention needs future maintenance policy. No cron/Redis/new infrastructure was introduced. Subscription capabilities remain private DB/backup data and must not be exported into public diagnostics.
- iOS/iPadOS Web Push requires supported versions (16.4+) and a web app added to Home Screen, with permission from explicit user interaction. It is not universal across all browsers/devices. See [WebKit's requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## 12. Staging deployment steps — instructions only, NOT executed

1. Control Center reviews this commit, migration and limitations, then explicitly authorizes branch publication and staging release. Keep the accepted stable checkpoint available. No production release is included.
2. Follow the existing [staging runbook](docs/STAGING_DEPLOYMENT.md). Back up staging MySQL through the existing npm run backup:mysql mechanism with its protected environment loaded. Do not copy production customer data.
3. Deploy the exact reviewed commit from work/push-notification-v1 to staging only; npm ci and npm run build using Node 24. Do not merge branches or edit migration 034.
4. Generate/store one staging VAPID pair through the protected operator mechanism; configure the three variables above. Do not alter SESSION_SECRET, SMTP, payments, MySQL durability or production secrets. Leaving all three empty is a safe disabled-push fallback.
5. Startup via the existing npm run start:staging mechanism runs migrate-mysql, bootstrap, verify-schema and preflight. Verify 035 is applied once and both new tables exist. No schema rollback/drop is required to return to the previous application release; the additions are isolated.
6. Check /api/health/ready and HTTPS smoke, and verify /sw.js serves JavaScript with Cache-Control: no-store and Service-Worker-Allowed: /. Check /manifest.webmanifest and both icon URLs. Keep application/PWA under the same HTTPS origin.
7. Run node scripts/verify-web-push-bundle.mjs on the built release. Authenticated /api/push must expose enabled/publicKey only; unauthenticated access must be 401. Never print a private key in validation output.
8. Start PO UAT below on real browser devices after Control Center authorization. Inspect only sanitized provider status counters. Do not claim new milestone PASS until PO accepts it.

## 13. Exact Product Owner UAT checklist

Use dedicated staging accounts/devices, the existing approved QRIS staging flow, and preserve all accepted P0 behavior. Record browser/OS, role, foreground/background state, event and result; never include endpoint/auth keys/OTP/password in evidence.

- [ ] Fresh browser/PWA login shows no automatic notification permission prompt. Button appears for Customer/Admin/Kitchen/Driver; Manager/Owner receive no V1 push option.
- [ ] Tap Aktifkan Notifikasi. Accept the browser prompt. UI becomes Notifikasi Aktif; refresh retains the active state for the same session. Rapid duplicate click does not duplicate subscriptions.
- [ ] On a separate permission-reset browser, deny permission. A clear settings message appears; repeated button clicks do not repeat the browser prompt.
- [ ] Customer: put app in background and create an approved staging order. Receive order-received push. Background Admin receives new-order push. Another Customer receives none.
- [ ] Complete approved QRIS staging payment. Customer/Admin each receive one PAID push. Repeated status refresh/webhook replay causes no extra push. QR visual remains hidden after PAID (existing acceptance unchanged).
- [ ] Confirm a food order. Customer receives confirmation; Kitchen receives one actionable work notification. An unpaid/unconfirmed checkout and beverage-only/minor station updates do not spam Kitchen.
- [ ] Start preparation. Customer receives one processing push. Existing ETA +5 behavior still works and does not create repeated processing notifications.
- [ ] For PICKUP, mark READY: Customer receives ready-to-pickup push; Drivers receive no delivery-availability push for that pickup.
- [ ] For DELIVERY, mark READY: eligible Drivers receive availability push. Claim/assign: only the selected Driver receives assignment push. Exercise batch assignment if used operationally.
- [ ] Driver picks up/starts delivery: Customer receives delivery-started once across both related transitions. Complete using the accepted proof flow: Customer receives completion push; proof upload/error handling remains unchanged.
- [ ] Complete a pickup through existing Admin flow: Customer receives completion push.
- [ ] Tap a notification with the app closed, then with an existing app window: open/focus same-origin Warkost orders area for the logged-in role; no external URL or unauthorized order data.
- [ ] Tap Nonaktifkan Notifikasi. Browser/backend subscription is revoked; later events produce no visible notification on that device. Re-enable works with the same user.
- [ ] Logout/account switch on a shared browser: old-account notifications do not display. Test a new user's explicit enrollment without silently taking over another user's stored endpoint. Closed/expired/revoked sessions remain excluded.
- [ ] Revoke browser subscription permission/site subscription; the next expired provider response disables it safely. Use a controlled sanitized failure scenario to confirm order/payment still succeeds when push is unavailable.
- [ ] Verify foreground SSE, existing in-app unread/read behavior and role workspaces still update. Manager/Owner retain their existing foreground behavior without new push spam.
- [ ] If iOS is in scope, Add to Home Screen on supported iOS/iPadOS, launch that installed app, login there, explicitly enable and repeat background/click tests. Record unsupported/device-policy limitations honestly.
- [ ] Product Owner explicitly accepts or rejects Push Notification V1. Until then status remains UAT REQUIRED.

## 14. Remaining risks / blockers and stop point

Local implementation gates are complete and PASS. Staging VAPID provisioning, real provider-to-device delivery and PO acceptance are pending review/authorization, not silently performed. Durable retries, additional providers/roles, per-event preferences and retention automation are deferred.

STOP after handoff. Await Control Center review before staging deployment or PO UAT; do not continue to another feature.
