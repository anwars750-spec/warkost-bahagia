-- V1 hardening: driver dispatch authorization
-- Only an active ADMIN may perform a delivery assignment.
-- Driver availability, pickup readiness, duplicate assignment, and max-5
-- active-stop rules remain enforced inside the transaction.

create or replace function private.assign_delivery(
  p_delivery_order_id uuid,
  p_driver_id uuid,
  p_sequence integer,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_do public.delivery_orders%rowtype;
  v_driver public.drivers%rowtype;
  v_actor public.profiles%rowtype;
  v_trip_id uuid;
  v_count integer;
  v_stop_id uuid;
begin
  select * into v_actor
  from public.profiles
  where id=p_actor_id and active=true
  for share;

  if not found or v_actor.role <> 'admin' then
    raise exception 'Only an active ADMIN can assign delivery';
  end if;

  select * into v_do
  from public.delivery_orders
  where id=p_delivery_order_id
  for update;

  if not found then raise exception 'Delivery order not found'; end if;

  select * into v_driver
  from public.drivers
  where id=p_driver_id
  for update;

  if not found then raise exception 'Driver not found'; end if;

  if v_driver.status <> 'online' then
    raise exception 'Driver must be ONLINE';
  end if;

  if v_do.status <> 'waiting_assignment' then
    raise exception 'Delivery order is not waiting for assignment';
  end if;

  if p_sequence is null or p_sequence <= 0 then
    raise exception 'Invalid stop sequence';
  end if;

  if not exists (
    select 1 from public.orders
    where id=v_do.order_id
      and order_status='ready_for_pickup'
  ) then
    raise exception 'Order is not ready for pickup';
  end if;

  if exists (
    select 1 from public.delivery_stops
    where order_id=v_do.order_id
  ) then
    raise exception 'Order is already assigned to a delivery stop';
  end if;

  select id into v_trip_id
  from public.delivery_trips
  where driver_id=p_driver_id
    and status='active'
  order by created_at desc
  limit 1
  for update;

  if v_trip_id is null then
    insert into public.delivery_trips(driver_id,status,started_at)
    values(p_driver_id,'active',now())
    returning id into v_trip_id;

    update public.drivers
    set active_trip_id=v_trip_id,
        status='busy',
        updated_at=now()
    where id=p_driver_id;
  else
    select count(*) into v_count
    from public.delivery_stops
    where trip_id=v_trip_id
      and status in ('pending','active');

    if v_count >= 5 then
      raise exception 'Driver trip is full: maximum 5 active stops';
    end if;

    update public.drivers
    set status='busy',
        updated_at=now()
    where id=p_driver_id;
  end if;

  insert into public.delivery_stops(
    trip_id,order_id,sequence,status,assigned_at
  )
  values(
    v_trip_id,v_do.order_id,p_sequence,'pending',now()
  )
  returning id into v_stop_id;

  update public.delivery_orders
  set driver_id=p_driver_id,
      status='assigned',
      assigned_at=now(),
      updated_at=now()
  where id=v_do.id;

  perform private.notify_order_role_users(
    v_do.order_id,
    array['admin']::public.app_role[],
    'driver_assigned',
    'Driver ditugaskan',
    'Order sudah ditugaskan ke driver.'
  );

  if exists(
    select 1 from public.orders
    where id=v_do.order_id and customer_id is not null
  ) then
    insert into public.notifications(
      user_id,order_id,type,title,message
    )
    select
      customer_id,
      v_do.order_id,
      'driver_assigned',
      'Driver ditugaskan',
      'Driver sudah ditugaskan untuk mengantarkan pesanan Anda.'
    from public.orders
    where id=v_do.order_id and customer_id is not null;
  end if;

  return v_stop_id;
end;
$function$;

-- Keep dispatch server-side. Client roles must not invoke this function directly.
revoke all on function private.assign_delivery(uuid,uuid,integer) from public;
revoke all on function private.assign_delivery(uuid,uuid,integer) from authenticated;
revoke all on function private.assign_delivery(uuid,uuid,integer,uuid) from public;
revoke all on function private.assign_delivery(uuid,uuid,integer,uuid) from authenticated;
