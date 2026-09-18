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

drop policy if exists "profiles_select_admin_owner" on public.profiles;
create policy "profiles_select_admin_owner"
on public.profiles
for select
to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

drop policy if exists "profiles_update_own_nonrole" on public.profiles;
create policy "profiles_update_own_nonrole"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  and is_active = true
)
with check (
  (select auth.uid()) = id
  and is_active = true
  and role = (select private.current_user_role())
);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

-- Remove direct API execution of the trigger helper.
revoke execute on function public.handle_new_user() from anon, authenticated;

comment on schema private is 'Non-API application helper functions and internal objects.';
