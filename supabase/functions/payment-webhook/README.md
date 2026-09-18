# Payment Webhook — Provider-Agnostic Skeleton

This directory defines the server boundary for payment callbacks.

## Current status
Skeleton only. It does **not** verify or settle real payments.

## Adapter boundary
Provider -> webhook authentication -> normalized payment event -> validation -> idempotency -> private.verify_payment.

The provider-specific layer will later support either:
- BTN QRIS
- Payment Gateway

The business logic after verification must remain provider-neutral.

## Required normalized event
- provider
- provider_reference
- transaction_reference
- order_reference
- status
- amount
- currency
- event_id
- event_time

## Production gates
- Signature/authentication
- Amount validation
- Order/payment reference validation
- Idempotency
- Replay protection
- Service-role database call
- Audit logging
- Failure handling
- Secret management
