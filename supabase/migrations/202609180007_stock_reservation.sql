-- Warkost Bahagia
-- V1 Stock / Migration 007
-- Scope: atomic stock reservation lifecycle.
-- RESERVED -> COMMITTED after verified payment.
-- RESERVED -> RELEASED/EXPIRED after failed/expired payment.
-- Client roles cannot mutate stock or reservations directly.

create type public.stock_reservation_status as enum (
  'reserved',
  'committed',
  'released',
  'expired'
);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.stock_reservation_status not null default 'reserved',
  expires_at timestamptz,
  reserved_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_reservations_expiry_after_reserve check (
    expires_at is null or expires_at > reserved_at
  )
);

create table public.stock_reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.stock_reservations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint stock_reservation_items_quantity_positive check (quantity > 0),
  constraint stock_reservation_items_unit_price_nonnegative check (unit_price >= 0),
  constraint stock_reservation_items_unique unique (reservation_id, product_id)
);

create index stock_reservations_status_expiry_idx
  on public.stock_reservations(status, expires_at);

create index stock_reservation_items_product_idx
  on public.stock_reservation_items(product_id);

alter table public.stock_reservations enable row level security;
alter table public.stock_reservation_items enable row level security;

create policy "stock_reservations_customer_select_own"
on public.stock_reservations
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = stock_reservations.order_id
      and o.customer_id = (select auth.uid())
  )
);

create policy "stock_reservations_admin_owner_select"
on public.stock_reservations
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner')
);

create policy "stock_reservation_items_customer_select_own"
on public.stock_reservation_items
for select
to authenticated
using (
  exists (
    select 1
    from public.stock_reservations sr
    join public.orders o on o.id = sr.order_id
    where sr.id = stock_reservation_items.reservation_id
      and o.customer_id = (select auth.uid())
  )
);

create policy "stock_reservation_items_admin_owner_select"
on public.stock_reservation_items
for select
to authenticated
using (
  (select private.current_user_role()) in ('admin','owner')
);

grant select on public.stock_reservations, public.stock_reservation_items to authenticated;
grant all on public.stock_reservations, public.stock_reservation_items to service_role;

-- Atomic reservation operation.
-- It locks the requested products, validates aggregate availability,
-- and inserts one reservation + its item rows in a single transaction.
create or replace function private.reserve_stock(
  p_order_id uuid,
  p_items jsonb,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_reservation_id uuid;
  v_product jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_available integer;
  v_unit_price numeric(12,2);
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one stock item is required';
  end if;

  perform 1
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if exists (
    select 1
    from public.stock_reservations
    where order_id = p_order_id
  ) then
    raise exception 'Stock reservation already exists for order';
  end if;

  -- Lock products in deterministic UUID order to reduce deadlock risk.
  for v_product_id in
    select distinct (x->>'product_id')::uuid
    from jsonb_array_elements(p_items) x
    order by 1
  loop
    perform 1
      from public.products
     where id = v_product_id
     for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;
  end loop;

  for v_product in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_product->>'product_id')::uuid;
    v_quantity := (v_product->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    select stock, selling_price
      into v_available, v_unit_price
      from public.products
     where id = v_product_id
     for update;

    if v_available < v_quantity then
      raise exception 'Insufficient stock for product %', v_product_id;
    end if;
  end loop;

  insert into public.stock_reservations(order_id, status, expires_at)
  values (p_order_id, 'reserved', p_expires_at)
  returning id into v_reservation_id;

  for v_product in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_product->>'product_id')::uuid;
    v_quantity := (v_product->>'quantity')::integer;

    select selling_price
      into v_unit_price
      from public.products
     where id = v_product_id;

    update public.products
       set stock = stock - v_quantity,
           updated_at = now()
     where id = v_product_id;

    insert into public.stock_reservation_items(
      reservation_id, product_id, quantity, unit_price
    )
    values (
      v_reservation_id, v_product_id, v_quantity, v_unit_price
    );
  end loop;

  return v_reservation_id;
end;
$$;

-- Commit is idempotent and only accepts a reserved reservation.
create or replace function private.commit_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_reservation public.stock_reservations%rowtype;
begin
  select *
    into v_reservation
    from public.stock_reservations
   where order_id = p_order_id
   for update;

  if not found then
    raise exception 'Stock reservation not found';
  end if;

  if v_reservation.status = 'committed' then
    return true;
  end if;

  if v_reservation.status <> 'reserved' then
    raise exception 'Reservation is not commit-able: %', v_reservation.status;
  end if;

  update public.stock_reservations
     set status = 'committed',
         committed_at = now(),
         updated_at = now()
   where id = v_reservation.id;

  return true;
end;
$$;

-- Release returns reserved quantities to stock. It is idempotent.
create or replace function private.release_stock(
  p_order_id uuid,
  p_status public.stock_reservation_status default 'released'
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_reservation public.stock_reservations%rowtype;
  v_item record;
begin
  if p_status not in ('released','expired') then
    raise exception 'Release status must be released or expired';
  end if;

  select *
    into v_reservation
    from public.stock_reservations
   where order_id = p_order_id
   for update;

  if not found then
    raise exception 'Stock reservation not found';
  end if;

  if v_reservation.status in ('released','expired') then
    return true;
  end if;

  if v_reservation.status <> 'reserved' then
    raise exception 'Reservation is not releasable: %', v_reservation.status;
  end if;

  for v_item in
    select product_id, quantity
      from public.stock_reservation_items
     where reservation_id = v_reservation.id
     order by product_id
     for update
  loop
    update public.products
       set stock = stock + v_item.quantity,
           updated_at = now()
     where id = v_item.product_id;
  end loop;

  update public.stock_reservations
     set status = p_status,
         released_at = now(),
         updated_at = now()
   where id = v_reservation.id;

  return true;
end;
$$;

revoke all on function private.reserve_stock(uuid,jsonb,timestamptz) from public;
revoke all on function private.commit_stock(uuid) from public;
revoke all on function private.release_stock(uuid,public.stock_reservation_status) from public;

comment on table public.stock_reservations is 'Atomic inventory reservation tied one-to-one to an order.';
comment on table public.stock_reservation_items is 'Product quantities held by a stock reservation.';
comment on function private.reserve_stock(uuid,jsonb,timestamptz) is 'Server-only atomic stock reservation. Decrements stock only inside the reservation transaction.';
comment on function private.commit_stock(uuid) is 'Server-only idempotent commit after verified payment.';
comment on function private.release_stock(uuid,public.stock_reservation_status) is 'Server-only idempotent stock release for failed/expired payment.';
