-- Warkost Bahagia
-- V1 Business Logic / Migration 011
-- Scope: transactional order creation, payment verification, fulfillment transitions,
-- delivery assignment guard, completion, sales and loyalty orchestration.
-- All mutating business actions are server-only.

-- 1) Harden stock reservation: aggregate duplicate product lines before reserving.
create or replace function private.reserve_stock(
  p_order_id uuid,
  p_items jsonb,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_product record;
  v_available integer;
begin
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one stock item is required';
  end if;

  perform 1 from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if exists (select 1 from public.stock_reservations where order_id = p_order_id) then
    raise exception 'Stock reservation already exists for order';
  end if;

  create temporary table if not exists pg_temp.requested_stock (
    product_id uuid primary key,
    quantity integer not null
  ) on commit drop;

  truncate pg_temp.requested_stock;

  insert into pg_temp.requested_stock(product_id, quantity)
  select
    (x->>'product_id')::uuid,
    sum((x->>'quantity')::integer)::integer
  from jsonb_array_elements(p_items) x
  group by (x->>'product_id')::uuid;

  if exists (select 1 from pg_temp.requested_stock where quantity <= 0) then
    raise exception 'Quantity must be greater than zero';
  end if;

  -- Deterministic row locks protect against concurrent reservations.
  for v_product in
    select r.product_id, r.quantity, p.stock
    from pg_temp.requested_stock r
    join public.products p on p.id = r.product_id
    order by r.product_id
    for update of p
  loop
    v_available := v_product.stock;
    if v_available < v_product.quantity then
      raise exception 'Insufficient stock for product %', v_product.product_id;
    end if;
  end loop;

  if exists (
    select 1 from pg_temp.requested_stock r
    left join public.products p on p.id = r.product_id
    where p.id is null
  ) then
    raise exception 'One or more products were not found';
  end if;

  insert into public.stock_reservations(order_id, status, expires_at)
  values (p_order_id, 'reserved', p_expires_at)
  returning id into v_reservation_id;

  for v_product in
    select r.product_id, r.quantity, p.selling_price
    from pg_temp.requested_stock r
    join public.products p on p.id = r.product_id
    order by r.product_id
  loop
    update public.products
       set stock = stock - v_product.quantity,
           updated_at = now()
     where id = v_product.product_id;

    insert into public.stock_reservation_items(
      reservation_id, product_id, quantity, unit_price
    )
    values (
      v_reservation_id, v_product.product_id, v_product.quantity, v_product.selling_price
    );
  end loop;

  return v_reservation_id;
end;
$$;

-- 2) Controlled order creation.
create or replace function private.create_delivery_order(
  p_customer_id uuid,
  p_order_number text,
  p_subtotal numeric,
  p_discount_total numeric,
  p_delivery_fee numeric,
  p_total_amount numeric,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_distance_km numeric,
  p_estimated_minutes integer,
  p_notes text,
  p_items jsonb,
  p_payment_provider text,
  p_payment_method public.payment_method,
  p_payment_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_station public.station_type;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_delivery_total numeric(12,2);
begin
  if p_customer_id is null or p_order_number is null or length(btrim(p_order_number)) = 0 then
    raise exception 'Customer and order number are required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if p_address is null or length(btrim(p_address)) = 0 then
    raise exception 'Delivery address is required';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'Valid delivery coordinates are required';
  end if;

  if p_subtotal < 0 or p_discount_total < 0 or p_delivery_fee < 0 or p_total_amount < 0 then
    raise exception 'Order amounts cannot be negative';
  end if;

  if exists (select 1 from public.orders where order_number = p_order_number) then
    raise exception 'Order number already exists';
  end if;

  insert into public.orders(
    order_number, customer_id, channel, order_status,
    subtotal, discount_total, delivery_fee, total_amount,
    delivery_address, delivery_latitude, delivery_longitude,
    delivery_distance_km, estimated_delivery_minutes, notes
  )
  values (
    p_order_number, p_customer_id, 'delivery', 'payment_pending',
    p_subtotal, p_discount_total, p_delivery_fee, p_total_amount,
    p_address, p_latitude, p_longitude,
    p_distance_km, p_estimated_minutes, p_notes
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and active = true;

    if not found then
      raise exception 'Product % is unavailable', v_item->>'product_id';
    end if;

    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.id;
    end if;

    select station into v_station
    from public.categories
    where id = v_product.category_id;

    if v_station is null then
      raise exception 'Product % has no valid fulfillment station', v_product.id;
    end if;

    insert into public.order_items(
      order_id, product_id, product_name, category_id, station,
      quantity, unit_price, normal_price, discount_amount,
      final_unit_price, subtotal, notes
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.category_id, v_station,
      v_qty, v_product.selling_price, v_product.normal_price,
      0, v_product.selling_price, v_product.selling_price * v_qty,
      v_item->>'notes'
    );

    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
  end loop;

  if round(v_subtotal,2) <> round(p_subtotal,2) then
    raise exception 'Order subtotal does not match product prices';
  end if;

  v_delivery_total := v_subtotal - p_discount_total + p_delivery_fee;
  if round(v_delivery_total,2) <> round(p_total_amount,2) then
    raise exception 'Order total does not match subtotal, discount and delivery fee';
  end if;

  -- Reserve stock only after the order has passed all amount/item validation.
  perform private.reserve_stock(
    v_order_id,
    (
      select jsonb_agg(jsonb_build_object('product_id', x->>'product_id', 'quantity', x->>'quantity'))
      from jsonb_array_elements(p_items) x
    ),
    p_payment_expires_at
  );

  insert into public.payments(
    order_id, provider, method, amount, status, expired_at
  )
  values (
    v_order_id, p_payment_provider, p_payment_method, p_total_amount,
    'pending', p_payment_expires_at
  );

  return v_order_id;
exception
  when others then
    -- Transaction rollback removes order/items/reservation if any validation fails.
    raise;
end;
$$;

-- 3) Payment verification. Only server/provider path should call this function.
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
begin
  select * into v_payment
  from public.payments
  where order_id = p_order_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if p_status = 'paid' then
    if p_provider_reference is null or length(btrim(p_provider_reference)) = 0 then
      raise exception 'Provider reference is required for paid status';
    end if;

    if v_payment.status = 'paid' then
      return true;
    end if;

    update public.payments
       set status = 'paid',
           provider_reference = p_provider_reference,
           transaction_reference = p_transaction_reference,
           paid_at = coalesce(p_verified_at, now()),
           verified_at = coalesce(p_verified_at, now())
     where id = v_payment.id;

    update public.orders
       set order_status = 'paid'
     where id = p_order_id
       and order_status = 'payment_pending';

    perform private.commit_stock(p_order_id);
    return true;
  elsif p_status in ('failed','expired') then
    if v_payment.status in ('failed','expired') then
      return true;
    end if;

    update public.payments
       set status = p_status,
           provider_reference = coalesce(p_provider_reference, provider_reference),
           transaction_reference = coalesce(p_transaction_reference, transaction_reference),
           expired_at = case when p_status = 'expired' then coalesce(p_verified_at, now()) else expired_at end,
           verified_at = coalesce(p_verified_at, now())
     where id = v_payment.id;

    update public.orders
       set order_status = case when p_status = 'expired' then 'expired' else 'cancelled' end,
           cancelled_at = case when p_status = 'failed' then now() else cancelled_at end
     where id = p_order_id
       and order_status in ('payment_pending','paid');

    perform private.release_stock(
      p_order_id,
      case when p_status = 'expired' then 'expired' else 'released' end
    );
    return true;
  else
    raise exception 'Unsupported payment status for verification';
  end if;
end;
$$;

-- 4) Build fulfillment streams after payment is verified.
create or replace function private.create_fulfillments_for_paid_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station public.station_type;
  v_fulfillment_id uuid;
