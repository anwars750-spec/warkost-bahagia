export type PaymentStatus = "pending" | "paid" | "failed" | "expired";

export type NormalizedPaymentEvent = {
  provider: string;
  event_id: string;
  event_type: string;
  provider_reference: string;
  transaction_reference: string | null;
  order_reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  event_time: string;
};

export type CreatePaymentInput = {
  orderReference: string;
  amount: number;
  currency: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type PaymentInstruction = {
  provider: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  expiresAt: string;
  customerAction?: string;
  payload?: Record<string, unknown>;
};

export interface PaymentProviderAdapter {
  readonly provider: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentInstruction>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatus>;
  normalizeWebhook(request: Request, rawBody: string): Promise<NormalizedPaymentEvent>;
}

export function assertNormalizedEvent(event: NormalizedPaymentEvent): void {
  if (!event.provider) throw new Error("provider is required");
  if (!event.event_id) throw new Error("event_id is required");
  if (!event.provider_reference) throw new Error("provider_reference is required");
  if (!event.order_reference) throw new Error("order_reference is required");
  if (!["pending", "paid", "failed", "expired"].includes(event.status)) {
    throw new Error("unsupported payment status");
  }
  if (!Number.isFinite(event.amount) || event.amount < 0) {
    throw new Error("invalid payment amount");
  }
  if (!event.currency) throw new Error("currency is required");
  if (!event.event_time) throw new Error("event_time is required");
}
