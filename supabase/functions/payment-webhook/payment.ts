export type NormalizedPaymentEvent = {
  provider: string;
  event_id: string;
  event_type?: string;
  provider_reference?: string;
  transaction_reference?: string;
  order_reference: string;
  status: "pending" | "paid" | "failed" | "expired";
  amount: number;
  currency: string;
  event_time?: string;
};

export function normalizePaymentEvent(input: Record<string, unknown>, provider: string): NormalizedPaymentEvent {
  throw new Error("Provider adapter not configured");
}

// Provider adapters must implement the same normalized event contract.
// No BTN or payment-gateway assumptions belong in the core workflow.
