import { clearPaymentProvidersForTests, registerPaymentProvider } from "./payment-adapter-registry.ts";
import { createPaymentOrchestrator } from "./payment-orchestrator.ts";
import type { PaymentProviderAdapter } from "./payment-adapter.ts";

function makeAdapter(overrides: Partial<PaymentProviderAdapter> = {}): PaymentProviderAdapter {
  return {
    provider: "test",
    async createPayment(input) {
      return {
        provider: "test",
        reference: `REF-${input.orderReference}`,
        status: "pending",
        amount: input.amount,
        currency: input.currency,
        expiresAt: input.expiresAt,
      };
    },
    async getPaymentStatus() {
      return "pending";
    },
    async normalizeWebhook() {
      throw new Error("not implemented");
    },
    ...overrides,
  };
}

Deno.test("orchestrator creates a validated payment instruction", async () => {
  clearPaymentProvidersForTests();
  registerPaymentProvider(makeAdapter());
  const result = await createPaymentOrchestrator().createPayment("test", {
    orderReference: "WB-1",
    amount: 23000,
    currency: "IDR",
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  });
  if (result.reference !== "REF-WB-1") throw new Error("reference mismatch");
  clearPaymentProvidersForTests();
});

Deno.test("orchestrator rejects provider mismatch", async () => {
  clearPaymentProvidersForTests();
  registerPaymentProvider(makeAdapter({
    async createPayment(input) {
      return {
        provider: "other",
        reference: "REF",
        status: "pending",
        amount: input.amount,
        currency: input.currency,
        expiresAt: input.expiresAt,
      };
    },
  }));
  try {
    await createPaymentOrchestrator().createPayment("test", {
      orderReference: "WB-2", amount: 23000, currency: "IDR",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });
    throw new Error("mismatch accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "payment provider mismatch") throw error;
  }
  clearPaymentProvidersForTests();
});

Deno.test("orchestrator rejects amount mismatch", async () => {
  clearPaymentProvidersForTests();
  registerPaymentProvider(makeAdapter({
    async createPayment(input) {
      return { provider: "test", reference: "REF", status: "pending", amount: input.amount + 1, currency: input.currency, expiresAt: input.expiresAt };
    },
  }));
  try {
    await createPaymentOrchestrator().createPayment("test", {
      orderReference: "WB-3", amount: 23000, currency: "IDR",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });
    throw new Error("amount mismatch accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "payment amount mismatch") throw error;
  }
  clearPaymentProvidersForTests();
});
