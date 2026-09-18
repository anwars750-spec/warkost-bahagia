-- Warkost Bahagia
-- V1 Delivery / Migration 005
-- Scope: drivers, delivery orders, trips and stops.
-- Server-side dispatch will own assignment; DB enforces core integrity.

create type public.driver_status as enum (
  'offline',
  'online',
  'busy',
  'inactive'
);

create type public.trip_status as enum (
  'planned',
  'active',
  'completed',
  'cancelled'
);

create type public.delivery_status as enum (
  'waiting_assignment',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed'
);

create type public.stop_status as enum (
  'pending',
  'active',
  'delivered',
  'failed',
  'skipped'
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  status public.driver_status not null default 'offline',
  active_trip_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_name_not_blank check (length(btrim(name)) > 0)
);

create table public.delivery_trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  status public.trip_status not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers
  add constraint drivers_active_trip_fk
  foreign key (active_trip_id) references public.delivery_trips(id) on delete set null;

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  address text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  distance_km numeric(8,2),
  delivery_fee numeric(12,2) not null default 0,
  estimated_minutes integer,
  status public.delivery_status not null default 'waiting_assignment',
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_photo text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_orders_address_not_blank check (length(btrim(address)) > 0),
  constraint delivery_orders_latitude_range check (latitude between -90 and 90),
  constraint delivery_orders_longitude_range check (longitude between -180 and 180),
  constraint delivery_orders_distance_nonnegative check (distance_km is null or distance_km >= 0),
  constraint delivery_orders_fee_nonnegative check (delivery_fee >= 0),
  constraint delivery_orders_eta_positive check (estimated_minutes is null or estimated_minutes > 0)
);

create table public.delivery_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.delivery_trips(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  sequence integer not null,
  status public.stop_status not null default 'pending',
  assigned_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_stops_sequence_positive check (sequence > 0),
  constraint delivery_stops_trip_sequence_unique unique (trip_id, sequence)
);

create index drivers_status_idx on public.drivers(status);
create index delivery_trips_driver_status_idx on public.delivery_trips(driver_id, status);
create index delivery_orders_status_idx on public.delivery_orders(status, created_at);
create index delivery_orders_driver_status_idx on public.delivery_orders(driver_id, status);
create index delivery_stops_trip_status_idx on public.delivery_stops(trip_id, status);
create index delivery_stops_order_idx on public.delivery_stops(order_id);

-- At most five non-terminal stops per trip.
create or replace function private.enforce_delivery_trip_max_five()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
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

create trigger delivery_stops_max_five
before insert or update of trip_id, status on public.delivery_stops
for each row execute procedure private.enforce_delivery_trip_max_five();

alter table public.drivers enable row level security;
alter table public.delivery_trips enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_stops enable row level security;

-- Admin/Owner monitor delivery operations.
create policy "drivers_admin_owner_select"
on public.drivers for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "drivers_driver_select_own"
on public.drivers for select to authenticated
using (user_id = (select auth.uid()));

create policy "delivery_trips_admin_owner_select"
on public.delivery_trips for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "delivery_trips_driver_select_own"
on public.delivery_trips for select to authenticated
using (
  exists (
    select 1 from public.drivers d
    where d.id = delivery_trips.driver_id
      and d.user_id = (select auth.uid())
  )
);

create policy "delivery_orders_admin_owner_select"
on public.delivery_orders for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "delivery_orders_customer_select_own"
on public.delivery_orders for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = delivery_orders.order_id
      and o.customer_id = (select auth.uid())
  )
);

create policy "delivery_orders_driver_select_assigned"
on public.delivery_orders for select to authenticated
using (
  exists (
    select 1
    from public.drivers d
    where d.id = delivery_orders.driver_id
      and d.user_id = (select auth.uid())
  )
);

create policy "delivery_stops_admin_owner_select"
on public.delivery_stops for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "delivery_stops_driver_select_own"
on public.delivery_stops for select to authenticated
using (
  exists (
    select 1
    from public.delivery_trips t
    join public.drivers d on d.id = t.driver_id
    where t.id = delivery_stops.trip_id
      and d.user_id = (select auth.uid())
  )
);

-- Operational writes are server-controlled. Drivers will later use
-- controlled RPC/server actions for online state, delivery status and proof.
grant select on public.drivers, public.delivery_trips, public.delivery_orders, public.delivery_stops to authenticated;
grant all on public.drivers, public.delivery_trips, public.delivery_orders, public.delivery_stops to service_role;

comment on table public.drivers is 'Driver operational identity and online/offline state.';
comment on table public.delivery_orders is 'Per-order delivery destination and delivery lifecycle snapshot.';
comment on table public.delivery_trips is 'A driver route/trip containing up to five active delivery stops.';
comment on table public.delivery_stops is 'Ordered stops in a driver trip; database enforces maximum five active stops.';
comment on column public.delivery_orders.proof_photo is 'Reference/path to delivery proof photo stored outside the relational table.';
