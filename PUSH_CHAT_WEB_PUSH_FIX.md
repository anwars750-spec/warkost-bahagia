# Chat Web Push fix — Push Notification V1

Date: 2026-11-02 (Asia/Bangkok). Branch: `work/push-notification-v1`.
Starting checkpoint: `6c96761c11dc308c8c450e852a8ed060c56b310d`.
Status: implemented and verified locally; Control Center review required.
No new Product Owner UAT PASS is claimed. No merge or staging/production deployment was performed.

## Change and targeting

Committed `chat-message` results now supply the server-generated message ID and conversation ID to the existing post-SSE best-effort push queue. The SSE payload, audience and sound behavior stay unchanged. `chat-open` and `chat-status` never enqueue chat push.

The dispatcher loads the persisted message, conversation and active sender from the database and verifies the sender ID/role against that message. It ignores client recipient IDs, message text and sound audiences. No fake order ID is used; general support chat without an order works.

- CUSTOMER_ADMIN: the conversation Customer sends to all active Admins, matching existing shared support membership; an Admin replies only to that conversation Customer.
- CUSTOMER_DRIVER: the conversation Customer sends only to its Driver; that Driver replies only to its Customer. Conversation Driver must still match the current delivery assignment; reassigned former Drivers are excluded.
- Sender is excluded. Unrelated Customers/Drivers and other roles are excluded. Only enabled subscriptions belonging to active recipients with the matching role and a bound unrevoked, unexpired session are selected.

Customer copy: `Pesan baru dari Warkost.` Admin/Driver copy: `Pesan baru dari pelanggan.` Title remains `Warkost Bahagia`. The payload includes conversation/message identifiers, never message content or customer identity.

## Deduplication and isolation

The existing unique `push_deliveries.delivery_key` atomically claims SHA-256 of `subscriptionId:CHAT_MESSAGE:conversationId:messageId` before provider delivery. Repeated/concurrent publication cannot attempt a second delivery for that logical message/subscription; replayed events are ignored. A second persisted message has its own key. No schema/migration is required.

The existing queue, provider timeout/TTL, subscription generation guards, 404/410 handling and sanitized logging are reused. Provider failure cannot roll back a saved chat or suppress in-app notification/SSE sound. Order push plans and their dedup keys/payloads retain existing behavior.

## Notification click and limitation

The worker validates the delivery receipt against the active bound session both before display and on click, preserving account-switch protection. Chat notification tags include conversation and message IDs. Navigation reconstructs a same-origin `/?conversationId=<positive integer>` and ignores payload URLs. Invalid identifiers or unauthorized receipts fall back to `/`; existing same-origin windows are focused or a new window opens. Order notification navigation is unchanged.

Limitation: this safe entry preserves the conversation identifier but does not automatically open the chat panel; users enter the existing chat UI. No unrelated chat/navigation refactor was added. Real background provider-to-OS delivery on staging/devices requires subsequent authorized release and manual verification. Local provider calls were stubbed; this fix makes no new real-device or PO UAT PASS claim. Existing best-effort, non-durable queue/no automatic retry limitation remains.

## Files changed

- `lib/realtime.mjs`: committed chat-message result integration, preserving SSE contract.
- `lib/push-dispatcher.mjs`: conversation/message lookup and targeting; shared existing delivery helper.
- `public/sw.js`: chat tag and safe conversation-entry click navigation.
- `tests/web-push.test.mjs`: ten new chat cases, preserving existing order/security tests.
- `tests/web-push-worker.test.mjs`: chat display/click/account-switch safety case.
- `PROJECT_CHECKPOINT.md`: latest fix checkpoint.
- `PUSH_CHAT_WEB_PUSH_FIX.md`: this review handoff.

No UI component, business chat save function, schema, migration, dependency or VAPID/environment file changed.

## Verification commands and final results

PowerShell commands from the worktree. All final runs PASS:

```powershell
$env:WARKOST_TEST_STORE_NOW_MS='1792731600000'
npm test
# 598/598 PASS, 0 fail, 0 skipped.

node --test tests/web-push.test.mjs tests/web-push-worker.test.mjs tests/realtime-operations.test.mjs tests/realtime-safety-correction.test.mjs tests/communications.test.mjs
# 62/62 PASS, 0 fail, 0 skipped.

# Process-only shell override handles the existing Windows path containing &.
$env:npm_config_script_shell=(Get-Process -Id $PID).Path
npm run build
# PASS: Next.js 16.4.3, 35/35 static pages.

# Separate local SQLite fixture .uat/chat-push-ux.db seeded with setup-local-uat.mjs;
# production build served on loopback 127.0.0.1:3017 with a local-only session secret.
$env:BASE_URL='http://127.0.0.1:3017'
$env:SEED_DEMO_PASSWORD='WarkostLocal#2026'
node node_modules/@playwright/test/cli.js test tests/uat/push-notifications.spec.mjs --workers=1
# 12/12 PASS: desktop/mobile compact prompt, explicit browser permission,
# silent granted restore, Nanti, denied handling, disable/failure UX, real worker registration.

node scripts/verify-web-push-bundle.mjs
# PASS: 12 browser artifacts; private VAPID material absent.

git diff --check
# PASS.
```

The first targeted run exposed shared test-fixture state (closed support thread/inactive fixture Admin); fixture setup was corrected. Final targeted and full runs above pass. No production data was used.

Regression coverage includes QRIS PAID, status/pickup, Kitchen actionable, Driver assignment/delivery, checkout/payment transactions, foreground SSE/sound and worker account-switch behavior. No hosted staging smoke or native MySQL deployment/migration was run for this code-only fix.

The final delivery response records the commit SHA and verified remote HEAD after the authorized branch push. Stop for Control Center review; no merge or deployment.
