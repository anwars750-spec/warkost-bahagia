import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createPaymentOrchestrator } from "../payment-webhook/payment-orchestrator.ts";
import { registerPaymentProvider } from "../payment-webhook/payment-adapter-registry.ts";
import type { PaymentProviderAdapter } from "../payment-webhook/payment-adapter.ts";

const configuredProvider = Deno.env.get("PAYMENT_PROVIDER")?.trim().toLowerCase() || "btn";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "Payment service is not configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Authentication required" }, 401);

  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "Invalid session" }, 401);

  let body: { order_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const orderId = body.order_id?.trim();
  if (!orderId) return json({ ok: false, error: "order_id is required" }, 400);

  const { data: order, error: orderError } = await userClient
    .from("orders")
    .select("id,order_number,customer_id,total_amount,payment_status")
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .single();

  if (orderError || !order) return json({ ok: false, error: "Order not found" }, 404);
  if (order.payment_status !== "pending") {
    return json({ ok: false, error: "Order payment is not pending" }, 409);
  }

  // No provider adapter is registered in the foundation stage.
  // A real BTN/gateway adapter will be registered after its official API contract is available.
  const adapters: PaymentProviderAdapter[] = [];
  for (const adapter of adapters) registerPaymentProvider(adapter);

  try {
    const instruction = await createPaymentOrchestrator().createPayment(configuredProvider, {
      orderReference: order.order_number,
      amount: Number(order.total_amount),
      currency: "IDR",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    return json({ ok: true, instruction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment provider unavailable";
    if (message.startsWith("unsupported payment provider")) {
      return json({ ok: false, error: "Payment provider belum terhubung." }, 503);
    }
    return json({ ok: false, error: message }, 502);
  }
});
