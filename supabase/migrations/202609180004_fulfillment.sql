-- Warkost Bahagia
-- V1 Fulfillment / Migration 004
-- Scope: station fulfillment for FOOD -> KITCHEN and DRINK -> BAR.
-- Status changes will be performed by controlled server-side business logic.

create type public.fulfillment_station_status as enum (
  'waiting',
  'new',
  'processing',
  'ready',
  'completed',
  'cancelled'
);

create table public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  station public.station_type not null,
  status public.fulfillment_station_status not null default 'waiting',
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fulfillments_order_station_unique unique (order_id, station)
);

create table public.fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  quantity integer not null,
  status public.fulfillment_station_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fulfillment_items_quantity_positive check (quantity > 0),
  constraint fulfillment_items_unique unique (fulfillment_id, order_item_id)
);

create index fulfillments_order_idx on public.fulfillments(order_id);
create index fulfillments_station_status_idx on public.fulfillments(station, status, created_at);
create index fulfillment_items_fulfillment_idx on public.fulfillment_items(fulfillment_id);
create index fulfillment_items_order_item_idx on public.fulfillment_items(order_item_id);

alter table public.fulfillments enable row level security;
alter table public.fulfillment_items enable row level security;

-- Admin/Owner can monitor all fulfillment.
create policy "fulfillments_admin_owner_select"
on public.fulfillments
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner')
);

-- Kitchen sees only kitchen fulfillment.
create policy "fulfillments_kitchen_select"
on public.fulfillments
for select
to authenticated
using (
  station = 'kitchen'
  and (select private.current_user_role()) = 'kitchen'
);

-- Kasir sees only bar fulfillment.
create policy "fulfillments_kasir_select"
on public.fulfillments
for select
to authenticated
using (
  station = 'bar'
  and (select private.current_user_role()) = 'kasir'
);

create policy "fulfillment_items_admin_owner_select"
on public.fulfillment_items
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner')
);

create policy "fulfillment_items_kitchen_select"
on public.fulfillment_items
for select
to authenticated
using (
  (select private.current_user_role()) = 'kitchen'
  and exists (
    select 1
    from public.fulfillments f
    where f.id = fulfillment_items.fulfillment_id
      and f.station = 'kitchen'
  )
);

create policy "fulfillment_items_kasir_select"
on public.fulfillment_items
for select
to authenticated
using (
  (select private.current_user_role()) = 'kasir'
  and exists (
    select 1
    from public.fulfillments f
    where f.id = fulfillment_items.fulfillment_id
      and f.station = 'bar'
  )
);

-- No direct INSERT/UPDATE/DELETE for operational roles.
-- Fulfillment creation and status transitions remain server-controlled.
grant select on public.fulfillments, public.fulfillment_items to authenticated;
grant all on public.fulfillments, public.fulfillment_items to service_role;

comment on table public.fulfillments is 'One fulfillment stream per order and station. FOOD uses kitchen; DRINK uses bar.';
comment on table public.fulfillment_items is 'Order-item quantities assigned to a station fulfillment stream.';
comment on column public.fulfillments.status is 'Station lifecycle: waiting -> new -> processing -> ready -> completed/cancelled.';
