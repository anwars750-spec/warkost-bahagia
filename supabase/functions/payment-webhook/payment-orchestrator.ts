import type {
  CreatePaymentInput,
  PaymentInstruction,
  PaymentProviderAdapter,
  PaymentStatus,
} from "./payment-adapter.ts";
import { getPaymentProvider } from "./payment-adapter-registry.ts";

export type PaymentOrchestrator = {
  createPayment(provider: string, input: CreatePaymentInput): Promise<PaymentInstruction>;
  getPaymentStatus(provider: string, providerReference: string): Promise<PaymentStatus>;
};

export function createPaymentOrchestrator(): PaymentOrchestrator {
  return {
    async createPayment(provider, input) {
      const adapter = getPaymentProvider(provider);
      const instruction = await adapter.createPayment(input);

      if (instruction.provider.trim().toLowerCase() !== adapter.provider.trim().toLowerCase()) {
        throw new Error("payment provider mismatch");
      }
      if (instruction.amount !== input.amount) throw new Error("payment amount mismatch");
      if (instruction.currency.toUpperCase() !== input.currency.toUpperCase()) {
        throw new Error("payment currency mismatch");
      }
      if (!instruction.reference) throw new Error("payment reference is required");
      if (!instruction.expiresAt) throw new Error("payment expiry is required");

      return instruction;
    },

    async getPaymentStatus(provider, providerReference) {
      if (!providerReference) throw new Error("provider reference is required");
      return getPaymentProvider(provider).getPaymentStatus(providerReference);
    },
  };
}
