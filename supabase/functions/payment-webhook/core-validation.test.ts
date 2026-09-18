type PaymentStatus = "pending" | "paid" | "failed" | "expired";

type Payment = { amount: number; currency: string; status: PaymentStatus; providerReference?: string };

type Event = {
  eventId: string;
  orderReference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerReference?: string;
};

function validate(event: Event, payment: Payment) {
  if (!event.orderReference) return "order_reference_required";
  if (event.amount !== payment.amount) return "amount_mismatch";
  if (event.currency !== payment.currency) return "currency_mismatch";
  if (payment.providerReference && event.providerReference !== payment.providerReference) return "provider_reference_mismatch";

  if (payment.status === "paid" && event.status !== "paid") return "illegal_paid_transition";
  if (payment.status === "failed" && event.status === "paid") return "illegal_failed_transition";
  if (payment.status === "expired" && event.status === "paid") return "illegal_expired_transition";

  return "valid";
}

Deno.test("accepts exact pending -> paid event", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "pending" };
  const event: Event = { eventId: "evt-1", orderReference: "WB-TEST-1", amount: 23000, currency: "IDR", status: "paid" };
  if (validate(event, payment) !== "valid") throw new Error("valid event rejected");
});

Deno.test("rejects amount mismatch", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "pending" };
  const event: Event = { eventId: "evt-2", orderReference: "WB-TEST-1", amount: 22000, currency: "IDR", status: "paid" };
  if (validate(event, payment) !== "amount_mismatch") throw new Error("amount mismatch accepted");
});

Deno.test("rejects currency mismatch", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "pending" };
  const event: Event = { eventId: "evt-3", orderReference: "WB-TEST-1", amount: 23000, currency: "USD", status: "paid" };
  if (validate(event, payment) !== "currency_mismatch") throw new Error("currency mismatch accepted");
});

Deno.test("rejects paid -> failed", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "paid" };
  const event: Event = { eventId: "evt-4", orderReference: "WB-TEST-1", amount: 23000, currency: "IDR", status: "failed" };
  if (validate(event, payment) !== "illegal_paid_transition") throw new Error("illegal transition accepted");
});

Deno.test("rejects failed -> paid", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "failed" };
  const event: Event = { eventId: "evt-5", orderReference: "WB-TEST-1", amount: 23000, currency: "IDR", status: "paid" };
  if (validate(event, payment) !== "illegal_failed_transition") throw new Error("failed -> paid accepted");
});

Deno.test("rejects provider reference conflict", () => {
  const payment: Payment = { amount: 23000, currency: "IDR", status: "pending", providerReference: "ref-a" };
  const event: Event = { eventId: "evt-6", orderReference: "WB-TEST-1", amount: 23000, currency: "IDR", status: "paid", providerReference: "ref-b" };
  if (validate(event, payment) !== "provider_reference_mismatch") throw new Error("reference conflict accepted");
});
