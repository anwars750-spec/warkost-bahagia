import { assertNormalizedEvent, type NormalizedPaymentEvent } from "./payment-adapter.ts";

Deno.test("accepts normalized paid event", () => {
  const event: NormalizedPaymentEvent = {
    provider: "test",
    event_id: "evt-1",
    event_type: "payment.success",
    provider_reference: "REF-1",
    transaction_reference: "TXN-1",
    order_reference: "WB-TEST-1",
    status: "paid",
    amount: 23000,
    currency: "IDR",
    event_time: new Date().toISOString(),
  };
  assertNormalizedEvent(event);
});

Deno.test("rejects missing provider reference", () => {
  const event: NormalizedPaymentEvent = {
    provider: "test",
    event_id: "evt-2",
    event_type: "payment.success",
    provider_reference: "",
    transaction_reference: null,
    order_reference: "WB-TEST-1",
    status: "paid",
    amount: 23000,
    currency: "IDR",
    event_time: new Date().toISOString(),
  };
  try {
    assertNormalizedEvent(event);
    throw new Error("invalid event accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "provider_reference is required") {
      throw error;
    }
  }
});

Deno.test("rejects unsupported status", () => {
  const event = {
    provider: "test",
    event_id: "evt-3",
    event_type: "payment.unknown",
    provider_reference: "REF-3",
    transaction_reference: null,
    order_reference: "WB-TEST-1",
    status: "refunded",
    amount: 23000,
    currency: "IDR",
    event_time: new Date().toISOString(),
  } as unknown as NormalizedPaymentEvent;

  try {
    assertNormalizedEvent(event);
    throw new Error("unsupported status accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "unsupported payment status") {
      throw error;
    }
  }
});