begin
  if not exists (
    select 1 from public.orders where id = p_order_id and order_status = 'paid'
  ) then
    raise exception 'Order must be PAID before fulfillment starts';
  end if;

  for v_station in
    select distinct station from public.order_items
    where order_id = p_order_id
    order by station
  loop
    insert into public.fulfillments(order_id, station, status)
    values (p_order_id, v_station, 'new')
    on conflict (order_id, station) do nothing
    returning id into v_fulfillment_id;

    if v_fulfillment_id is null then
      select id into v_fulfillment_id
      from public.fulfillments
      where order_id = p_order_id and station = v_station;
    end if;

    insert into public.fulfillment_items(fulfillment_id, order_item_id, quantity, status)
    select v_fulfillment_id, oi.id, oi.quantity, 'new'
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.station = v_station
    on conflict (fulfillment_id, order_item_id) do nothing;
  end loop;

  update public.orders
     set order_status = 'in_fulfillment'
   where id = p_order_id
     and order_status = 'paid';

  return true;
end;
$$;

-- 5) Controlled station status transition.
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
  v_allowed boolean := false;
begin
  select * into v
  from public.fulfillments
  where id = p_fulfillment_id
  for update;

  if not found then
    raise exception 'Fulfillment not found';
  end if;

  select role into v_role from public.profiles where id = p_actor_id and is_active = true;

  if v_role is null then
    raise exception 'Actor is not active';
  end if;

  if v.station = 'kitchen' and v_role <> 'kitchen' and v_role <> 'admin' then
    raise exception 'Only Kitchen/Admin can operate kitchen fulfillment';
  end if;

  if v.station = 'bar' and v_role <> 'kasir' and v_role <> 'admin' then
    raise exception 'Only Kasir/Admin can operate bar fulfillment';
  end if;

  v_allowed :=
    (v.status = 'new' and p_next_status = 'processing')
    or (v.status = 'processing' and p_next_status = 'ready')
    or (v.status = 'ready' and p_next_status = 'completed')
    or (v.status in ('new','processing') and p_next_status = 'cancelled');

  if not v_allowed then
    raise exception 'Invalid fulfillment transition: % -> %', v.status, p_next_status;
  end if;

  update public.fulfillments
     set status = p_next_status,
         started_at = case when p_next_status = 'processing' then coalesce(started_at, now()) else started_at end,
         ready_at = case when p_next_status = 'ready' then now() else ready_at end,
         completed_at = case when p_next_status = 'completed' then now() else completed_at end,
         completed_by = case when p_next_status in ('ready','completed') then p_actor_id else completed_by end,
         updated_at = now()
   where id = v.id;

  update public.fulfillment_items
     set status = p_next_status,
         updated_at = now()
   where fulfillment_id = v.id
     and status <> 'completed';

  -- If every required stream is ready/completed, order becomes pickup-ready.
  if not exists (
    select 1 from public.fulfillments
    where order_id = v.order_id
      and status not in ('ready','completed','cancelled')
  )
  and not exists (
    select 1 from public.fulfillments
    where order_id = v.order_id
      and status = 'cancelled'
  ) then
    update public.orders
       set order_status = 'ready_for_pickup'
     where id = v.order_id
       and order_status = 'in_fulfillment';
  end if;

  return true;
