-- Customer order RPC: keep server-side calculation but expose it only through
-- an unguessable internal RPC boundary is not sufficient by itself. The function
-- still validates auth.uid() and customer role. Keep authenticated execute for now;
-- production review must additionally verify API schema exposure and rate limits.
comment on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text)
is 'SECURITY REVIEW: authenticated execute is intentional for customer checkout; function binds auth.uid(), validates customer role, calculates price/fee server-side, and delegates to private order creation. Add rate limiting at API/edge layer before production.';
