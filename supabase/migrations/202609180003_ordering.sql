-- Warkost Bahagia
-- V1 Ordering / Migration 003
-- Scope: orders, order items, payments, ownership RLS.
-- Business rules for creation/payment verification remain server-side.

create type public.order_channel as enum (
  'delivery',
  'dine_in',
  'walk_in'
);

create type public.order_status as enum (
  'payment_pending',
  'paid',
  'in_fulfillment',
  'ready_for_pickup',
  'out_for_delivery',
  'completed',
  'cancelled',
  'expired'
);

create type public.payment_status as enum (
  'pending',
  'paid',
  'failed',
  'expired'
);

create type public.payment_method as enum (
  'qris',
  'cash',
  'debit',
  'payment_gateway'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  channel public.order_channel not null default 'delivery',
  order_status public.order_status not null default 'payment_pending',
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  delivery_address text,
  delivery_latitude numeric(10,7),
  delivery_longitude numeric(10,7),
  delivery_distance_km numeric(8,2),
  estimated_delivery_minutes integer,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint orders_subtotal_nonnegative check (subtotal >= 0),
  constraint orders_discount_nonnegative check (discount_total >= 0),
  constraint orders_delivery_fee_nonnegative check (delivery_fee >= 0),
  constraint orders_total_nonnegative check (total_amount >= 0),
  constraint orders_delivery_distance_nonnegative check (delivery_distance_km is null or delivery_distance_km >= 0),
  constraint orders_eta_positive check (estimated_delivery_minutes is null or estimated_delivery_minutes > 0),
  constraint orders_delivery_coordinates_pair check (
    (delivery_latitude is null and delivery_longitude is null)
    or (delivery_latitude is not null and delivery_longitude is not null)
  ),
  constraint orders_delivery_latitude_range check (
    delivery_latitude is null or delivery_latitude between -90 and 90
  ),
  constraint orders_delivery_longitude_range check (
    delivery_longitude is null or delivery_longitude between -180 and 180
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  station public.station_type not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  normal_price numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  final_unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint order_items_normal_price_nonnegative check (normal_price >= 0),
  constraint order_items_discount_nonnegative check (discount_amount >= 0),
  constraint order_items_final_price_nonnegative check (final_unit_price >= 0),
  constraint order_items_subtotal_nonnegative check (subtotal >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null,
  method public.payment_method not null,
  amount numeric(12,2) not null,
  status public.payment_status not null default 'pending',
  provider_reference text unique,
  transaction_reference text unique,
  paid_at timestamptz,
  expired_at timestamptz,
  verified_at timestamptz,
  raw_reference text,
  created_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0)
);

create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index orders_status_created_idx on public.orders(order_status, created_at);
create index orders_channel_created_idx on public.orders(channel, created_at);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_station_idx on public.order_items(station);
create index payments_status_idx on public.payments(status);
create index payments_provider_reference_idx on public.payments(provider_reference);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- Orders: customers see only their own orders. Staff read operational orders.
create policy "orders_customer_select_own"
on public.orders
for select
to authenticated
using (
  (select auth.uid()) = customer_id
);

create policy "orders_staff_select"
on public.orders
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner','kasir','kitchen','driver')
);

-- Customers do not write orders directly. Creation goes through server-side business logic.
-- Payment writes are server-controlled to prevent client-side PAID manipulation.

create policy "order_items_customer_select_own"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.customer_id = (select auth.uid())
  )
);

create policy "order_items_staff_select_all"
on public.order_items
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner','kasir','driver')
);

create policy "order_items_kitchen_select_food"
on public.order_items
for select
to authenticated
using (
  (select private.current_user_role()) = 'kitchen'
  and station = 'kitchen'
);

create policy "payments_customer_select_own"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = payments.order_id
      and o.customer_id = (select auth.uid())
  )
);

create policy "payments_staff_select"
on public.payments
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner','kasir')
);

grant select on public.orders, public.order_items, public.payments to authenticated;
grant all on public.orders, public.order_items, public.payments to service_role;

comment on table public.orders is 'One customer order; one payment; central order header across delivery, dine-in and walk-in.';
comment on table public.order_items is 'Immutable order snapshot of product name, station and prices at order time.';
comment on table public.payments is 'Server-controlled payment record. PAID requires provider verification/callback or controlled server verification.';
comment on column public.orders.customer_id is 'Customer ownership; delivery destination belongs to this order, not the customer profile.';
comment on column public.order_items.station is 'Routing snapshot: kitchen for food, bar for drinks.';
comment on column public.payments.provider_reference is 'External provider reference used for idempotent payment processing.';
