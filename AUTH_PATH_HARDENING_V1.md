# Auth Path Hardening V1

Date: 2026-10-30. Branch: `work/customer-qris-demo-uat-v1`.
Baseline: `00d6ca38c77a3df2d16ebe587bd699548f326ca6`.
Status: **IMPLEMENTED / VERIFIED LOCALLY; PRODUCT OWNER STAGING UAT REQUIRED**.

## AUTH PATH BEFORE

Successful login, warm pool, no incoming cookie:

1. Same-origin check and bounded JSON parsing.
2. Rate limiter: occasionally an awaited expired-row DELETE; then BEGIN, INSERT IGNORE, SELECT bucket FOR UPDATE, UPDATE count/window, COMMIT.
3. currentUser returns immediately without a cookie. A valid incoming cookie instead adds separate sessions and users SELECTs, although login does not use that user.
4. SELECT authoritative account by email/normalized phone.
5. Synchronous scrypt verification on the Node event loop.
6. SELECT account active/role again; sign token; autocommit session INSERT.
7. Set existing secure cookie and return the same public user JSON.

Normal DB reads: **3 standalone SELECT statements**. SQL write statements: **3** (INSERT IGNORE can be a no-op). Explicit transactions: **1**. Total data statements: **6**, plus BEGIN/COMMIT control round trips. Estimated durable write transactions: **2**. Cleanup can add another changed transaction and variable DELETE work.

## AUTH PATH AFTER

1. Same-origin check and bounded JSON parsing.
2. One atomic limiter upsert in autocommit, returning this attempt's decision in the same statement result.
3. Skip unused incoming-cookie lookup specifically for login. Other actions still validate sessions.
4. SELECT authoritative account by email/normalized phone; reject inactive/guest accounts exactly as before.
5. Await native asynchronous scrypt with the unchanged stored salt, work factor, key length and timing-safe comparison.
6. Sign the existing token format. One autocommit INSERT SELECT writes the session only when the account still has the verified id, active flag, role and **byte-identical password hash**. Require exactly one inserted row before sending the cookie.
7. Return the unchanged cookie/public user contract.

Normal DB reads: **1 standalone SELECT**, plus the authoritative user check inside INSERT SELECT. SQL write statements: **2**. Explicit transactions: **0**. Total data statements: **3**. Estimated durable write transactions: **2** (limiter upsert + session insert). Autocommit is still a transaction and does not remove fsync cost.

## CONFIRMED BOTTLENECKS

- Product Owner supplied VPS evidence: small MySQL COMMIT 355.1â€“1173.1 ms; fsync /tmp 128.3â€“481.0 ms; fsync storage 92.0â€“506.2 ms. These are user-reported infrastructure measurements, not new measurements by this task.
- Application audit confirms an explicit three-statement limiter transaction, awaited periodic DELETE, synchronous login scrypt, a separate session-account SELECT and two session-restoration SELECTs.
- Changing this application path does not resolve the provider's storage investigation. No VPS latency target is claimed.

## SECURITY GAPS FOUND

- The generic body-field precedence allowed an unrelated challengeId to choose the login/register bucket. The new action-specific selector follows the consumed identifier instead.
- Indonesian phone spellings previously selected different login buckets for the same normalized phone. They now share a bucket.
- Identifier-only protection still permits attempts spread over many different identifiers. Repository inspection found no verifiable nginx/proxy trust configuration and Request has no authenticated peer-IP contract. Arbitrary X-Forwarded-For/X-Real-IP is therefore ignored. No client IP or NAT/global lockout policy was invented.
- MySQL text collations may ignore case; the conditional session insert explicitly compares password-hash bytes with BINARY. An intervening reset, role change or deactivation invalidates the authentication snapshot.

## RATE LIMIT DESIGN

MySQL: INSERT ... ON DUPLICATE KEY UPDATE, guarded by the unique primary-key row lock. New buckets start at 1. Existing unexpired buckets increment and saturate at max+1; expiry resets to 1. The window resets only when now > window_until, preserving the exact previous 60-second boundary.

Both INSERT and UPDATE explicitly call LAST_INSERT_ID(expression). mysql2's same-statement OK packet supplies the decision through insertId/store.lastInsertRowid. No later SELECT, connection-local follow-up read, affectedRows heuristic, FOUND_ROWS pool-flag change or process-local cache is used. Missing/invalid decision metadata denies; storage errors abort the request.

SQLite uses one ON CONFLICT DO UPDATE ... RETURNING count statement. Store locking remains in place, and separate-connection worker tests also exercise database-level serialization.

Limits remain login/register/etc. 12, OTP verification 10 and profile 5. OTP expiry/resend/max challenge attempts remain unchanged. Password-reset completion keeps its existing coarse bucket; unrelated request fields cannot rotate it. Keys remain SHA-256 digests, not raw identifiers/IPs. No request identifiers enter the profiler.

