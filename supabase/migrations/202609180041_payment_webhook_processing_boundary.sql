-- Payment webhook processing boundary V1
-- Normalized events are validated first, then payment state is changed only by verify_payment.
create or replace function private.process_payment_webhook_event(
  p_provider text,
  p_event_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_validation jsonb;
  v_event public.payment_webhook_events%rowtype;
  v_order_id uuid;
  v_ok boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  v_validation := private.validate_payment_webhook_event(p_event_id, p_provider);
  if coalesce((v_validation->>'status'),'') <> 'processed' then return v_validation; end if;
  select * into v_event from public.payment_webhook_events where provider=p_provider and event_id=p_event_id for update;
  select id into v_order_id from public.orders where order_number=v_event.order_reference;
  v_ok := private.verify_payment(v_order_id,v_event.payment_status,v_event.provider_reference,v_event.transaction_reference,v_event.event_time);
  return jsonb_build_object('ok',v_ok,'status','processed','event_id',p_event_id,'payment_status',v_event.payment_status,'order_id',v_order_id);
end;
$$;

create or replace function public.server_process_payment_webhook_event(p_provider text,p_event_id text) returns jsonb
language sql security definer set search_path=public,pg_temp
as $$ select private.process_payment_webhook_event(p_provider,p_event_id); $$;
revoke all on function public.server_process_payment_webhook_event(text,text) from public,anon,authenticated;
grant execute on function public.server_process_payment_webhook_event(text,text) to service_role;
