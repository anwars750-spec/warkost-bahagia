import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertCustomerCheckoutPaymentMethod,
  CUSTOMER_CHECKOUT_PAYMENT_METHOD,
} from "../lib/customer-checkout-payment-policy.mjs";

test("Customer checkout hanya menerima QRIS", () => {
  assert.equal(CUSTOMER_CHECKOUT_PAYMENT_METHOD, "QRIS");
  assert.equal(assertCustomerCheckoutPaymentMethod("QRIS"), "QRIS");
  assert.equal(assertCustomerCheckoutPaymentMethod("qris"), "QRIS");
});

test("CASH, BANK_TRANSFER, dan metode lain ditolak untuk order baru Customer", () => {
  for (const method of ["CASH", "BANK_TRANSFER", "CRYPTO", "", null]) {
    assert.throws(
      () => assertCustomerCheckoutPaymentMethod(method),
      (error) =>
        error.status === 422 &&
        error.message === "Checkout Customer hanya mendukung pembayaran QRIS",
    );
  }
});

test("endpoint checkout memvalidasi payment policy sebelum createOrder", () => {
  const route = fs.readFileSync(
    fileURLToPath(new URL("../app/api/checkout/route.js", import.meta.url)),
    "utf8",
  );
  assert.match(route, /assertCustomerCheckoutPaymentMethod\(body\.method\)/);
  assert.match(route, /method,\s*fulfillmentType/);
});

test("UI Customer tetap memaksa QRIS dan menyembunyikan COD legacy", () => {
  const runtime = fs.readFileSync(
    fileURLToPath(new URL("../app/CustomerQrisOnlyRuntime.js", import.meta.url)),
    "utf8",
  );
  assert.match(runtime, /value=\"CASH\"/);
  assert.match(runtime, /cash\.disabled = true/);
  assert.match(runtime, /option\.hidden = true/);
  assert.match(runtime, /value=\"QRIS\"/);
  assert.match(runtime, /qris\.click\(\)/);
});
