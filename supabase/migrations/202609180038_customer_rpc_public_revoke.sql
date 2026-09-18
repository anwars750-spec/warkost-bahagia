-- Customer RPC security boundary V1
-- Public customer-facing SECURITY DEFINER functions are replaced by private functions
-- and authenticated Edge Functions. Revoke the old REST RPC grants.
revoke all on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) from public, anon, authenticated;
revoke all on function public.get_customer_delivery_quote(numeric,numeric) from public, anon, authenticated;

comment on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) is
'Deprecated public wrapper disabled. Customer checkout is exposed only through customer-order-create Edge Function.';
comment on function public.get_customer_delivery_quote(numeric,numeric) is
'Deprecated public wrapper disabled. Delivery quote is exposed only through customer-delivery-quote Edge Function.';
