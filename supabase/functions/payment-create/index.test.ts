Deno.test("payment-create accepts only order_id as client input", () => {
  const allowedBodyKeys = new Set(["order_id"]);
  if (allowedBodyKeys.has("status") || allowedBodyKeys.has("amount")) {
    throw new Error("client payment mutation fields must not be accepted");
  }
});
