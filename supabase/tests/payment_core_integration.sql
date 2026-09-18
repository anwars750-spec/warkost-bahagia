-- Payment Core integration test
-- Intentionally runs inside a transaction and rolls back all fixtures.
-- Expected chain:
-- webhook event -> normalized validator -> verify_payment -> stock commit -> fulfillment creation

begin;

do $$
declare
  v_customer uuid := '8fd7dea9-fcb2-4f73-b294-fb70ef2cf47d';
  v_category uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_order uuid;
  v_event_id text := 'evt-integration-' || replace(gen_random_uuid()::text,'-','');
  v_before int;
  v_after int;
  v_fulfillments int;
begin
  insert into public.categories(id,name,station,active)
  values(v_category,'__PAYMENT_TEST__','bar',true);

  insert into public.products(id,category_id,name,normal_price,selling_price,stock,active)
  values(v_product,v_category,'__PAYMENT_TEST__',10000,10000,7,true);

  select stock into v_before from public.products where id=v_product;

  v_order := private.create_delivery_order(
    v_customer,
    'WB-PAYTEST-' || replace(gen_random_uuid()::text,'-',''),
    10000,0,0,10000,
    'Integration test',
    -6.2,106.8,1,15,null,
    jsonb_build_array(jsonb_build_object('product_id',v_product::text,'quantity',1)),
    'btn','qris',now()+interval '30 minutes'
  );

  insert into public.payment_webhook_events(
    id,provider,event_id,event_type,provider_reference,
    transaction_reference,order_reference,payment_status,
    amount,currency,event_time,processing_status,raw_payload
  )
  select gen_random_uuid(),'btn',v_event_id,'payment.success',
         'BTN-REF-TEST','BTN-TXN-TEST',order_number,'paid',
         10000,'IDR',now(),'received','{}'::jsonb
  from public.orders
  where id=v_order;

  if (private.validate_payment_webhook_event(v_event_id,'btn')->>'status') <> 'processed' then
    raise exception 'validator failed';
  end if;

  perform private.verify_payment(v_order,'paid','BTN-REF-TEST','BTN-TXN-TEST',now());

  select stock into v_after from public.products where id=v_product;
  select count(*) into v_fulfillments from public.fulfillments where order_id=v_order;

  if not exists(select 1 from public.payments where order_id=v_order and status='paid') then
    raise exception 'payment not paid';
  end if;

  if v_after <> v_before-1 then
    raise exception 'stock commit failed';
  end if;

  if v_fulfillments <> 1 then
    raise exception 'fulfillment creation failed';
  end if;
end $$;

rollback;
