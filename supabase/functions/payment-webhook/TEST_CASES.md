# Payment Webhook Security Test Cases

## Authentication
- POST without signature -> 401/503, no database mutation.
- Wrong signature -> 401, no database mutation.
- Valid HMAC test signature -> accepted by security boundary.

## Payload
- Empty body -> 400.
- Invalid JSON -> 400.
- Valid JSON -> reaches adapter boundary.

## Payment validation (next integration layer)
- Unknown order reference -> rejected.
- Unknown payment -> rejected.
- Amount mismatch -> rejected.
- Currency mismatch -> rejected.
- Conflicting provider reference -> rejected.
- Duplicate provider + event_id -> idempotent.
- Replay of an already processed event -> no second financial effect.

## State transitions
- pending -> paid: allowed after authenticated provider verification.
- pending -> failed: allowed.
- pending -> expired: allowed.
- paid -> paid: idempotent.
- paid -> failed: reject.
- paid -> expired: reject.
- failed -> paid: reject unless a documented provider reversal/retry workflow explicitly supports it.

## Business side effects
- PAID commits reserved stock exactly once.
- FAILED/EXPIRED releases reserved stock exactly once.
- PAID creates fulfillment exactly once.
- Completed delivery creates sales exactly once.
- Completed eligible order earns loyalty exactly once.

Real provider signature tests must be added only after BTN or a gateway is selected.