end;
$$;

-- 6) Controlled delivery assignment.
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
  select * into v_do
  from public.delivery_orders
  where id = p_delivery_order_id
  for update;

  if not found then raise exception 'Delivery order not found'; end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
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

  select id into v_trip_id
  from public.delivery_trips
  where driver_id = p_driver_id
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_trip_id is null then
    insert into public.delivery_trips(driver_id, status, started_at)
    values (p_driver_id, 'active', now())
    returning id into v_trip_id;

    update public.drivers
       set active_trip_id = v_trip_id,
           status = 'busy',
           updated_at = now()
     where id = p_driver_id;
  else
    select count(*) into v_count
    from public.delivery_stops
    where trip_id = v_trip_id
      and status in ('pending','active');

    if v_count >= 5 then
      raise exception 'Driver trip is full: maximum 5 active stops';
    end if;

    update public.drivers
       set status = 'busy',
           updated_at = now()
     where id = p_driver_id;
  end if;

  insert into public.delivery_stops(trip_id, order_id, sequence, status)
  select v_trip_id, v_do.order_id, p_sequence, 'pending'
  where not exists (
    select 1 from public.delivery_stops where order_id = v_do.order_id
  )
  returning id into v_stop_id;

  if v_stop_id is null then
    raise exception 'Order is already assigned to a delivery stop';
  end if;

  update public.delivery_orders
     set driver_id = p_driver_id,
         status = 'assigned',
         assigned_at = now(),
         updated_at = now()
   where id = v_do.id;

  return v_stop_id;
end;
$$;

