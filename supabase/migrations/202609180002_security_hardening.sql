-- Warkost Bahagia
-- V1 Foundation / Migration 002
-- Security hardening for RBAC helper functions and self-profile updates.

create schema if not exists private;

create or replace function private.current_user_role()
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

revoke all on function private.current_user_role() from public;
grant execute on function private.current_user_role() to authenticated;

alter policy "profiles_select_admin_owner" on public.profiles
  using ((select private.current_user_role()) in ('admin','owner'));

alter policy "profiles_update_own_nonrole" on public.profiles
  using ((select auth.uid()) = id and is_active = true)
  with check (
    (select auth.uid()) = id
    and is_active = true
    and role = (select private.current_user_role())
  );

alter policy "profiles_admin_update" on public.profiles
  using ((select private.current_user_role()) = 'admin')
  with check ((select private.current_user_role()) = 'admin');

alter policy "categories_staff_read_all" on public.categories
  using ((select private.current_user_role()) in ('admin','owner','kasir','kitchen'));

alter policy "categories_admin_insert" on public.categories
  with check ((select private.current_user_role()) = 'admin');

alter policy "categories_admin_update" on public.categories
  using ((select private.current_user_role()) = 'admin')
  with check ((select private.current_user_role()) = 'admin');

alter policy "categories_admin_delete" on public.categories
  using ((select private.current_user_role()) = 'admin');

alter policy "products_staff_read_all" on public.products
  using ((select private.current_user_role()) in ('admin','owner','kasir','kitchen'));

alter policy "products_admin_insert" on public.products
  with check ((select private.current_user_role()) = 'admin');

alter policy "products_admin_update" on public.products
  using ((select private.current_user_role()) = 'admin')
  with check ((select private.current_user_role()) = 'admin');

alter policy "products_admin_delete" on public.products
  using ((select private.current_user_role()) = 'admin');

drop function if exists public.current_user_role();

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
revoke execute on function public.handle_new_user() from anon, authenticated;

comment on schema private is 'Non-API application helper functions and internal objects.';
