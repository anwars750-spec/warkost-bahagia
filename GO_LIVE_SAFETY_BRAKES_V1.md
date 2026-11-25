# Warkost Bahagia — Go-Live Safety Brakes V1

Status: **SPECIFICATION LOCK / NOT IMPLEMENTED / GO-LIVE BLOCKER**
Date: 2026-11-08
Owner: Product Owner approves all policy limits and production activation.
Area: 02 — APP & AUTOMATION LAB.
Branch: `work/go-live-safety-brakes-v1`; based on `work/customer-ui-polish-v1` @ `5fa3092f5ec664b9765f6f7aa3bf89e370a2468e`.

## Purpose

1. Prevent unintended external geolocation/API charges while Warkost uses Geoapify Free.
2. Preserve financial integrity of QRIS payments when a real provider (planned Midtrans) is integrated.
3. Never silently convert an external location failure into an incorrect delivery fee, nor lose an already-paid order.
4. Do **not** merge or deploy production as part of this specification.

## External provider reality (verified 2026-11-08)

- Geoapify Free currently offers 3,000 credits/day, no card required, up to 5 requests/second, and commercial use with attribution.
- Its published daily limit is **soft**, not an enforceable server-side stop. Its terms reserve the right to suspend services or assess overage charges. Do not promise unlimited or guaranteed zero-cost usage.
- Different endpoints/features have different credit prices; e.g., map tiles and detailed routes differ from plain two-point routing.
- Sources:
  - https://www.geoapify.com/pricing/
  - https://www.geoapify.com/pricing-details/
  - https://www.geoapify.com/terms-and-conditions/
  - https://myprojects.geoapify.com/help/api-keys/
  - https://apidocs.geoapify.com/docs/routing/

## Baseline audit (not acceptance)

- `lib/delivery.mjs` already calculates Haversine distance and backend delivery fee. This is straight-line distance, not driving-road distance. Preserve existing Product Owner-approved delivery rules until separately authorized.
- `lib/payments.mjs` enqueues print jobs after persisted QRIS PAID. The provider-neutral payment pipeline has webhook/idempotency work, but production-provider integration remains a separate unverified milestone.
- `lib/print-queue.mjs` creates DB tickets; it does **not** establish receipt physically printed.
- Current scope is brakes and verifiable test coverage, not new delivery pricing, account billing, or production secrets.

## Brake A — Geoapify usage / cost safety (P0)

### Account rules

- Sign up **Free only** with the Owner-controlled business email. Do not add payment card, choose paid subscription, or authorize paid upgrade without written Product Owner approval.
- Separate staging and production **Geoapify projects** where possible, each Free with distinct API key and quota. Separate keys in one project are not enough: they share quota.
- Restrict keys appropriately for server / browser sources; rotate if exposed; display required Geoapify/data attribution.
- Production Geoapify integration must be **OFF by default** until the product owner explicitly enables it after UAT.

### Mandatory app-side enforcement

