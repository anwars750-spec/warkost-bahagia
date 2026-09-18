alter table public.payments add column if not exists currency text not null default 'IDR';

create or replace function private.validate_payment_webhook_event(p_event_id text, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event public.payment_webhook_events%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  select * into v_event from public.payment_webhook_events
  where provider=p_provider and event_id=p_event_id for update;
  if not found then raise exception 'Webhook event not found'; end if;

  if v_event.processing_status in ('processed','duplicate','rejected') then
    return jsonb_build_object('ok',true,'status',v_event.processing_status,'event_id',v_event.event_id);
  end if;

  if v_event.order_reference is null or v_event.payment_status is null
     or v_event.amount is null or v_event.currency is null
     or v_event.provider_reference is null then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Missing normalized payment fields'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Missing normalized payment fields');
  end if;

  select * into v_order from public.orders
  where order_number=v_event.order_reference for update;
  if not found then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Order reference not found'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Order reference not found');
  end if;

  select * into v_payment from public.payments
  where order_id=v_order.id for update;
  if not found then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Payment not found'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Payment not found');
  end if;

  if lower(v_payment.provider) <> lower(v_event.provider) then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Payment provider mismatch'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Payment provider mismatch');
  end if;

  if v_event.amount <> v_payment.amount then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Payment amount mismatch'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Payment amount mismatch');
  end if;

  if upper(v_event.currency) <> upper(v_payment.currency) then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Payment currency mismatch'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Payment currency mismatch');
  end if;

  if v_payment.provider_reference is not null
     and v_event.provider_reference <> v_payment.provider_reference then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Provider reference mismatch'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Provider reference mismatch');
  end if;

  if v_event.payment_status='paid'
     and v_payment.status in ('failed','expired') then
    update public.payment_webhook_events
      set processing_status='rejected', rejection_reason='Illegal payment state transition'
      where id=v_event.id;
    return jsonb_build_object('ok',false,'status','rejected','reason','Illegal payment state transition');
  end if;

  update public.payment_webhook_events
    set processing_status='processed', processed_at=now()
    where id=v_event.id;

  return jsonb_build_object(
    'ok',true,'status','processed','event_id',v_event.event_id,
    'order_id',v_order.id,'payment_id',v_payment.id,
    'payment_status',v_event.payment_status
  );
end;
$$;

revoke all on function private.validate_payment_webhook_event(text,text) from public, anon, authenticated;
grant execute on function private.validate_payment_webhook_event(text,text) to service_role;
