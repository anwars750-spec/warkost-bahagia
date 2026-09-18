# payment-create

Provider-neutral Edge Function boundary for creating a payment instruction.

The foundation intentionally returns HTTP 503 until a real provider adapter is registered. This prevents a simulator or client-side value from becoming production payment authority.

When a provider is ready:
- implement PaymentProviderAdapter
- register the concrete adapter
- configure PAYMENT_PROVIDER
- store provider secrets in Edge Function secrets
- persist the provider reference/instruction
- keep payment completion server-side through webhook/status validation.
