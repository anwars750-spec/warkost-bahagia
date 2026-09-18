# Payment Core Automated Test Matrix

## Current automated coverage
- exact pending -> paid event
- amount mismatch rejection
- currency mismatch rejection
- paid -> failed rejection
- failed -> paid rejection
- provider reference conflict rejection
- webhook envelope/security cases

## Existing database E2E baseline
Previously verified against Supabase:
- stock reservation
- paid commits stock
- failed/expired releases stock
- duplicate paid webhook is idempotent
- mixed food/drink fulfillment
- pickup blocked until all fulfillment ready
- driver max 5 stops
- completed delivery creates one sale
- completed eligible order earns loyalty once

## Remaining integration automation
- authenticated webhook -> normalized event -> database validator
- database validator -> private.verify_payment
- exact once side effects under repeated events
- replay/timestamp window
- production provider signature implementation

## Provider independence
No BTN or payment gateway credentials are required by these tests.
