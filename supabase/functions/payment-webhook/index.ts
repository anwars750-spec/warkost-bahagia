import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  if (!rawBody.trim()) return response({ ok: false, error: "Empty webhook body" }, 400);

  // PROVIDER-AGNOSTIC SKELETON ONLY.
  // Do not mark a payment as paid from this function yet.
  //
  // Production sequence:
  // 1. authenticate provider signature
  // 2. parse provider event
  // 3. validate provider reference -> payment/order
  // 4. validate amount/currency
  // 5. enforce idempotency/replay protection
  // 6. call private.verify_payment with service role
  // 7. write audit/error telemetry
  //
  // Provider adapters will be added later for BTN QRIS or a payment gateway.

  return response({ ok: true, accepted: true, mode: "skeleton" });
});
