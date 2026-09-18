-- Warkost Bahagia
-- V1 Delivery / Migration 006
-- Hardening: concurrency-safe max-five delivery stops and delivery-order channel validation.

create or replace function private.enforce_delivery_trip_max_five()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  lock_key bigint;
begin
  -- Serialize stop changes for the same trip so concurrent assignments
  -- cannot create a sixth active stop.
  lock_key := hashtextextended(new.trip_id::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  if new.status in ('pending','active') then
    select count(*)
      into active_count
      from public.delivery_stops
     where trip_id = new.trip_id
       and status in ('pending','active')
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if active_count >= 5 then
      raise exception 'A delivery trip may have at most 5 active stops';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_delivery_trip_max_five() from public;

create or replace function private.validate_delivery_order_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel public.order_channel;
begin
  select o.channel into channel
  from public.orders o
  where o.id = new.order_id;

  if channel is null then
    raise exception 'Delivery order references a missing order';
  end if;

  if channel <> 'delivery' then
    raise exception 'delivery_orders may only reference delivery orders';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_delivery_order_channel() from public;

create trigger delivery_orders_channel_validation
before insert or update of order_id on public.delivery_orders
for each row execute procedure private.validate_delivery_order_channel();

comment on function private.enforce_delivery_trip_max_five() is 'Concurrency-safe database guard: max 5 active delivery stops per trip.';
comment on function private.validate_delivery_order_channel() is 'Ensures delivery_orders only reference orders using the delivery channel.';
