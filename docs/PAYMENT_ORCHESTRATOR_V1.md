# Payment Orchestrator V1

The payment orchestrator is the provider-neutral boundary between Warkost business logic and a concrete payment adapter.

## Responsibilities
- Resolve the configured provider through the registry.
- Ask the adapter to create a payment.
- Validate provider, amount, currency, reference, and expiry before returning instructions.
- Delegate status inquiry to the selected adapter.

## Security boundary
The orchestrator does not accept a client-supplied PAID state. Payment completion remains server-side through the normalized webhook/status-validation path and `private.verify_payment`.

## Provider integration
A concrete BTN or gateway adapter must implement the existing `PaymentProviderAdapter` contract. Provider credentials and secrets belong in Supabase Edge Function secrets, never in frontend code or Git.
