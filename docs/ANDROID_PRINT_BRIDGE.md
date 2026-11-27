# Android Print Bridge V1 — Issue 16

Base RC: `a7260cf3087c405e960b41be587378c84f0c36f5`. This delivery is source/PR only, not release authorization. Do not close Issue 16 until physical UAT is approved. Do not change accepted staging, PR 15, schema, Midtrans or Geoapify during implementation.

## Design and evidence limits

One native Android app handles two independent station identities and encrypted journals. No PC, local web server, incoming tablet port, USB agent, browser raw socket or public TCP/9100 port is needed. The tablet polls the approved app over authenticated HTTPS, then connects directly to the station's private IPv4 LAN printer. One copy, 80mm, ESC/POS init/text/feed/full-cut, port 9100. A small local GeoJSON/Maps path and all payment integrations remain unchanged.

Owner explicitly confirmed routing: **Admin receives all items and transaction totals; Kitchen receives only prep_station=KITCHEN items, quantities and notes, without customer address/totals.** Every nonempty food-only order also gets an Admin receipt. Pickup/Delivery headers follow the persisted order. Non-Kitchen items are designated CASHIER on the Admin receipt. Existing payment replay keeps UNIQUE(order_id,station).

States are stored in a private `_bridge` section of existing print_jobs.payload_json; credentials/enrollment hashes in existing settings rows. No migration or new table. Nothing changes existing schema or migration 037. Private metadata is never returned by print-jobs or print-ticket. The legacy SQL status enum is preserved: effective bridge state is returned by the API. Tools inspecting raw SQL status must not interpret it alone as the full bridge lifecycle.

| Effective state | Meaning / recovery |
|---|---|
| QUEUED | Eligible only when explicitly enabled by reviewed Owner configuration |
| SIMULATED | No physical dispatch; not PRINTED; explicit manual requeue required for later hardware test |
| UNVERIFIED | Historical RC PRINTED/REPRINTED has no physical evidence; not automatic success/requeue |
| CLAIMED | Atomic station claim, 30-second lease. Crash before begin can be safely reclaimed with a new secret; old begin is fenced |
| PRINTING | One begin authorization committed. Device durably records intent BEFORE requesting begin and sends once |
| SENT | Bytes written to TCP stream; NOT proof of paper or cut |
| UNKNOWN | Begin/write may have occurred; no automatic replay. Includes expired PRINTING lease (60 seconds) |
| FAILED | Connect failed before begin; exponential 5/10/20-second delay, at most three automatic attempts per manual cycle |
| CONFIRMED | Station operator checked actual paper; only this action writes legacy PRINTED or REPRINTED and printed_at |

The exact bytes-to-paper boundary cannot be an atomic transaction with a commodity printer. **Exactly-once paper is not claimed.** Ambiguous writes are intentionally held for human reconciliation rather than automatically risking duplicates. A malicious/compromised station device can lie about transport outcomes but cannot self-confirm paper or access the other station. Confirmation is authenticated human attestation, not hardware telemetry.

Android stores write-ahead intent/outcome using synchronously committed AES-GCM ciphertext with Android Keystore key and per-record AAD. Pending journals store only job ID, lease and outcome, not ticket bytes. A restart retries ACK only. Lost ACK after SENT does not resend bytes. Stale retired leases are discarded without another write. Do not clear application data/uninstall while journals remain unresolved.

## Security / API contract

All endpoints are POST `/api/print-bridge/{action}`, JSON, no-store. No permissive CORS, redirects or certificate bypass. The reverse proxy must preserve the actual HTTPS scheme recognized by Next; test this on a separately approved deployment. Never weaken the HTTPS guard or accept an arbitrary X-Forwarded-Proto header as proof. Existing cookie session validation plus same-Origin checks protect human operations. Use proxy request-size/rate limits under separate infrastructure approval; application JSON cap remains 64KiB. Authenticated claim calls are serialized/rate-bounded to at most two per second per device.

| Action | Authority / body |
|---|---|
| enrollment | Owner cookie, station ADMIN/KITCHEN; returns random 256-bit single-use code valid 5 minutes |
| enroll | One-time code; returns station-only random token/device ID, expires in 7 days; hashes stored on server |
| revoke | Owner cookie, deviceId; invalidates subsequent calls. Cannot unsend in-flight bytes |
| claim | Bearer token; returns one station job, immutable bytes/base64/SHA256 and lease, or null |
| begin | Same device/station, id+lease, unexpired CLAIMED only; duplicate begin rejected |
| ack | Same device/station, id+lease, outcome SENT/OFFLINE/UNKNOWN. SENT replay idempotent. OFFLINE accepted only before begin |
| confirm | Station Admin/Kitchen cookie, id+paperVerified=true; SENT/UNKNOWN only. Writes audited physical-paper attestation |

Tokens are per station, never admin passwords/sessions in the native app. Do not transmit enrollment codes, tokens, signatures, receipts or customer data in chat/logs. Owner can revoke a lost tablet and enroll a replacement after reviewing outstanding jobs. Rotation is explicit re-enrollment; do not silently clear unresolved journals. Owner pairing UI is `/print-bridge` on the same approved application origin. It requires an existing Owner login and does not itself enable printing.

