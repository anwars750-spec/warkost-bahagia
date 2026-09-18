# BTN QRIS Integration Checklist

## Current finding
BTN publicly documents a BTN Open API product that includes a QRIS API and provides a sandbox/developer onboarding path. The exact API contract needed by this application must be obtained from BTN's developer portal / merchant onboarding before implementing provider-specific HTTP calls.

## Architecture
```
Warkost payment-create
        |
        v
PaymentProviderAdapter
        |
        +--> BTN QRIS adapter
        |
        +--> Payment Gateway fallback
```

## BTN adapter contract
The adapter must implement:
- createPayment(input)
- getPaymentStatus(providerReference)
- normalizeWebhook(request, rawBody)

## Information required from BTN
- sandbox base URL
- production base URL
- authentication scheme
- client/application credentials
- QRIS create-payment request schema
- QRIS response schema
- provider reference field
- transaction/reference field
- amount/currency semantics
- expiry semantics
- status inquiry endpoint
- webhook/callback endpoint
- webhook signature/authentication scheme
- retry behavior
- error codes
- idempotency mechanism
- sandbox test credentials and test cases

## Important
Do not guess BTN endpoint paths, headers, signatures, or payload fields. Implement them only from BTN's current official API specification.

## Current production state
Payment creation remains fail-closed until a real provider adapter is registered.