MySQL references: [duplicate-key update semantics](https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html), [InnoDB duplicate-key locking](https://dev.mysql.com/doc/refman/8.4/en/innodb-locks-set.html), [LAST_INSERT_ID](https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id). The implementation is additionally executed against real local MySQL, not proven solely by mocks.

## CONCURRENCY PROOF

- SQLite: 100 simultaneous promises admit exactly 12; four independent worker connections send 80 attempts to one key and admit exactly 12.
- MySQL 8.4.9: 100 concurrent same-key requests admit exactly 12. Three independently flooded keys each admit exactly 12. Repeated saturated denials, exact boundary, expiry reset, bounded cleanup and reused-pool decision isolation pass.
- Adapter test forbids explicit connection checkout, validates one statement per attempt, ignores misleading affectedRows, denies malformed/missing decision metadata, and propagates storage failures.
- Hashes and request fields cannot be used to rotate the login bucket. Final HTTP benchmark also checks four wrong-password attempts followed by a 429 after eight successful attempts despite changing challengeId/X-Forwarded-For.

## PASSWORD VERIFY

Login now uses crypto.scrypt asynchronously with the same implicit Node defaults as the original scryptSync, the same stored salt string, 64-byte key and salt:hex-key format. Existing hashes require no migration. Valid hashes always use timingSafeEqual. Wrong/malformed hashes fail closed. Tests hold the scrypt callback and prove unrelated work and account changes can proceed while verification is pending.

The synchronous helper remains for existing profile-password/PIN paths outside this login change. No password/PIN business rules changed. Async hashing preserves CPU work; it does not promise a faster individual hash and may wait for worker-pool capacity.

## SESSION OPTIMIZATION

The internal server-only issuer is called only after authenticateCustomer returns the authoritative password-verified account, never from request-body data. Its conditional INSERT revalidates active/role/password hash atomically. The general issueSession issuer and OTP transaction-account guard remain in use for other paths.

currentUser now uses one sessions JOIN users SELECT, with token fingerprint, revoked_at IS NULL, database expiry and token-user id constraints. Existing signature, payload expiry, current user active/role/final-role checks remain. Non-ASCII malformed signatures and invalid expiry values fail closed. Cookie/token format, signing secret, seven-day expiry, revocation and public user shape remain unchanged.

## SESSION CLEANUP

No expired/revoked session deletion mechanism was found in the audited application/scripts. Validation still rejects those rows immediately. No cleanup was added to login or another hot path, and no heavy job/schema index was introduced. Physical retention/table growth remains a documented maintenance follow-up.

## AUTH ATTEMPTS CLEANUP

All automatic request-path DELETE work is removed. The explicit cleanupAuthAttempts helper deletes only expired rows, at most 500 by default and never more than 1000 per invocation. It is not scheduled or invoked by any request. Tests prohibit DELETE during normal requests and confirm cleanup preserves live/exact-boundary buckets. Expired unused keys remain physically retained until this helper is deliberately invoked during existing maintenance. No cron/infrastructure dependency or environment change was added.

## LOCAL BENCHMARK BEFORE / AFTER

### Local SQLite / production HTTP

| Stage | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Rate-limit total | 1.557 | 1.559 |
| Password verify | 104.831 | 108.737 |
| Session creation | 1.806 | 3.249 |
| Modeled login pipeline | 109.665 | 116.082 |
| Complete HTTP login request | 104.928 | 122.606 |

### Local native MySQL 8.4.9

| Stage | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Rate-limit total | 5.228 | 2.773 |
| Password verify | 94.187 | 86.923 |
| Session creation | 3.658 | 2.950 |
| Modeled login pipeline | 106.942 | 95.332 |

The SQLite HTTP median increased (104.928 → 122.606 ms); no end-to-end SQLite speedup is claimed. Local native MySQL rate-limit and modeled pipeline medians decreased (5.228 → 2.773 ms and 106.942 → 95.332 ms), without a statistical significance or VPS claim. Password hash work factor is identical; observed duration differences include scheduling variation.

Seven warm sequential medians after discarding a cold sample; milliseconds. SQLite component timings use real library calls; complete HTTP uses an isolated production Next bundle and actual login API. These are separate sample sets, so component medians should not be added to infer HTTP duration.

MySQL measurements use this baseline's exact transaction-heavy limiter protocol and synchronous password verify versus the new protocol on one disposable native server. The MySQL pipeline is a modeled route sequence, not an HTTP request. Final native fixture checks innodb_flush_log_at_trx_commit=1, sync_binlog=1, innodb_doublewrite=ON and general_log=OFF. No existing database, server settings, SMTP account or deployment is used.

Repeated measurements can vary with Windows scheduling and CPU/disk contention. No statistical speedup or VPS/Gmail latency claim is made. Full timing data and opt-in post-change server stages are in [measurements](docs/auth-path-measurements.json).

## DURABLE COMMITS BEFORE / AFTER

**Normal successful login: 2 â†’ 2.** Both the durable admission decision and subsequent session must persist. The old limiter's three SQL statements already shared one commit. Replacing them with an autocommit upsert removes round trips, not that commit. Keeping those writes separated avoids holding a DB transaction over expensive scrypt and ensures rejected/failed login attempts remain durably counted. The awaited cleanup's possible extra commit is removed from login. Exact fsync syscall counts depend on MySQL/group commit; these numbers count durable write transactions, not syscalls.

## FILES CHANGED

- app/api/[action]/route.js: correct bucket selection, login profiling, internal session issuer, skip unused incoming-session lookup on login.
- lib/rate-limit.mjs: atomic upserts, canonical action identifiers, bounded explicit cleanup.
- lib/auth.mjs: async legacy verification, conditional session creation, joined currentUser.
- lib/customer-auth.mjs and lib/auth-timing.mjs: async login and strictly allowlisted opt-in login stages.
- scripts/auth-path-bench.mjs: isolated SQLite/library + actual production HTTP benchmark.
- scripts/auth-path-mysql-check.mjs and tests/helpers/local-mysql-fixture.mjs: explicit disposable native MySQL proof/benchmark, no general query log or durability weakening.
- scripts/auth-path-browser-check.mjs: repeatable local browser gate with consistent fixture credentials and private development mail.
- tests/auth-path-rate-limit.test.mjs, tests/auth-path-mysql-adapter.test.mjs, tests/auth-path-session.test.mjs, tests/auth-latency.test.mjs: concurrency, fail-closed, credentials, sessions and profiling.
- tests/uat/admin-ui-stabilization.spec.mjs: scope the stale ambiguous password selector to its input; no Admin behavior change.
- This report, docs/auth-path-measurements.json and PROJECT_CHECKPOINT.md: implementation evidence and limitations.

## SCHEMA CHANGED / MIGRATIONS

**NO. None.** Test-only disposable tables do not change application schema or migrations. No dependencies, MySQL pool flags, environment files, durability settings or business-rule modules were changed.

## TESTS / BUILD

- Full safe unit suite: **562/562 PASS**, no failures/skips, with the existing deterministic store-time hook.
- Browser: **60 unique cases PASS** across desktop/mobile: Customer 16, Admin first paint 12, Kitchen workspace 10, real Kitchen/Manager/Owner 6, existing Staging UAT 14, extra Admin lifecycle 2.
- Evidence detail: combined run passed 58/60; the two extra Admin lifecycle tests required a seeded active operator/shift. Their focused rerun passed 2/2 using unchanged business helpers in the isolated fixture. A single clean 60-test run is not claimed. The stale Admin password selector and inconsistent fixture credential were also corrected; no production UI/business rule was changed for these test prerequisites.
- Native MySQL concurrency/session proof: **PASS**, 8.4.9, flush-at-commit=1, sync-binlog=1, doublewrite=ON, general-log=OFF. Includes byte-different hash/deactivation rejection and joined revocation check.
- Actual production-bundle HTTP rate limit: **PASS**, the 13th login is 429 despite rotating unused challengeId/forwarded header.
- Production build: **PASS**, Next.js 16.4.3, 33/33 static pages. Whitespace check: **PASS**.
- Local tests do not prove live Gmail delivery or real staging latency. Existing SMTP acceptance/TLS/OTP safety tests remain in the passing safe suite.

Reproduce the safe unit suite with the existing test clock hook WARKOST_TEST_STORE_NOW_MS=1792731600000 (2026-10-23 05:00 UTC), then npm test. Production build: npm run build. Browser gate: node scripts/auth-path-browser-check.mjs. Browser fixture contains no live mail or production account; Customer trace/video/screenshots remain disabled where OTP is handled.

SQLite/HTTP benchmark: build baseline commit 00d6ca38... and run node scripts/auth-path-bench.mjs before; build this source and run node scripts/auth-path-bench.mjs after. Phase is only an output label, not a checkout mechanism. The new benchmark script can be copied into an isolated baseline checkout for reproduction; never reset a working branch to reproduce it.

Native MySQL proof/benchmark: node scripts/auth-path-mysql-check.mjs --mysqld <absolute-path-to-local-mysqld>. Requires an available MySQL 8.4 binary, not a new runtime dependency. It initializes a new temporary datadir, listens only on loopback and removes that fixture on shutdown. It never uses an inherited DATABASE_URL. Default unit tests do not start/download MySQL.

## RISKS / LIMITATIONS

- Provider storage/fsync investigation remains open; the two unavoidable durable writes may still dominate staging login time.
- No trusted-origin IP bucket was added; broad identifier spraying remains a limitation pending a verifiable proxy/peer contract. Legitimate NAT users are not given a new shared-IP lockout.
- Physical session/auth-attempt retention needs maintenance planning; no request waits for cleanup.
- Tested native SQL on local MySQL 8.4.9 and SQLite; no hosted CI or staging production measurement is claimed.
- No UI redesign, payment/QRIS, checkout/order, delivery, role business rules, realtime, stock or loyalty implementation change.

## COMMIT / WORKING TREE / UAT

The final commit SHA and post-commit working-tree state are reported with delivery. Product Owner UAT required: **YES**, especially measured staging timings for all six roles and session restore/logout under the real proxy/storage configuration. No push, merge, deployment or staging/production environment action is authorized or performed.
