-- Warkost Bahagia
-- V1 Sales / Migration 009
-- Scope: central sales record, one row per completed order.
-- Creation remains server-controlled and must be idempotent.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  channel public.order_channel not null,
  gross_amount numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  payment_method public.payment_method,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint sales_gross_nonnegative check (gross_amount >= 0),
  constraint sales_discount_nonnegative check (discount_amount >= 0),
  constraint sales_delivery_fee_nonnegative check (delivery_fee >= 0),
  constraint sales_net_nonnegative check (net_amount >= 0)
);

create index sales_completed_at_idx on public.sales(completed_at desc);
create index sales_channel_completed_idx on public.sales(channel, completed_at desc);

alter table public.sales enable row level security;

create policy "sales_admin_owner_select"
on public.sales
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

grant select on public.sales to authenticated;
grant all on public.sales to service_role;

create or replace function private.create_sale_from_completed_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_method public.payment_method;
  v_sale_id uuid;
begin
  select *
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.order_status <> 'completed' then
    raise exception 'Only completed orders can create sales';
  end if;

  select method into v_payment_method
  from public.payments
  where order_id = p_order_id
    and status = 'paid'
  limit 1;

  insert into public.sales(
    order_id,
    channel,
    gross_amount,
    discount_amount,
    delivery_fee,
    net_amount,
    payment_method,
    completed_at
  )
  values (
    v_order.id,
    v_order.channel,
    v_order.subtotal,
    v_order.discount_total,
    v_order.delivery_fee,
    v_order.total_amount,
    v_payment_method,
    coalesce(v_order.completed_at, now())
  )
  on conflict (order_id) do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select id into v_sale_id from public.sales where order_id = p_order_id;
  end if;

  return v_sale_id;
end;
$$;

revoke all on function private.create_sale_from_completed_order(uuid) from public;

comment on table public.sales is 'Central sales ledger: exactly one sales record per completed order across delivery, dine-in and walk-in.';
comment on function private.create_sale_from_completed_order(uuid) is 'Server-only idempotent creation of central sales record from a completed order.';