-- 7) Pickup guard: all required fulfillment streams must be ready/completed.
create or replace function private.mark_delivery_picked_up(p_delivery_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  select order_id into v_order_id
  from public.delivery_orders
  where id = p_delivery_order_id
  for update;

  if v_order_id is null then raise exception 'Delivery order not found'; end if;

  if not exists (
    select 1 from public.delivery_orders
    where id = p_delivery_order_id and status = 'assigned'
  ) then
    raise exception 'Delivery order is not assigned';
  end if;

  if exists (
    select 1 from public.fulfillments
    where order_id = v_order_id
      and status not in ('ready','completed')
  ) then
    raise exception 'Order is not ready for pickup: all fulfillment stations must be READY';
  end if;

  update public.delivery_orders
     set status = 'picked_up',
         picked_up_at = now(),
         updated_at = now()
   where id = p_delivery_order_id;

  update public.orders
     set order_status = 'out_for_delivery'
   where id = v_order_id;

  return true;
end;
$$;

-- 8) Delivery completion. Proof photo is mandatory for successful completion.
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
  v_order_id uuid;
  v_driver_id uuid;
  v_trip_id uuid;
  v_remaining integer;
begin
  if p_proof_photo is null or length(btrim(p_proof_photo)) = 0 then
    raise exception 'Proof photo is required';
  end if;

  select * into v_do
  from public.delivery_orders
  where id = p_delivery_order_id
  for update;

  if not found then raise exception 'Delivery order not found'; end if;

  if v_do.status not in ('picked_up','out_for_delivery') then
    raise exception 'Delivery order is not ready to complete';
  end if;

  v_order_id := v_do.order_id;
  v_driver_id := v_do.driver_id;

  update public.delivery_orders
     set status = 'delivered',
         delivered_at = now(),
         proof_photo = p_proof_photo,
         notes = p_notes,
         updated_at = now()
   where id = p_delivery_order_id;

  update public.delivery_stops
     set status = 'delivered',
         delivered_at = now(),
         updated_at = now()
   where order_id = v_order_id
     and status in ('pending','active');

  update public.orders
     set order_status = 'completed',
         completed_at = now()
   where id = v_order_id;

  perform private.create_sale_from_completed_order(v_order_id);

  -- Loyalty points are calculated from configured rules elsewhere;
  -- this function only marks the order complete and creates the sales record.
  -- Earning is intentionally not hardcoded until owner values are approved.

  select trip_id into v_trip_id
  from public.delivery_stops
  where order_id = v_order_id
  limit 1;

  if v_trip_id is not null then
    select count(*) into v_remaining
    from public.delivery_stops
    where trip_id = v_trip_id
      and status in ('pending','active');

    if v_remaining = 0 then
      update public.delivery_trips
         set status = 'completed',
             completed_at = now(),
             updated_at = now()
       where id = v_trip_id
         and status = 'active';

      update public.drivers
         set status = 'online',
             active_trip_id = null,
             updated_at = now()
       where id = v_driver_id
         and active_trip_id = v_trip_id;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function private.reserve_stock(uuid,jsonb,timestamptz) from public;
revoke all on function private.create_delivery_order(uuid,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,integer,text,jsonb,text,public.payment_method,timestamptz) from public;
revoke all on function private.verify_payment(uuid,public.payment_status,text,text,timestamptz) from public;
revoke all on function private.create_fulfillments_for_paid_order(uuid) from public;
revoke all on function private.transition_fulfillment(uuid,public.fulfillment_station_status,uuid) from public;
revoke all on function private.assign_delivery(uuid,uuid,integer) from public;
revoke all on function private.mark_delivery_picked_up(uuid) from public;
revoke all on function private.complete_delivery(uuid,text,text) from public;

comment on function private.create_delivery_order(uuid,text,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,integer,text,jsonb,text,public.payment_method,timestamptz) is 'Transactional delivery order creation with price validation, stock reservation and pending payment.';
comment on function private.verify_payment(uuid,public.payment_status,text,text,timestamptz) is 'Server-only payment state transition with stock commit/release.';
comment on function private.create_fulfillments_for_paid_order(uuid) is 'Creates station streams only after verified payment.';
comment on function private.transition_fulfillment(uuid,public.fulfillment_station_status,uuid) is 'Role-checked kitchen/bar fulfillment transition.';
comment on function private.assign_delivery(uuid,uuid,integer) is 'Server-controlled driver assignment with online status and max-five trip capacity.';
comment on function private.mark_delivery_picked_up(uuid) is 'Blocks pickup until every required station fulfillment is ready.';
comment on function private.complete_delivery(uuid,text,text) is 'Completes delivery with mandatory proof photo and creates central sales.';
