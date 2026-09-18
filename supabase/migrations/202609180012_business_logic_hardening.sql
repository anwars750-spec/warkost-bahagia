-- Warkost Bahagia V1 Business Logic hardening
-- Migration 012: connect payment -> fulfillment -> delivery -> sales/loyalty,
-- enforce dispatch readiness, and create operational notifications.

create or replace function private.notify_order_role_users(
  p_order_id uuid,
  p_roles public.app_role[],
  p_type public.notification_type,
  p_title text,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_role public.app_role;
begin
  foreach v_role in array p_roles loop
    insert into public.notifications(user_id, order_id, type, title, message)
    select id, p_order_id, p_type, p_title, p_message
    from public.profiles
    where role = v_role and is_active = true
    on conflict do nothing;
    get diagnostics v_count = v_count + row_count;
  end loop;
  return v_count;
end;
$$;

-- Create delivery record only when an order becomes ready for pickup.
create or replace function private.ensure_delivery_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.channel <> 'delivery' then return null; end if;
  if v_order.order_status <> 'ready_for_pickup' then
    raise exception 'Order is not ready for delivery dispatch';
  end if;

  select id into v_id from public.delivery_orders where order_id=p_order_id for update;
  if v_id is not null then return v_id; end if;

  insert into public.delivery_orders(
    order_id,address,latitude,longitude,distance_km,delivery_fee,
    estimated_minutes,status
  )
  values (
    v_order.id,v_order.delivery_address,v_order.delivery_latitude,
    v_order.delivery_longitude,v_order.delivery_distance_km,v_order.delivery_fee,
    v_order.estimated_delivery_minutes,'waiting_assignment'
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Automatic loyalty earning is driven by an active business rule.
-- If no rule is active, completion remains valid but no points are issued.
create or replace function private.earn_loyalty_for_completed_order(p_order_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_rule public.loyalty_rules%rowtype;
  v_eligible numeric;
  v_points bigint;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status <> 'completed' or v_order.customer_id is null then return 0; end if;

  select * into v_rule
  from public.loyalty_rules
  where active = true
    and (earn_after_order_status is null or earn_after_order_status = 'completed')
    and (earn_on_channels is null or v_order.channel = any(earn_on_channels))
  order by updated_at desc
  limit 1;

  if not found or v_rule.currency_unit <= 0 or v_rule.points_per_currency_unit <= 0 then
    return 0;
  end if;

  v_eligible := greatest(0, v_order.total_amount - coalesce(v_order.delivery_fee,0));
  if v_eligible < coalesce(v_rule.minimum_eligible_amount,0) then return 0; end if;

  v_points := floor((v_eligible / v_rule.currency_unit) * v_rule.points_per_currency_unit)::bigint;
  if v_points <= 0 then return 0; end if;

  perform private.earn_loyalty(
    p_order_id,
    v_points,
    'Earn otomatis setelah order completed'
  );

  return v_points;
end;
$$;

-- Payment verification now continues the workflow for paid orders.
create or replace function private.verify_payment(
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
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_payment
  from public.payments where order_id=p_order_id for update;
  if not found then raise exception 'Payment not found'; end if;

  if p_status = 'paid' then
    if p_provider_reference is null or length(btrim(p_provider_reference))=0 then
      raise exception 'Provider reference is required for paid status';
    end if;

    if v_payment.status='paid' then return true; end if;

    update public.payments
       set status='paid',
           provider_reference=p_provider_reference,
           transaction_reference=p_transaction_reference,
           paid_at=coalesce(p_verified_at,now()),
           verified_at=coalesce(p_verified_at,now())
     where id=v_payment.id;

    update public.orders
       set order_status='paid'
     where id=p_order_id and order_status='payment_pending';

    perform private.commit_stock(p_order_id);
    perform private.create_fulfillments_for_paid_order(p_order_id);

    select * into v_order from public.orders where id=p_order_id;

    if v_order.customer_id is not null then
      perform private.create_notification(
        v_order.customer_id,p_order_id,'payment_verified',
        'Pembayaran terverifikasi',
        'Pembayaran order '||v_order.order_number||' berhasil diverifikasi.'
      );
    end if;

    perform private.notify_order_role_users(
      p_order_id,
      array['admin','kasir','kitchen']::public.app_role[],
      'order_created',
      'Order baru',
      'Order '||v_order.order_number||' sudah dibayar dan masuk proses operasional.'
    );
    return true;

  elsif p_status in ('failed','expired') then
    if v_payment.status in ('failed','expired') then return true; end if;

    update public.payments
       set status=p_status,
           provider_reference=coalesce(p_provider_reference,provider_reference),
           transaction_reference=coalesce(p_transaction_reference,transaction_reference),
           expired_at=case when p_status='expired' then coalesce(p_verified_at,now()) else expired_at end,
           verified_at=coalesce(p_verified_at,now())
     where id=v_payment.id;

    update public.orders
       set order_status=case when p_status='expired' then 'expired' else 'cancelled' end,
           cancelled_at=case when p_status='failed' then now() else cancelled_at end
     where id=p_order_id and order_status in ('payment_pending','paid');

    perform private.release_stock(
      p_order_id,
      case when p_status='expired' then 'expired' else 'released' end
    );

    select * into v_order from public.orders where id=p_order_id;
    if v_order.customer_id is not null then
      perform private.create_notification(
        v_order.customer_id,p_order_id,'payment_failed',
        case when p_status='expired' then 'Pembayaran kedaluwarsa' else 'Pembayaran gagal' end,
        'Pembayaran order '||v_order.order_number||' tidak berhasil.'
      );
    end if;
    return true;
  else
    raise exception 'Unsupported payment status for verification';
  end if;
end;
$$;

-- Fulfillment completion now creates the delivery queue when all stations are ready.
create or replace function private.transition_fulfillment(
  p_fulfillment_id uuid,
  p_next_status public.fulfillment_station_status,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.fulfillments%rowtype;
  v_role public.app_role;
  v_all_ready boolean;
  v_order public.orders%rowtype;
begin
  select * into v from public.fulfillments where id=p_fulfillment_id for update;
  if not found then raise exception 'Fulfillment not found'; end if;

  select role into v_role from public.profiles where id=p_actor_id and is_active=true;
  if v_role is null then raise exception 'Actor is not active'; end if;

  if v.station='kitchen' and v_role not in ('kitchen','admin') then
    raise exception 'Only Kitchen/Admin can operate kitchen fulfillment';
  end if;
  if v.station='bar' and v_role not in ('kasir','admin') then
    raise exception 'Only Kasir/Admin can operate bar fulfillment';
  end if;

  if not (
    (v.status='new' and p_next_status='processing')
    or (v.status='processing' and p_next_status='ready')
    or (v.status='ready' and p_next_status='completed')
    or (v.status in ('new','processing') and p_next_status='cancelled')
  ) then
    raise exception 'Invalid fulfillment transition: % -> %',v.status,p_next_status;
  end if;

  update public.fulfillments
     set status=p_next_status,
         started_at=case when p_next_status='processing' then coalesce(started_at,now()) else started_at end,
         ready_at=case when p_next_status='ready' then now() else ready_at end,
         completed_at=case when p_next_status='completed' then now() else completed_at end,
         completed_by=case when p_next_status in ('ready','completed') then p_actor_id else completed_by end,
         updated_at=now()
   where id=v.id;

  update public.fulfillment_items
     set status=p_next_status,updated_at=now()
   where fulfillment_id=v.id and status<>'completed';

  select not exists (
    select 1 from public.fulfillments
    where order_id=v.order_id and status not in ('ready','completed')
  ) and not exists (
    select 1 from public.fulfillments
    where order_id=v.order_id and status='cancelled'
  ) into v_all_ready;

  if v_all_ready then
    update public.orders set order_status='ready_for_pickup'
    where id=v.order_id and order_status='in_fulfillment';

    select * into v_order from public.orders where id=v.order_id;
    perform private.ensure_delivery_order(v.order_id);
    perform private.notify_order_role_users(
      v.order_id,
      array['driver']::public.app_role[],
      'fulfillment_ready',
      'Pesanan siap diantar',
      'Order '||v_order.order_number||' sudah READY dan menunggu penugasan driver.'
    );
  end if;

  return true;
end;
$$;

-- Dispatch only ready-for-pickup delivery orders.
create or replace function private.assign_delivery(
  p_delivery_order_id uuid,
  p_driver_id uuid,
  p_sequence integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_do public.delivery_orders%rowtype;
  v_driver public.drivers%rowtype;
  v_trip_id uuid;
  v_count integer;
  v_stop_id uuid;
begin
  select * into v_do from public.delivery_orders where id=p_delivery_order_id for update;
  if not found then raise exception 'Delivery order not found'; end if;

  select * into v_driver from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'Driver not found'; end if;

  if v_driver.status <> 'online' then raise exception 'Driver must be ONLINE'; end if;
  if v_do.status <> 'waiting_assignment' then raise exception 'Delivery order is not waiting for assignment'; end if;
  if p_sequence is null or p_sequence <= 0 then raise exception 'Invalid stop sequence'; end if;

  if not exists (
    select 1 from public.orders
    where id=v_do.order_id and order_status='ready_for_pickup'
  ) then
    raise exception 'Order is not ready for pickup';
  end if;

  select id into v_trip_id
  from public.delivery_trips
  where driver_id=p_driver_id and status='active'
  order by created_at desc limit 1 for update;

  if v_trip_id is null then
    insert into public.delivery_trips(driver_id,status,started_at)
    values(p_driver_id,'active',now())
    returning id into v_trip_id;

    update public.drivers set active_trip_id=v_trip_id,status='busy',updated_at=now()
    where id=p_driver_id;
  else
    select count(*) into v_count
    from public.delivery_stops
    where trip_id=v_trip_id and status in ('pending','active');
    if v_count >= 5 then raise exception 'Driver trip is full: maximum 5 active stops'; end if;
    update public.drivers set status='busy',updated_at=now() where id=p_driver_id;
  end if;

  if exists(select 1 from public.delivery_stops where order_id=v_do.order_id) then
    raise exception 'Order is already assigned to a delivery stop';
  end if;

  insert into public.delivery_stops(trip_id,order_id,sequence,status,assigned_at)
  values(v_trip_id,v_do.order_id,p_sequence,'pending',now())
  returning id into v_stop_id;

  update public.delivery_orders
     set driver_id=p_driver_id,status='assigned',assigned_at=now(),updated_at=now()
   where id=v_do.id;

  perform private.notify_order_role_users(
    v_do.order_id,
    array['admin']::public.app_role[],
    'driver_assigned',
    'Driver ditugaskan',
    'Order sudah ditugaskan ke driver.'
  );

  if exists(select 1 from public.orders where id=v_do.order_id and customer_id is not null) then
    insert into public.notifications(user_id,order_id,type,title,message)
    select customer_id,v_do.order_id,'driver_assigned','Driver ditugaskan',
           'Driver sudah ditugaskan untuk mengantarkan pesanan Anda.'
    from public.orders where id=v_do.order_id and customer_id is not null;
  end if;

  return v_stop_id;
end;
$$;

-- Completion keeps Sales idempotent and now attempts loyalty using configured rules.
create or replace function private.complete_delivery(
  p_delivery_order_id uuid,
  p_proof_photo text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_do public.delivery_orders%rowtype;
  v_trip_id uuid;
  v_remaining integer;
begin
  if p_proof_photo is null or length(btrim(p_proof_photo))=0 then
    raise exception 'Proof photo is required';
  end if;

  select * into v_do from public.delivery_orders where id=p_delivery_order_id for update;
  if not found then raise exception 'Delivery order not found'; end if;
  if v_do.status not in ('picked_up','out_for_delivery') then
    raise exception 'Delivery order is not ready to complete';
  end if;

  update public.delivery_orders
     set status='delivered',delivered_at=now(),proof_photo=p_proof_photo,
         notes=p_notes,updated_at=now()
   where id=v_do.id;

  update public.delivery_stops
     set status='delivered',delivered_at=now(),updated_at=now()
   where order_id=v_do.order_id and status in ('pending','active');

  update public.orders
     set order_status='completed',completed_at=now()
   where id=v_do.order_id;

  perform private.create_sale_from_completed_order(v_do.order_id);
  perform private.earn_loyalty_for_completed_order(v_do.order_id);

  select trip_id into v_trip_id from public.delivery_stops where order_id=v_do.order_id limit 1;

  if v_trip_id is not null then
    select count(*) into v_remaining
    from public.delivery_stops
    where trip_id=v_trip_id and status in ('pending','active');

    if v_remaining=0 then
      update public.delivery_trips set status='completed',completed_at=now(),updated_at=now()
      where id=v_trip_id and status='active';

      update public.drivers set status='online',active_trip_id=null,updated_at=now()
      where id=v_do.driver_id and active_trip_id=v_trip_id;
    end if;
  end if;

  if exists(select 1 from public.orders where id=v_do.order_id and customer_id is not null) then
    insert into public.notifications(user_id,order_id,type,title,message)
    select customer_id,v_do.order_id,'order_completed','Pesanan selesai',
           'Pesanan Anda telah selesai diantar.'
    from public.orders where id=v_do.order_id and customer_id is not null;
  end if;

  return true;
end;
$$;

revoke all on function private.notify_order_role_users(uuid,public.app_role[],public.notification_type,text,text) from public;
revoke all on function private.ensure_delivery_order(uuid) from public;
revoke all on function private.earn_loyalty_for_completed_order(uuid) from public;

comment on function private.ensure_delivery_order(uuid) is 'Creates one delivery queue record only after all required fulfillment streams are ready.';
comment on function private.earn_loyalty_for_completed_order(uuid) is 'Applies the active loyalty rule; no points are issued when owner has not configured an active rule.';