Existing `/api/print-retry` now **requeues**, never stamps printed_at or success. Station scope is unchanged. UNKNOWN/SENT/CONFIRMED/SIMULATED/UNVERIFIED require acknowledgeDuplicateRisk=true after checking paper. Active CLAIMED/PRINTING cannot be requeued. Operator reprint increments reprint_count and keeps a small audit trail; actual confirmation follows separately. The modern Printer Center labels pending/uncertain/simulation states and exposes paper confirmation. Legacy browser window.print remains manual, and proves neither agent dispatch nor paper.

## Android build and installation — no PC for daily operation

1. Review the dedicated PR and Android Print Bridge CI. CI builds with pinned AGP 8.7.3 / Gradle 8.9 / Java 17 / compile+target SDK 35, min Android 8 (API 26). Developer command: `gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug :app:lintDebug` inside android-print-bridge. CI also runs Node regression on synthetic SQLite only.
2. On the tablet browser, download **android-print-bridge-uat** artifact from the successful exact-commit GitHub Actions run. Extract the APK using Android Files and install only that reviewed UAT APK, temporarily allowing installs from that trusted browser/file app. Do not install random APKs. Record APK SHA-256, source SHA and signing certificate fingerprint. A release signing key/update policy is a separate Owner gate; CI debug APK is not a production-signed release. Uninstalling to replace a debug signing key loses journals: resolve server jobs and revoke old device first.
3. Use a dedicated charged tablet, same trusted LAN as the printers, with fixed DHCP reservations for two different printer IPs. No port forwarding/UPnP/public exposure of 9100. Restrict printer LAN access to the tablet. Verify LAN client isolation does not block sockets. Confirm supported ESC/POS dialect/codepage/cutter and paper width from the actual model manual.
4. After explicit deployment/configuration approval, Owner logs into the approved app, opens `/print-bridge`, generates ADMIN code, and pastes it locally into the Android ADMIN section with HTTPS origin and Admin printer IP. Repeat for KITCHEN and its distinct IP. Never use active staging before approval. Device IDs are displayed after pairing and on reopening the app; keep them for revocation. Tablet verifies TLS with system trust and rejects redirects, non-HTTPS origins, public/DNS printer targets and station mismatches.
5. In the reviewed isolated environment, Owner device settings must explicitly be enabled=true, autoPrint=true, transport=NETWORK_AGENT, paperWidth=80, copies=1 for both stations; printer_simulation=false. Existing defaults/settings do NOT automatically opt in. This guide is not approval to change staging settings.
6. Allow Android notifications, press **Mulai bridge** while the app is visible, and keep the foreground notification. Approve a device-vendor battery-optimization exception privately if required by operational policy. Android/OEM background restrictions, Wi-Fi sleep, screen lock, reboot, charger removal and force-stop need physical UAT. No unattended boot-start guarantee is made; after reboot/force-stop, reopen and explicitly start. The service uses connectedDevice foreground type and persistent notification; it does not request dataSync to evade time limits.
7. Check Printer Center: SENT means check paper. Admin/Kitchen operators click **Konfirmasi kertas tercetak** only after reading the physical ticket and order ID. To stop, use **Hentikan bridge**; let active journal work settle before changing pairing. Pairing is blocked while the service is running or a journal is pending. If an expired/revoked credential strands a journal: verify/reconcile that job on the server, revoke device, then obtain explicit operator approval before clearing app data/re-enrolling. Never blindly retry an ambiguous job.

## Automated and physical UAT

Automated Node tests exercise actual handlers, enrollment/revocation, HTTPS/Origin/session/JSON rejection, station access, concurrent claim, expired leases, bounded offline retries, database rollback, simulation truthfulness, receipt contents/cut bytes, ACK replay and human confirmation with fake ESC/POS TCP receiver. JVM tests exercise the same OnceSender class shipped in APK: offline, integrity failure, disk failure before begin, partial write, lost begin/ACK, restart journal, repeated tick and fake TCP printer. Android build/lint are separate automated gates; no mock is paper evidence.

Physical checklist — all PENDING until model/tablet evidence exists:

- Record exact two printer brands/models/firmware/ESC/POS dialect/cutter, tablet model/Android/OEM version, app/APK/source hashes and private LAN mapping (no credentials).
- One PICKUP and one DELIVERY, each with Kitchen food plus Admin non-food item. Admin full receipt, Kitchen only food; both correct order ID, quantity, notes; Admin price/total/address only as appropriate; readable Indonesian text, width and cut.
- Replayed payment/webhook: no new print job/extra ticket; tablet restart and network loss before/after begin/ACK: no automatic duplicate.
- Offline printer before connect: honest FAILED/backoff, at most three attempts; reconnect safely. Paper-out after TCP send: SENT/UNKNOWN, never false PRINTED; check/clear jam and explicitly approve reprint only if needed.
- Test two tablet pollers, wrong station credential, revoked/expired token, wrong certificate, force-stop/reboot/screen lock/Wi-Fi sleep. No cross-station payload.
- At end verify physical ticket count, dispatch audit and human confirmations. Record differences/uncertainty rather than marking devices PASS from status codes.

No schema/037 migration, VPS/service/DNS change, staging settings change or printer activation is performed by this source delivery. No Midtrans Production or external Geoapify transport.

References: [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [background start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [AGP 8.7 requirements](https://developer.android.com/build/releases/agp-8-7-0-release-notes).