- Configurable kill switch `GEOLOCATION_EXTERNAL_ENABLED`, default false; unauthorized roles cannot alter it.
- Production starting allowance **maximum 1,500 estimated Geoapify credits per rolling 24-hour window** (50% of Free daily allowance), subject to review after measuring all tile/geocoding/routing use. Count by provider-verified endpoint price, not by request count alone. Maintain additional conservative provider-calendar/day checks where documented. Reset semantics must not permit quota overshoot.
- All requests that consume credits (routing, geocode/autocomplete, reverse-geocode, tiles if Geoapify-hosted, and any retries) must pass through a controlled accounting gateway. **No uncontrolled browser map tile/API requests**. If a map stack cannot satisfy this, redesign its tile path/source or reject Go-Live rather than claiming a hard cap.
- Reserve worst-case credit cost atomically in durable shared storage **before** calling provider. Concurrent requests, process restarts, multiple instances, retries, errors and timeouts must not bypass the cap. If usage/cost is unknown or accounting storage unavailable, deny external call. Do not assume failed provider requests are free.
- Set conservative rate limit <=2 requests/sec (aggregated as feasible; lower than Free plan's 5 rps) and endpoint-level caps and input constraints; per-user/IP abuse controls; debounce search; caching only when permitted by provider's terms.
- At 50%, 80%, 100% of the internal allowance: surface alerts to Owner/operations with nonsecret usage totals. On 80%: degrade noncritical autocomplete/tile refresh to conserve quota; on 100%: automatic hard stop for **every** external credit-consuming request. Do not auto-upgrade billing.
- Add authenticated, read-only Owner observability: total reserved/used credits, last provider success/failure, current internal limit, emergency OFF, and alerts. Avoid full addresses, secret keys, or customer PII in logs.
- Clearly distinguish app-side modeled consumption from actual provider metering. Monitor Geoapify's own dashboard separately and investigate discrepancy before production.

### Search UX credit throttle — Warkost V1 approved proposal (2026-11-08)

The Product Owner proposes a maximum of **3 address recommendations** so customers see fewer results. This is good UX, **but a `limit=3` response still costs 1 credit per Autocomplete API call**. Reduce actual calls as follows (reference: https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/ and https://www.geoapify.com/pricing-details/):

- Set provider autocomplete `limit=3` and render no more than 3 suggestions. Never load a large result set and only trim it visually.
- Require at least 3 meaningful characters after normalization; **700 ms debounce** after input pauses; cancel stale client requests and discard outdated responses. Note: cancelling after a provider call is already sent does **not** refund consumed credits.
- Start with **5 autocomplete requests per active address-search attempt**, plus conservative per-customer/per-IP throttles; treat 5 as a design starting limit subject to usability UAT, not a known ideal. Provide a user-controlled restart after exhaustion without allowing endless free resets. Preserve ability to type a precise address or adjust a location pin.
- Request a road route only after the user selects/confirms coordinates, not after every keystroke or suggestion change. Debounce rerouting when moving a pin.
- **Do not download Geoapify map tiles on initial form render.** Lazy-load an interactive map only when user explicitly chooses to check/adjust the pin, after safe accounting. Map tile requests also consume credits and must pass the governed quota strategy or use a permitted alternative provider; no direct unmetered tile calls. If unable to meter all tiles, block production integration.
- Filter to Indonesia and bias towards the configured Warkost operating area without mistakenly hiding valid in-radius addresses. Never rely on geocoding proximity instead of a backend-confirmed delivery quote.
- Apply allowlisted provider-term-compliant short-lived caching of repeated normalized queries (with appropriate geographical context), without retaining unnecessary customer location/PII. Server-side enforcement must also prevent automated/key-abuse traffic and persist usage counters across process restarts.
- Show understandable error UI if the search attempt allowance or daily credit allowance is exceeded, without implying orders/payment were lost. Owner-facing counters should separate autocomplete, routing and map tiles.

Acceptance tests: 1,000 rapid keystrokes while typing one address trigger no more than the designed debounced requests; API response contains <=3; five-request search-attempt limit is server-enforced; stale/cancelled requests do not create duplicate routes; route only after selected coordinate; tiles are lazy and accounted; abusive refresh/new-tab/IP usage cannot bypass app-wide hard cap; pickup and already paid orders continue during quota exhaustion.

### Safe degradation

- Public catalog, customer account, previously paid orders, realtime and notifications continue normally if Geoapify is unavailable or exhausted.
- A delivery checkout requiring a fresh route/valid quote must fail **closed** with a helpful explanation; never guess a road-route fee, use client-reported distance, or silently substitute Haversine for a locked road-routing contract.
- Already-confirmed server-side valid, unexpired quotes may be reused *only if* they are bound to the same customer/order context, location, fulfillment mode and delivery rules. No stale quote bypass.
- Pickup can continue without geolocation, according to existing locked fulfillment rules.
- No order or QRIS payment should be created if a delivery quote is mandatory but unavailable; an already-paid order must **not** be cancelled due solely to Maps outage.

## Brake B — Customer QRIS payment safety (P0; audit first, do not rewrite accepted core)

- Production must not use QRIS simulation. Provider-side live credentials and signed callback verification are mandatory.
- Only server-verified payment can mark order PAID; validate provider reference, merchant, currency, amount, expiry, signature, status and intended order. Ignore untrusted client 'paid' claims.
- Apply single authoritative payment/order state machine and transactionally dedupe webhook events and side effects: stock, loyalty, print job, fulfillment and push notification.
- Duplicate, out-of-order, missing or failed provider callbacks must not create duplicate charges or lose a paid payment record. Preserve raw provider reference and safe audit metadata without leaking tokens.
- An independent reconciliation check compares pending/paid provider transactions with internal records; discrepancies go to an Owner/Admin **attention** queue. Do not automatically assume paid for ambiguous transactions.
- On transient DB failure, respond to webhook so the provider can retry according to its documented semantics, and persist enough evidence for recovery.
- Protect against double checkout and repeated Pay clicks with idempotency keys.
- Reconcile/capture a payment successfully made even if browser closes; customer can resume and see status.
- Production QRIS integration remains **BLOCKED** until an approved provider is connected, official signature/status APIs verified and real signed sandbox/production-mode UAT is recorded. No payments run as part of writing this spec.

## Required deterministic tests before enabling Geoapify

1. Unset key / default OFF -> zero outbound external requests.
2. Under cap -> allowed, accurate immutable/debited credit reservations.
3. Exactly at cap / request exceeding remaining credits -> blocked before network call.
4. 100 concurrent requests and multi-process restart -> cumulative reservations never exceed 1,500.
5. Retry/timeouts/error/unknown endpoint cost -> cannot evade accounting; fail closed.
6. Autocomplete spam, compromised session, anonymous burst -> rate limiting; no API key leak.
7. All browser/network calls (including map tiles) audited for unmanaged billable paths; assert none.
8. Provider 429/5xx and quota exhaustion -> catalog works, new delivery quotes fail clearly; pickup and paid orders unaffected.
9. Cross-project staging/production key isolation, attribution, roles and Owner emergency OFF.
10. No delivery payment/order without required trustworthy valid quote.

## Required payment regression tests

1. Pending QRIS -> zero PAID events, no premature print or fulfillment.
2. Signed/verified PAID -> one payment/order transition and one set of side effects.
3. Duplicate/replayed/out-of-order webhook -> no duplicate financial effects or stock.
4. Browser closes during payment -> server still reconciles result.
5. Provider PAID but DB side effect fails -> recoverable reconciliation, no silent loss.
6. Wrong amount, invalid signature, expired/unknown reference -> rejected/flagged.
7. Maps outage after successful payment -> paid order remains operational.
8. Printer failure -> payment/paid order not rolled back; print retry is separate.

## Go-Live acceptance gate

- Code, tests, deployment configuration and precise provider-credit metrics are implemented by Codex in this isolated branch; CI passes. Peer/control review and Owner UAT are mandatory.
- Owner verifies Geoapify Free **and no attached paid subscription**, no unmetered direct requests, attribution, quota alerts and cap.
- Owner validates live printer proof separately.
- Owner approves real Midtrans merchant activation and signed-payment sandbox UAT before any production transaction.
- No merge, production deploy, paid upgrade, or production secret changes without explicit Owner permission.

## Handoff to Codex

Implement **Brake A** first on this branch. Audit all network calls and use existing backend pricing rules; do not add Geoapify integration or alter checkout business rules beyond the minimal safe-gating layer without separate acceptance. Return changed-file list, tests, exact credit accounting strategy (including tiles), remaining limits, and the commit SHA. No merge/deploy. After review, audit **Brake B** without rewriting already-accepted QRIS core, and report confirmed production blockers.

## Brake A implementation handoff (2026-11-08)

Status: **READY FOR CONTROL CENTER CODE REVIEW. GEOAPIFY LIVE ACTIVATION BLOCKED.**

- Audit: the Customer picker had autocomplete/place/reverse requests without matching handlers. The Customer confirmation embedded Google Maps when configured, and Owner location settings embedded Google Maps automatically. Both embeds are gone. Owner and Driver retain explicit external Maps links. Customer GPS uses the browser device location. Address search, quote preview and checkout make no browser requests to Geoapify, routing, reverse geocoding or map tiles.
- The new Customer-only POST endpoint is same-origin and no-store. Its server handler has a fixed HTTPS destination, Indonesia filter, outlet proximity bias, three-result limit, sanitized output, four-second transport deadline and no redirect/retry. It has an injection seam for offline verification. The deployed route has no live transport configured in this change and returns 503. The spec requires separate acceptance to connect a real provider.
- The 700 ms debounce uses normalized input with at least three letters/digits, cancels stale requests and ignores outdated results. The server accepts up to five outbound searches per customer/attempt, ten per customer and thirty per trusted IP per rolling 24 hours. The user can start a new attempt without resetting customer, IP or global limits. Successful autocomplete responses alone may be reused for 60 seconds in a bounded 64-entry, per-process memory cache scoped to customer and outlet. Cached queries use a keyed fingerprint. Attribution is displayed with suggestions. No address/query text is stored in the ledger.
- Migration 036 adds a shared lock and reservation ledger. A MySQL transaction locks the same row across all processes, reads the ledger with the database clock, and commits the credit reservation before the transport runs. SQLite uses its existing immediate write transaction. One autocomplete attempt costs one estimated credit. An incomplete reservation counts indefinitely, and a completed reservation counts for 24 hours after completion, including errors and timeouts. That window also protects any provider calendar day of at most 24 hours. The one-second window admits at most two globally. It counts reservations made in the last second and conservatively includes recent completions. A pending reservation stops occupying a rate slot at one second, while its credit stays reserved until safe reconciliation. At 80% (1,200), new autocomplete stops. At 100% (1,500), the hard cap refuses every allowlisted call. Routing, geocode/reverse and all map tiles are excluded from the allowlist. Tile use stays at zero until separately reviewed and accounted. Completed rows older than 48 hours are pruned on successful reservation. Reconcile stranded pending reservations before clearing them. Preserve the ledger across release, rollback and restore.
- Owner location settings read authenticated usage and alerts at 50/80/100%. The read-only endpoint also reports estimated reserved/completed credits, pending count and latest provider success/failure timestamps. Provider dashboard metering remains separate.
- Customer quote preview starts only after choosing or applying coordinates and uses the existing Haversine rules. There is no road-route pricing contract in this branch. Checkout still loads the customer-owned saved address and calculates the fee on the server inside its existing transaction. The picker offers saved addresses, GPS and coordinate editing without loading a basemap.

### VPS gate before enabling a future live transport

Keep both GEOLOCATION_EXTERNAL_ENABLED and GEOLOCATION_TRUST_PROXY false by default. Before enabling, Owner must approve the real transport and verify Free status without a paid subscription. Use separate Free Geoapify projects for staging and production, with server-only GEOAPIFY_API_KEY values restricted in Geoapify MyProjects to each VPS's actual outbound IP. Keep private Next.js port unreachable from the internet. Configure the only trusted ingress to overwrite X-Warkost-Client-IP with a verified client IP. With direct Nginx ingress use proxy_set_header X-Warkost-Client-IP $remote_addr. If there is a CDN, first verify its trusted address ranges and real-IP chain. Never forward a caller-provided value. All instances in an environment must share the same durable DB, synchronized database clock and session secret. Do not log outbound URLs, request bodies, provider payloads, credentials or IPs. Compare modeled usage to the provider dashboard. VPS ingress/egress, key restrictions, project separation and live UAT remain unverified.

### Reproduction

- npm test with WARKOST_TEST_STORE_NOW_MS=1792731600000.
- node --test tests/geo-credit-brake.test.mjs tests/customer-location-picker-ux-acceptance.test.mjs tests/customer-location-picker-ux.test.mjs tests/mysql-operations.test.mjs.
- node scripts/verify-geo-credit-mysql.mjs --mysqld <absolute-path-to-local-mysqld>. The script starts a disposable, loopback-only database and verifies 100 requests in two processes and persistence in a fresh process.
- npm run build, then run Playwright tests/uat/customer-geo-brake.spec.mjs against that local build and a disposable seed fixture. The browser mocks autocomplete and rejects external browser requests. The server test injects fake provider responses and an inert test key. No production API key or paid provider call is used.
- git diff --check.

Provider references: [credit prices](https://www.geoapify.com/pricing-details/), [autocomplete contract](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), [caching and attribution](https://www.geoapify.com/geocoding-api/), and [server key restrictions](https://myprojects.geoapify.com/help/api-keys/).

Final local results: full suite **610/610**, focused suite **30/30**, Chromium desktop/mobile **2/2**, build **38/38**, and native MySQL **47 tables / 36 migrations**. Playwright observed one request after 1,000 rapid input changes plus the final address, discarded a stale response, rendered at most three results, and made no external requests during the picker flow. Checkout regression verifies pickup remains possible at exhaustion, a persisted simulated PAID record remains PAID, and delivery without a valid address creates neither order nor payment. Browser build inspection found no reference to GEOAPIFY_API_KEY.


### Brake A follow-up — rate window and trusted ingress review

The rate predicate uses the shared database clock and counts a row once when its reservation or completion is newer than the one-second cutoff. The ledger lock still serializes admission across instances. At the cutoff an unsettled reservation ceases to occupy a rate slot. It still counts against the global daily allowance and the applicable customer, IP and search-attempt limits. Pruning applies only to completed rows. The application neither releases nor removes a stranded pending row automatically. Reconcile with provider records and operator evidence before changing any such row. The timing tests cover database admission. Provider arrival timing under stalled workers, network delays and production load still needs validation before live activation.

The app accepts exactly one valid IP literal from `X-Warkost-Client-IP` when `GEOLOCATION_TRUST_PROXY=true`. It does not fall back to `X-Forwarded-For`, `X-Real-IP` or `Forwarded`. Authentication and a valid IP format do not prove the header came from Nginx. A direct caller or an alternate proxy that passes a client-supplied value through can evade the per-IP limit. The database-backed global and per-customer limits still apply.

For a direct Nginx edge, add the header assignment in the effective proxy location and retain its existing required headers. The upstream and port below are illustrative.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Warkost-Client-IP $remote_addr;
}
```

- Bind Next.js to a private interface. Restrict its port so only the trusted ingress can connect. Check IPv4, IPv6, published container ports, alternate vhosts and any direct origin or load balancer path.
- Inspect effective Nginx configuration, including overrides. A location with its own `proxy_set_header` directives does not inherit that directive list from its parent. Every route to autocomplete must overwrite the header. Never set it from `$http_x_warkost_client_ip` or copy an unchecked forwarded chain. [Nginx proxy header documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
- Behind a CDN or load balancer, restrict origin ingress to the approved peers and configure `set_real_ip_from` with only verified peer addresses. Select the authoritative client-IP header or PROXY protocol documented for that topology. Check recursive-hop behavior if using a chain. Forward the resulting `$remote_addr` to the app. [Nginx real IP documentation](https://nginx.org/en/docs/http/ngx_http_realip_module.html)
- Before enabling trust, test the effective path with fake transport and no Geoapify key. A forged header, including duplicate values, must be overwritten and must not create a distinct rate bucket. Missing and malformed values at the app must fail closed. Check that the upstream port is inaccessible from outside the trusted boundary. The application tests do not verify VPS/Nginx configuration. Keep `GEOLOCATION_TRUST_PROXY=false` until these checks pass.

Owner's location settings show Geoapify as nonactive. `GET /api/owner-geo-usage` is read-only and Owner-only. The branch has a default-off environment gate, `GEOLOCATION_EXTERNAL_ENABLED`, and no live transport. There is no Owner UI/API emergency toggle. With a future live integration, the operator would need to set the environment gate to false and reload or restart every instance. That gate does not cancel calls already in flight. An immediate Owner-operated OFF remains a gap before live activation.

Follow-up verification passed. Focused tests 34/34, full regression 614/614, production build 38/38 pages, and disposable native MySQL 47 tables / 36 migrations. The MySQL check left two pending rows in an exited worker, ran 100 competing reservations from two processes and confirmed both old credits still counted at the 1,500 hard cap. The tests used no live transport or production key.
