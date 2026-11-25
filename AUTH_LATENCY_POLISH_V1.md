# Customer Auth Latency Polish V1

Date: 2026-10-30 (Asia/Bangkok)
Repository: anwars750-spec/warkost-bahagia
Branch: work/customer-qris-demo-uat-v1
Base: 56146b69f3a568b6bcbd239e3c3727e3b045e7a1

Status: implementation and local verification; PRODUCT OWNER UAT REQUIRED. No push, merge or deployment.

## Measurement scope and limitations

The Product Owner reports registration, Gmail SMTP delivery, correct OTP activation and cache-bypass session restore as functionally PASS after IDCloudHost resolved outbound SMTP. The supplied VPS STARTTLS handshake is 0.840 seconds. That is not the total registration time.

The measurements below are **controlled local measurements, not VPS/Gmail latency**. No staging deployment or live mailbox operation was performed for this task. Without deploying the new opt-in profiler or obtaining a server trace, the exact cause of the reported several-second verification latency cannot be established honestly.

Both runs use a Next.js 16.4.3 production bundle, fresh isolated SQLite data, authenticated STARTTLS with a locally generated trusted test CA, and the same local SMTP fixture. Fixture delays are explicit: greeting/commands 15 ms, DATA acceptance 30 ms, QUIT 250 ms. One cold request is discarded and the next five successful registration/verification pairs are summarized using stage medians. Windows scheduling can increase nominal fixture delays. Parent/transaction spans are inclusive and must not be summed with their children; medians do not necessarily sum to the median total.

Before measurement had timing instrumentation only: synchronous hashing remained inside the transaction and the response still awaited SMTP QUIT. SQL-write and cookie spans were separated without changing that behavior. After measurement uses the optimized code. Raw safe timing rows are in [auth-latency-measurements.json](docs/auth-latency-measurements.json).

## Registration before / after

| Stage | Before ms | After ms |
|---|---:|---:|
| `request.parse` | 0.628 | 0.653 |
| `request.rate_limit` | 1.343 | 1.454 |
| `request.session_lookup` | 0.025 | 0.028 |
| `register.validate` | 0.119 | 0.123 |
| `register.customer_lookup` | 0.162 | 0.240 |
| `register.password_hash` | 114.476 | 99.683 |
| `register.customer_write` | 0.298 | 0.253 |
| `register.customer_transaction` | 116.412 | 3.206 |
| `otp.challenge_lookup` | 0.149 | 0.142 |
| `otp.challenge_write` | 0.401 | 0.496 |
| `otp.challenge_hash` | 0.138 | 0.162 |
| `otp.challenge_transaction` | 1.767 | 1.993 |
| `smtp.connect` | 0.938 | 1.139 |
| `smtp.greeting` | 22.524 | 26.426 |
| `smtp.ehlo` | 15.981 | 24.184 |
| `smtp.starttls` | 15.972 | 29.818 |
| `smtp.tls` | 5.209 | 5.121 |
| `smtp.ehlo_tls` | 24.939 | 24.066 |
| `smtp.auth` | 20.641 | 29.817 |
| `smtp.mail_from` | 15.993 | 20.702 |
| `smtp.rcpt_to` | 16.051 | 15.935 |
| `smtp.data_ready` | 15.944 | 15.951 |
| `smtp.data_accept` | 32.004 | 31.728 |
| `smtp.quit` | 258.712 | background; see below |
| `api.register.total` | 587.688 | 359.307 |

QUIT still took **253.205 ms** in the after fixture, but ran outside the HTTP critical path and was logged separately. It is not zero work and it is not included in after Server-Timing. Registration total changed **587.688 -> 359.307 ms**, approximately **38.9% lower** in this controlled scenario. This does not predict a fixed Gmail speedup: actual improvement depends on the provider's QUIT response and network behavior.

The customer transaction changed **116.412 -> 3.206 ms** because password hashing now happens before acquiring a database write transaction. The password computation still completes before account persistence and before HTTP success.

## OTP verification before / after

| Stage | Before ms | After ms |
|---|---:|---:|
| `request.parse` | 0.617 | 0.628 |
| `request.rate_limit` | 1.416 | 3.261 |
| `request.session_lookup` | 0.026 | 0.033 |
| `verify.validation` | 0.016 | 0.015 |
| `verify.lookup` | 0.257 | 0.285 |
| `verify.hash_compare` | 0.142 | 0.164 |
| `verify.activation` | 0.121 | 0.128 |
| `verify.loyalty` | 0.050 | 0.052 |
| `verify.consume` | 0.067 | 0.085 |
| `verify.transaction` | 1.851 | 2.613 |
| `session.account_check` | 0.212 | 0.065 |
| `session.insert` | 1.291 | 0.139 |
| `session.issue` | 1.729 | 0.370 |
| `session.cookie` | 0.315 | 0.302 |
| `api.otp-verify.total` | 6.457 | 7.717 |

The correct-code path performs attempts-policy checks but does not increment/write the attempt count. The wrong-code update has its own `verify.attempt_write` span when it occurs; existing wrong-code/max-attempt tests remain.

The after `verify.transaction` includes session issuance; before it covered activation alone and `session.issue` followed the commit. Session issuance changed **1.729 -> 0.370 ms**, but total verification changed **6.457 -> 7.717 ms** in this local run. No end-to-end verification speedup is claimed from these small local numbers. The unchanged rate-limit stage also varied, and the reported VPS delay was not reproduced locally.

## Root causes and optimizations

### Registration

