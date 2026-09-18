# Payment V1 Validation

## Normalized flow

Provider webhook -> provider adapter -> normalized event -> event inbox -> validation -> payment verifier.

## Validation rules

1. Event must have provider + event_id.
2. Normalized order reference must resolve to an existing order.
3. Order must have exactly one payment record for the payment workflow.
4. Event amount must exactly match payment amount.
5. Provider reference must not conflict with an existing payment reference.
6. Duplicate provider/event IDs are idempotent.
7. Only service-role/server code can execute validation and payment verification.
8. Payment state changes are never accepted from the browser.

## Provider-neutral status mapping

pending -> pending
paid/success -> paid
failed -> failed
expired/timeout -> expired

Provider-specific names must be translated by the adapter.

## Production gates

- Provider signature/authentication
- Currency validation
- Timestamp/replay window
- Provider reference uniqueness
- Exact order/payment mapping
- Amount validation
- Idempotency
- Audit trail
- Retry-safe acknowledgement
- Real provider integration test

BTN QRIS and payment gateway adapters remain intentionally unimplemented.
