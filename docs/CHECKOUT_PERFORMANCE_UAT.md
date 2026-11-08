# Checkout address performance and session traffic

## Reproduction

Use a fresh loopback-only SQLite fixture for each build. No staging or production system is needed.

1. Build the revision with `npm run build`.
2. Set a unique project-local `DATABASE_PATH`, clear `DATABASE_URL`, and run `node scripts/setup-local-uat.mjs`.
3. Start the production build on loopback. Set the local fixture session secret, `CHECKOUT_TIMINGS=1`, `GEOLOCATION_EXTERNAL_ENABLED=false`, an empty `GEOAPIFY_API_KEY`, and `QRIS_AUTO_CONFIRM_WORKER_DISABLED=true`.
4. Set `BASE_URL` to the local origin and `SEED_DEMO_PASSWORD` to the local fixture password. Run `npx playwright test tests/uat/customer-checkout-performance.spec.mjs --workers=1`.
5. For baseline revision `052dd9b`, overlay only the timing instrumentation from Phase A (`lib/auth-timing.mjs`, the two API route files) and the benchmark spec. Set `WARKOST_PERF_BASELINE=1` to record known baseline failures without applying candidate traffic assertions. Leave the baseline UI, role runtimes and account service intact.

The benchmark observes boot through the first successful account response, five seconds of idle, and two seconds of DOM mutations every 50 ms through requestAnimationFrame, plus a 200 ms drain. It captures actual fetch stacks, then opens Checkout using real browser controls. It supplies a fixture GPS position and adds 200 ms to the address POST to observe the loading state and exercise five rapid clicks. It waits for the actual server quote and logs the request stages and click-to-close time.

`checkout.total` measures the server route. `checkout.data` is the nested database and domain work, not a SQL-only timer. Browser resource duration minus server total includes transport, browser/Next.js queueing, response transfer and the injected 200 ms on the address POST. Click-to-close also includes frontend event handling, JSON parsing, scheduling and render. The residual after subtracting the measured critical-path browser request durations estimates that frontend gap. The quote refresh runs separately and does not gate popup closure. Timings are local sample measurements, not VPS latency or percentiles.

## Root cause evidence

Baseline: both viewports emitted 85 `/api/me` calls during the same DOM exercise and zero during the quiet five seconds. The compiled stacks mapped to `AdminCashControlCenter` (41), `ManagerCashSettlementCenter` (41), and `ManagerOwnerSettlementCenter` (3). All three were globally mounted and ran their role checks from body MutationObservers even in a Customer session. The last observer throttled its check, but still polled on mutations. The burst was reproduced without a failed SSE connection. The reported 1,300 requests were not independently counted on the VPS.

The address POST succeeded in both baseline measurements. A sequential full-account fetch extended the popup wait and also made successful writes look failed if only the reload failed. Phase A mounts the three staff panels from the page's verified role and removes their DOM-driven session probes. Existing realtime/authentication and staff recovery listeners remain. The address POST adds the canonical saved record to its response. Checkout applies that record without re-fetching the full account, guards rapid clicks, and disregards account snapshots started before the address write. Existing server quote recalculation continues after selection.

## Measured baseline and Phase A candidate

Times in milliseconds, rounded to whole milliseconds. Each request cell lists browser / server / nested data / transport-and-queue.

| Measurement | Desktop baseline → fixed | Mobile baseline → fixed |
|---|---:|---:|
| `/api/me` boot calls by first account response | 16 → 11 | 16 → 11 |
| `/api/me` in five seconds idle | 0 → 0 | 0 → 0 |
| `/api/me` in two seconds DOM churn and 200 ms drain | 85 → 0 | 85 → 0 |
| POST address | 236 / 4 / 2 / 232 → 240 / 4 / 2 / 236 | 248 / 2 / 1 / 245 → 260 / 2 / 1 / 258 |
| GET account on save | 52 / 2 / 1 / 50 → removed | 43 / 2 / 2 / 40 → removed |
| POST delivery quote | 113 / 2 / 1 / 111 → 20 / 2 / <1 / 18 | 86 / 2 / <1 / 84 → 17 / 2 / 1 / 15 |
| Click to popup closed | 316 → 262 | 327 → 280 |
| Estimated frontend/other residual on popup critical path | 28 → 22 | 36 → 20 |
| Address POST after five rapid clicks | 1 → 1 | 1 → 1 |

The candidate opened one realtime stream per browser context in the entire exercise. The POST itself did not materially speed up in this sample. The measured popup improvement came from removing the account round trip. Quote timing varies with client scheduling and is reported separately.
