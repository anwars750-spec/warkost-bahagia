alter function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) set search_path = public, pg_temp;
alter function public.get_customer_delivery_quote(numeric,numeric) set search_path = public, pg_temp;
revoke execute on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) from public, anon;
revoke execute on function public.get_customer_delivery_quote(numeric,numeric) from public, anon;
grant execute on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) to authenticated;
grant execute on function public.get_customer_delivery_quote(numeric,numeric) to authenticated;

comment on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) is
'Customer checkout RPC. SECURITY DEFINER with explicit search_path; customer ownership and business rules validated server-side.';
comment on function public.get_customer_delivery_quote(numeric,numeric) is
'Customer delivery quote RPC. SECURITY DEFINER with explicit search_path; only authenticated customer role may execute.';
