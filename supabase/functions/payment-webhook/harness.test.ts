import { assertHarness, PAYMENT_HARNESS_CASES } from "./harness.ts";

Deno.test("payment webhook harness definitions are deterministic", () => {
  assertHarness(PAYMENT_HARNESS_CASES.length === 4, "Expected 4 security cases");
  assertHarness(PAYMENT_HARNESS_CASES.some(c => c.name === "invalid signature" && c.expectedStatus === 401), "Invalid signature case missing");
  assertHarness(PAYMENT_HARNESS_CASES.some(c => c.name === "missing signature" && c.expectedStatus === 503), "Missing configuration case missing");
  assertHarness(PAYMENT_HARNESS_CASES.some(c => c.name === "empty body" && c.expectedStatus === 400), "Empty body case missing");
});
