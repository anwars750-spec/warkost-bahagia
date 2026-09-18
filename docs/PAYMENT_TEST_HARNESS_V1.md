# Payment Test Harness V1

## Purpose
Test the complete payment state machine without connecting a real payment provider.

## Safety boundary
The test provider is isolated behind:
- `PAYMENT_WEBHOOK_TEST_MODE=true`
- normalized event `provider=test`
- signed webhook request using `PAYMENT_WEBHOOK_TEST_SECRET`

The production payment flow must never rely on this harness.

## Flow
1. Create order.
2. Payment starts as `pending`.
3. Test webhook sends a normalized event.
4. Server validates event identity, order, amount, currency, provider reference, and event freshness.
5. Server calls `verify_payment`.
6. `paid` commits stock and creates fulfillment.
7. `failed/expired` releases stock.
8. Duplicate event is ignored/idempotent.

## Required test cases
- PAID success
- FAILED release
- EXPIRED release
- duplicate event
- duplicate provider reference
- amount mismatch
- currency mismatch
- provider mismatch
- unknown order
- stale event
- illegal state transition
- concurrent payment creation

## Production rule
A customer claim, frontend state, simulator, or manually edited database row is never a payment authority.
Only authenticated provider verification/webhook/status inquiry may transition payment to PAID.