- Synchronous QUIT was a measured avoidable tail after final DATA acceptance. The response now waits for the valid challenge transaction and final SMTP DATA 250, then sends QUIT with bounded best-effort background cleanup. A one-second cleanup timeout and unreferenced socket/timer prevent retained cleanup resources. Close/error/end handling rejects pending pre-acceptance reads safely.
- Synchronous scrypt held both the event loop and a DB transaction during hashing. Registration now uses the same crypto.scrypt parameters, 16-byte random salt, 64-byte derived key and stored format through the native async worker API, before the transaction. Existing hash verification remains compatible. No work factor was lowered.
- TCP_NODELAY avoids client-side small-write coalescing. No separate measured speedup is attributed to that setting.

### OTP verification

- MySQL already used a shared module-level pool; there was no new pool per request. That pool configuration and all active-account/session validation remain.
- The old flow committed activation, then performed a standalone active-account SELECT and session INSERT through the pool. The API now requests session creation inside the existing activation transaction, using its adapter/connection. It retains the active-account SELECT and all queries rather than skipping validation. One activation connection checkout replaces that checkout plus two implicit pooled operations, demonstrated with the MySQL adapter fixture. The rate-limit transaction is unchanged.
- A session write failure now rolls back activation, loyalty creation and OTP consumption atomically. HTTP success and the cookie are produced only after the transaction commits. The token never enters JSON or timing output.
- Frontend inspection found no blocking menu/account/order refresh in submitOtp. Its existing direct transition to registration-success was retained. A held-response browser test proves no success before the response, one verify submission while busy, and no account/menu fetch required after the authoritative response.
- The exact root cause of several seconds on the real VPS remains **unmeasured**, not attributed to HMAC or frontend work by guesswork. The opt-in pool, transaction, rate-limit, HMAC, write, session and cookie spans are available to localize it safely.

## SMTP correctness

RFC 5321 section 4.2.5 transfers message responsibility when the server accepts final DATA, not when QUIT completes. See [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321#section-4.2.5). The client still authenticates over verified TLS and waits for final DATA 250. SMTP authentication/TLS/DATA failures before acceptance still fail registration and consume the undelivered challenge. A delayed or failed QUIT cannot convert an accepted message into a retry-triggering registration failure. SMTP acceptance is not a claim of mailbox delivery.

No SMTP pool was introduced; its credential/connection lifecycle complexity was not justified by this measurement. Cleanup is best-effort after the accepted handoff, so process shutdown does not require completing QUIT to preserve message correctness.

## Safe profiling and reproduction

- Timing is disabled by default. `AUTH_TIMINGS=1` enables it for register and otp-verify only. No environment file was changed.
- Outputs contain an allowlisted stage name and numeric duration only, using AsyncLocalStorage to isolate concurrent requests. No OTP, password, address, email, identifiers, credentials, cookie values, secrets, tokens, SQL arguments or exception text is included.
- When explicitly enabled, response Server-Timing contains only completed critical-path durations. Deferred QUIT is logged as a separate timing row. Logging/header failures cannot change authentication outcomes.
- To reproduce the controlled local after profile: build, then run `node scripts/auth-latency-bench.mjs after`. The script always creates a new local DB and trusted loopback SMTP fixture, overrides inherited database/SMTP targets, and never contacts Gmail. OpenSSL is required for the ephemeral test certificate. Only fixture stage times are printed.
- The saved before snapshot was taken before the behavioral optimization with the timing-only instrumentation. Running `before` on optimized code merely labels that current-code measurement; it does not restore old behavior.
- For actual VPS diagnosis, an operator can enable the profiler temporarily for normal authorized UAT requests after deliberately releasing this commit. Inspect the stage-only traces, compare the target <=2 s registration / <=1-2 s verification, then turn profiling off. No release or environment update was performed here.

## Security and scope

OTP expiry remains ten minutes, max verification attempts five, resend cooldown sixty seconds. Purpose isolation, rate limiting, HMAC comparison, consumed/expired challenge rejection, active-role validation, session signing/fingerprinting/revocation and cookie policy remain. Failed registration/verification never becomes optimistic success.

No schema/migration, payment/QRIS-only, delivery, Kitchen/Admin/Manager/Owner business rule, dependency or Customer visual change. app/page.js and CustomerAuth.js are unchanged. Backend edits are limited to instrumentation, registration hashing, SMTP acceptance cleanup and transaction-bound session issuance.

## Verification

- Full safe suite: **549/549 PASS**, with the repository's existing deterministic open-hours test clock.
- Focused new/existing auth/SMTP tests: **20 cases covered** (19 passed before the final bounded-cleanup test; all are included in the full safe pass). Final timing/MySQL-checkout recheck: **4/4 PASS**; final existing/atomic OTP recheck: **10/10 PASS**.
- Production build: **PASS**, 33/33 static pages.
- Combined desktop/mobile browser gate: **58/58 PASS**: Customer auth/home **16/16**, Admin **12/12**, Kitchen **10/10**, real Kitchen/Manager/Owner safety **6/6**, existing Staging UAT **14/14**.
- Deterministic coverage uses protocol gates, worker/hash barriers, rollback triggers, query/connection counts and explicit UI request dependencies. No CI assertion requires achieving a fixed millisecond latency.
- No hosted Staging UAT/MySQL workflow was triggered because nothing was pushed or dispatched. Local Staging UAT browser coverage is not a claim of hosted MySQL performance.

## Product Owner UAT required

Measure actual staging request latency after an authorized staging release; repeat real mailbox registration, wrong/correct OTP, resend cooldown, session restore and logout/login. Confirm no success before SMTP acceptance/transaction commit and no duplicate operations. Real staging latency targets remain acceptance targets, not a result claimed by this local benchmark.
