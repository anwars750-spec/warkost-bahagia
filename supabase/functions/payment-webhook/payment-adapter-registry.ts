import type { PaymentProviderAdapter } from "./payment-adapter.ts";

const adapters = new Map<string, PaymentProviderAdapter>();

export function registerPaymentProvider(adapter: PaymentProviderAdapter): void {
  const provider = adapter.provider.trim().toLowerCase();
  if (!provider) throw new Error("provider is required");
  if (adapters.has(provider)) throw new Error(`payment provider already registered: ${provider}`);
  adapters.set(provider, adapter);
}

export function getPaymentProvider(provider: string): PaymentProviderAdapter {
  const key = provider.trim().toLowerCase();
  if (!key) throw new Error("provider is required");
  const adapter = adapters.get(key);
  if (!adapter) throw new Error(`unsupported payment provider: ${key}`);
  return adapter;
}

export function clearPaymentProvidersForTests(): void {
  adapters.clear();
}
