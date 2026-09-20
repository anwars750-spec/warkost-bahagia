-- Warkost Bahagia V1.7B-06
-- Protected server-side payment verification gateway.
-- Applied to Supabase project fyctpsfgufevijshbbrk.

create or replace function public.server_verify_payment(
  p_order_id uuid,
  p_status public.payment_status,
  p_provider_reference text,
  p_transaction_reference text default null,
  p_verified_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  return private.verify_payment(
    p_order_id,
    p_status,
    p_provider_reference,
    p_transaction_reference,
    p_verified_at
  );
end;
$$;

revoke all on function public.server_verify_payment(uuid, public.payment_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.server_verify_payment(uuid, public.payment_status, text, text, timestamptz) to service_role;
