import {
  clearPaymentProvidersForTests,
  getPaymentProvider,
  registerPaymentProvider,
} from "./payment-adapter-registry.ts";
import type { PaymentProviderAdapter } from "./payment-adapter.ts";

const adapter: PaymentProviderAdapter = {
  provider: "test",
  async createPayment(input) {
    return {
      provider: "test",
      reference: `TEST-${input.orderReference}`,
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
    throw new Error("not implemented in registry test");
  },
};

Deno.test("registry returns registered provider", () => {
  clearPaymentProvidersForTests();
  registerPaymentProvider(adapter);
  if (getPaymentProvider("TEST").provider !== "test") throw new Error("provider lookup failed");
});

Deno.test("registry rejects unknown provider", () => {
  clearPaymentProvidersForTests();
  try {
    getPaymentProvider("unknown");
    throw new Error("unknown provider accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "unsupported payment provider: unknown") {
      throw error;
    }
  }
});

Deno.test("registry rejects duplicate provider", () => {
  clearPaymentProvidersForTests();
  registerPaymentProvider(adapter);
  try {
    registerPaymentProvider(adapter);
    throw new Error("duplicate provider accepted");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "payment provider already registered: test") {
      throw error;
    }
  }
  clearPaymentProvidersForTests();
});
