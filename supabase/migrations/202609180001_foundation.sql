-- Warkost Bahagia
-- V1 Foundation / Migration 001
-- Scope: roles, profiles, categories, products, RLS, grants.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'customer',
  'admin',
  'kasir',
  'kitchen',
  'driver',
  'owner'
);

create type public.station_type as enum (
  'kitchen',
  'bar'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  station public.station_type not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  normal_price numeric(12,2) not null,
  selling_price numeric(12,2) not null,
  stock integer not null default 0,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_normal_price_nonnegative check (normal_price >= 0),
  constraint products_selling_price_nonnegative check (selling_price >= 0),
  constraint products_stock_nonnegative check (stock >= 0)
);

create index profiles_role_idx on public.profiles(role);
create index profiles_active_idx on public.profiles(is_active);
create index categories_station_active_idx on public.categories(station, active, sort_order);
create index products_category_active_idx on public.products(category_id, active);
create index products_active_idx on public.products(active);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);

create policy "profiles_select_admin_owner"
on public.profiles
for select
to authenticated
using (
  (select public.current_user_role()) in ('admin', 'owner')
);

create policy "profiles_update_own_nonrole"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
  and role = (select public.current_user_role())
);

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (
  (select public.current_user_role()) = 'admin'
)
with check (
  (select public.current_user_role()) = 'admin'
);

create policy "categories_public_read_active"
on public.categories
for select
to anon, authenticated
using (
  active = true
);

create policy "categories_staff_read_all"
on public.categories
for select
to authenticated
using (
  (select public.current_user_role()) in ('admin', 'owner', 'kasir', 'kitchen')
);

create policy "categories_admin_insert"
on public.categories
for insert
to authenticated
with check (
  (select public.current_user_role()) = 'admin'
);

create policy "categories_admin_update"
on public.categories
for update
to authenticated
using (
  (select public.current_user_role()) = 'admin'
)
with check (
  (select public.current_user_role()) = 'admin'
);

create policy "categories_admin_delete"
on public.categories
for delete
to authenticated
using (
  (select public.current_user_role()) = 'admin'
);

create policy "products_public_read_active"
on public.products
for select
to anon, authenticated
using (
  active = true
);

create policy "products_staff_read_all"
on public.products
for select
to authenticated
using (
  (select public.current_user_role()) in ('admin', 'owner', 'kasir', 'kitchen')
);

create policy "products_admin_insert"
on public.products
for insert
to authenticated
with check (
  (select public.current_user_role()) = 'admin'
);

create policy "products_admin_update"
on public.products
for update
to authenticated
using (
  (select public.current_user_role()) = 'admin'
)
with check (
  (select public.current_user_role()) = 'admin'
);

create policy "products_admin_delete"
on public.products
for delete
to authenticated
using (
  (select public.current_user_role()) = 'admin'
);

grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to authenticated;

grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;

grant select, update on public.profiles to authenticated;

grant all on public.profiles, public.categories, public.products to service_role;

comment on table public.profiles is 'Application profile and RBAC role for each Supabase Auth user.';
comment on table public.categories is 'Menu categories with fulfillment station routing.';
comment on table public.products is 'Sellable menu products with price, stock, image and active state.';
comment on column public.categories.station is 'kitchen for food items, bar for drink items.';
comment on column public.products.selling_price is 'Current customer-facing selling price.';
