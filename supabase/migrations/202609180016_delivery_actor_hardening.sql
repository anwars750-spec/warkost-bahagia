-- V1 hardening: bind delivery lifecycle actions to the assigned driver actor.

create or replace function private.mark_delivery_picked_up(
  p_delivery_order_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_do public.delivery_orders%rowtype;
  v_driver public.drivers%rowtype;
begin
  select * into v_do
  from public.delivery_orders
  where id=p_delivery_order_id
  for update;

  if not found then raise exception 'Delivery order not found'; end if;
  if v_do.driver_id is null then raise exception 'Delivery order has no assigned driver'; end if;

  select * into v_driver
  from public.drivers
  where id=v_do.driver_id and user_id=p_actor_id
  for share;

  if not found then raise exception 'Actor is not the assigned driver'; end if;

  if v_do.status <> 'assigned' then
    raise exception 'Delivery order is not assigned';
  end if;

  if exists (
    select 1 from public.fulfillments
    where order_id=v_do.order_id
      and status not in ('ready','completed')
  ) then
    raise exception 'Order is not ready for pickup: all fulfillment stations must be READY';
  end if;

  update public.delivery_orders
  set status='picked_up', picked_up_at=now(), updated_at=now()
  where id=v_do.id;

  update public.delivery_stops
  set status='active', updated_at=now()
  where order_id=v_do.order_id and status='pending';

  update public.orders
  set order_status='out_for_delivery'
  where id=v_do.order_id;

  return true;
end;
$function$;

create or replace function private.complete_delivery(
  p_delivery_order_id uuid,
  p_proof_photo text,
  p_notes text default null,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_do public.delivery_orders%rowtype;
  v_driver public.drivers%rowtype;
  v_trip_id uuid;
  v_remaining integer;
begin
  if p_proof_photo is null or length(btrim(p_proof_photo))=0 then
    raise exception 'Proof photo is required';
  end if;

  select * into v_do
  from public.delivery_orders
  where id=p_delivery_order_id
  for update;

  if not found then raise exception 'Delivery order not found'; end if;
  if v_do.driver_id is null then raise exception 'Delivery order has no assigned driver'; end if;

  select * into v_driver
  from public.drivers
  where id=v_do.driver_id and user_id=p_actor_id
  for share;

  if not found then raise exception 'Actor is not the assigned driver'; end if;

  if v_do.status not in ('picked_up','out_for_delivery') then
    raise exception 'Delivery order is not ready to complete';
  end if;

  update public.delivery_orders
  set status='delivered',
      delivered_at=now(),
      proof_photo=p_proof_photo,
      notes=p_notes,
      updated_at=now()
  where id=v_do.id;

  update public.delivery_stops
  set status='delivered', delivered_at=now(), updated_at=now()
  where order_id=v_do.order_id and status in ('pending','active');

  update public.orders
  set order_status='completed', completed_at=now()
  where id=v_do.order_id;

  perform private.create_sale_from_completed_order(v_do.order_id);
  perform private.earn_loyalty_for_completed_order(v_do.order_id);

  select trip_id into v_trip_id
  from public.delivery_stops
  where order_id=v_do.order_id
  limit 1;

  if v_trip_id is not null then
    select count(*) into v_remaining
    from public.delivery_stops
    where trip_id=v_trip_id and status in ('pending','active');

    if v_remaining=0 then
      update public.delivery_trips
      set status='completed', completed_at=now(), updated_at=now()
      where id=v_trip_id and status='active';

      update public.drivers
      set status='online', active_trip_id=null, updated_at=now()
      where id=v_do.driver_id and active_trip_id=v_trip_id;
    end if;
  end if;

  if exists(select 1 from public.orders where id=v_do.order_id and customer_id is not null) then
    insert into public.notifications(user_id,order_id,type,title,message)
    select customer_id,v_do.order_id,'order_completed','Pesanan selesai',
           'Pesanan Anda telah selesai diantar.'
    from public.orders
    where id=v_do.order_id and customer_id is not null;
  end if;

  return true;
end;
$function$;

revoke all on function private.mark_delivery_picked_up(uuid) from public;
revoke all on function private.mark_delivery_picked_up(uuid) from authenticated;
revoke all on function private.mark_delivery_picked_up(uuid,uuid) from public;
revoke all on function private.mark_delivery_picked_up(uuid,uuid) from authenticated;
revoke all on function private.complete_delivery(uuid,text,text) from public;
revoke all on function private.complete_delivery(uuid,text,text) from authenticated;
revoke all on function private.complete_delivery(uuid,text,text,uuid) from public;
revoke all on function private.complete_delivery(uuid,text,text,uuid) from authenticated;
