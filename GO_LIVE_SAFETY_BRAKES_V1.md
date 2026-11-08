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
