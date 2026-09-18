-- Warkost Bahagia
-- V1 Loyalty / Migration 008
-- Scope: one loyalty account per customer, append-only ledger and reward catalog.
-- Earn/redeem/adjustment/reversal are server-controlled.

create type public.loyalty_transaction_type as enum (
  'earn',
  'redeem',
  'adjustment',
  'reversal'
);

create type public.loyalty_reward_type as enum (
  'fixed_discount',
  'percentage_discount',
  'free_product'
);

create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.profiles(id) on delete cascade,
  balance bigint not null default 0,
  lifetime_earned bigint not null default 0,
  lifetime_redeemed bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_balance_nonnegative check (balance >= 0),
  constraint loyalty_lifetime_earned_nonnegative check (lifetime_earned >= 0),
  constraint loyalty_lifetime_redeemed_nonnegative check (lifetime_redeemed >= 0)
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  type public.loyalty_transaction_type not null,
  points bigint not null,
  balance_after bigint not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint loyalty_transactions_points_nonzero check (points <> 0),
  constraint loyalty_transactions_balance_nonnegative check (balance_after >= 0)
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points_required bigint not null,
  reward_type public.loyalty_reward_type not null,
  reward_value numeric(12,2) not null,
  minimum_order numeric(12,2) not null default 0,
  maximum_discount numeric(12,2),
  active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_rewards_name_not_blank check (length(btrim(name)) > 0),
  constraint loyalty_rewards_points_positive check (points_required > 0),
  constraint loyalty_rewards_value_nonnegative check (reward_value >= 0),
  constraint loyalty_rewards_minimum_order_nonnegative check (minimum_order >= 0),
  constraint loyalty_rewards_maximum_discount_nonnegative check (
    maximum_discount is null or maximum_discount >= 0
  ),
  constraint loyalty_rewards_valid_window check (
    valid_until is null or valid_from is null or valid_until > valid_from
  )
);

create table public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  points_per_currency_unit numeric(12,6) not null default 0,
  currency_unit numeric(12,2) not null default 1000,
  minimum_eligible_amount numeric(12,2) not null default 0,
  earn_on_channels public.order_channel[] not null default array['delivery','dine_in','walk_in']::public.order_channel[],
  earn_after_order_status public.order_status not null default 'completed',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_rules_points_per_unit_nonnegative check (points_per_currency_unit >= 0),
  constraint loyalty_rules_currency_unit_positive check (currency_unit > 0),
  constraint loyalty_rules_minimum_amount_nonnegative check (minimum_eligible_amount >= 0)
);

create index loyalty_transactions_account_created_idx
  on public.loyalty_transactions(loyalty_account_id, created_at desc);

create index loyalty_transactions_order_idx
  on public.loyalty_transactions(order_id);

create index loyalty_rewards_active_idx
  on public.loyalty_rewards(active, valid_from, valid_until);

alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_rules enable row level security;

create policy "loyalty_accounts_customer_select_own"
on public.loyalty_accounts
for select to authenticated
using (customer_id = (select auth.uid()));

create policy "loyalty_accounts_admin_owner_select"
on public.loyalty_accounts
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "loyalty_transactions_customer_select_own"
on public.loyalty_transactions
for select to authenticated
using (
  exists (
    select 1
    from public.loyalty_accounts la
    where la.id = loyalty_transactions.loyalty_account_id
      and la.customer_id = (select auth.uid())
  )
);

create policy "loyalty_transactions_admin_owner_select"
on public.loyalty_transactions
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "loyalty_rewards_customer_select_active"
on public.loyalty_rewards
for select to authenticated
using (
  active = true
  and (valid_from is null or valid_from <= now())
  and (valid_until is null or valid_until > now())
);

create policy "loyalty_rewards_admin_owner_select"
on public.loyalty_rewards
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "loyalty_rules_admin_owner_select"
on public.loyalty_rules
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

-- All balance/ledger mutations happen in server-side functions.
grant select on public.loyalty_accounts, public.loyalty_transactions, public.loyalty_rewards, public.loyalty_rules to authenticated;
grant all on public.loyalty_accounts, public.loyalty_transactions, public.loyalty_rewards, public.loyalty_rules to service_role;

create or replace function private.ensure_loyalty_account(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.loyalty_accounts(customer_id)
  values (p_customer_id)
  on conflict (customer_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.loyalty_accounts where customer_id = p_customer_id;
  end if;

  return v_id;
end;
$$;

create or replace function private.earn_loyalty(
  p_order_id uuid,
  p_points bigint,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_account public.loyalty_accounts%rowtype;
begin
  if p_points <= 0 then
    raise exception 'Earn points must be greater than zero';
  end if;

  select customer_id into v_customer_id
  from public.orders
  where id = p_order_id and order_status = 'completed';

  if v_customer_id is null then
    raise exception 'Only completed customer orders can earn loyalty points';
  end if;

  perform private.ensure_loyalty_account(v_customer_id);

  select *
    into v_account
    from public.loyalty_accounts
   where customer_id = v_customer_id
   for update;

  -- Idempotency: one earn transaction per order.
  if exists (
    select 1
    from public.loyalty_transactions
    where order_id = p_order_id
      and type = 'earn'
  ) then
    return true;
  end if;

  update public.loyalty_accounts
     set balance = balance + p_points,
         lifetime_earned = lifetime_earned + p_points,
         updated_at = now()
   where id = v_account.id
   returning * into v_account;

  insert into public.loyalty_transactions(
    loyalty_account_id, order_id, type, points, balance_after, description
  )
  values (
    v_account.id, p_order_id, 'earn', p_points, v_account.balance, p_description
  );

  return true;
end;
$$;

create or replace function private.redeem_loyalty(
  p_customer_id uuid,
  p_reward_id uuid,
  p_order_id uuid default null,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.loyalty_accounts%rowtype;
  v_reward public.loyalty_rewards%rowtype;
begin
  select * into v_reward
  from public.loyalty_rewards
  where id = p_reward_id
    and active = true
    and (valid_from is null or valid_from <= now())
    and (valid_until is null or valid_until > now());

  if not found then
    raise exception 'Reward is not active or valid';
  end if;

  perform private.ensure_loyalty_account(p_customer_id);

  select *
    into v_account
    from public.loyalty_accounts
   where customer_id = p_customer_id
   for update;

  if v_account.balance < v_reward.points_required then
    raise exception 'Insufficient loyalty points';
  end if;

  update public.loyalty_accounts
     set balance = balance - v_reward.points_required,
         lifetime_redeemed = lifetime_redeemed + v_reward.points_required,
         updated_at = now()
   where id = v_account.id
   returning * into v_account;

  insert into public.loyalty_transactions(
    loyalty_account_id, order_id, type, points, balance_after, description
  )
  values (
    v_account.id, p_order_id, 'redeem',
    -v_reward.points_required,
    v_account.balance,
    coalesce(p_description, v_reward.name)
  );

  return true;
end;
$$;

revoke all on function private.ensure_loyalty_account(uuid) from public;
revoke all on function private.earn_loyalty(uuid,bigint,text) from public;
revoke all on function private.redeem_loyalty(uuid,uuid,uuid,text) from public;

comment on table public.loyalty_accounts is 'One loyalty account per customer across all order channels.';
comment on table public.loyalty_transactions is 'Append-only loyalty ledger; balance changes are server-controlled.';
comment on table public.loyalty_rewards is 'Reward catalog and redemption rules.';
comment on table public.loyalty_rules is 'Business configuration for loyalty earning; final values are owner-configured.';
