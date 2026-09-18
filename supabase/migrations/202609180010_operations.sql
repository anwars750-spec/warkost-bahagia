-- Warkost Bahagia
-- V1 Operations / Migration 010
-- Scope: notifications and centralized operational settings.

create type public.notification_type as enum (
  'order_created',
  'payment_verified',
  'payment_failed',
  'kitchen_new',
  'bar_new',
  'fulfillment_ready',
  'driver_assigned',
  'delivery_update',
  'order_completed',
  'system'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint notifications_message_not_blank check (length(btrim(message)) > 0)
);

create table public.settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  description text,
  is_secret boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications(user_id, read_at, created_at desc);

create index notifications_order_idx
  on public.notifications(order_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.settings enable row level security;

create policy "notifications_user_select_own"
on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

create policy "notifications_user_update_own"
on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "notifications_admin_owner_select"
on public.notifications
for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

create policy "settings_admin_select"
on public.settings
for select to authenticated
using ((select private.current_user_role()) = 'admin');

create policy "settings_owner_select_nonsecret"
on public.settings
for select to authenticated
using (
  (select private.current_user_role()) = 'owner'
  and is_secret = false
);

create policy "settings_admin_insert"
on public.settings
for insert to authenticated
with check ((select private.current_user_role()) = 'admin');

create policy "settings_admin_update"
on public.settings
for update to authenticated
using ((select private.current_user_role()) = 'admin')
with check ((select private.current_user_role()) = 'admin');

create policy "settings_admin_delete"
on public.settings
for delete to authenticated
using ((select private.current_user_role()) = 'admin');

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant all on public.notifications, public.settings to service_role;

create or replace function private.create_notification(
  p_user_id uuid,
  p_order_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications(user_id, order_id, type, title, message)
  values (p_user_id, p_order_id, p_type, p_title, p_message)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.create_notification(uuid,uuid,public.notification_type,text,text) from public;

comment on table public.notifications is 'Role/user-targeted operational notifications tied to an order when applicable.';
comment on table public.settings is 'Central operational configuration. Secrets are flagged and must not be exposed to non-admin roles.';
comment on function private.create_notification(uuid,uuid,public.notification_type,text,text) is 'Server-only notification creation.';
