-- Test-only helper for database idempotency verification.
-- Production webhook code must not depend on this helper.
create or replace function private.test_payment_event_idempotency(p_provider text, p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_first uuid; v_second uuid; v_count integer;
begin
  insert into public.payment_webhook_events(provider,event_id,processing_status)
  values(p_provider,p_event_id,'received')
  on conflict (provider,event_id) do nothing
  returning id into v_first;

  insert into public.payment_webhook_events(provider,event_id,processing_status)
  values(p_provider,p_event_id,'received')
  on conflict (provider,event_id) do nothing
  returning id into v_second;

  select count(*) into v_count from public.payment_webhook_events
  where provider=p_provider and event_id=p_event_id;

  delete from public.payment_webhook_events where provider=p_provider and event_id=p_event_id;

  return jsonb_build_object('first_inserted',v_first is not null,'second_inserted',v_second is not null,'row_count',v_count,'idempotent',(v_first is not null and v_second is null and v_count=1));
end;
$$;

revoke all on function private.test_payment_event_idempotency(text,text) from public, anon, authenticated;
grant execute on function private.test_payment_event_idempotency(text,text) to service_role;
