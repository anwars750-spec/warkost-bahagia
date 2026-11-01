export const CUSTOMER_CHECKOUT_PAYMENT_METHOD = "QRIS";

export function assertCustomerCheckoutPaymentMethod(method) {
  const normalized = String(method || "")
    .trim()
    .toUpperCase();

  if (normalized !== CUSTOMER_CHECKOUT_PAYMENT_METHOD) {
    const error = new Error("Checkout Customer hanya mendukung pembayaran QRIS");
    error.status = 422;
    throw error;
  }

  return CUSTOMER_CHECKOUT_PAYMENT_METHOD;
}
