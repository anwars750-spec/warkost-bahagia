-- Warkost Bahagia V1.3
-- Migration 046: operational audit log foundation.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_logs_entity_type_not_blank check (length(btrim(entity_type)) > 0)
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id, created_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_admin_owner_select" on public.audit_logs;
create policy "audit_logs_admin_owner_select"
on public.audit_logs for select to authenticated
using ((select private.current_user_role()) in ('admin','owner'));

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

create or replace function private.write_audit_log(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_value jsonb,
  p_new_value jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_value,new_value,metadata)
  values(p_user_id,p_action,p_entity_type,p_entity_id,p_old_value,p_new_value,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function private.write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) to service_role;

create or replace function private.audit_products_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op='INSERT' then
    v_new=jsonb_build_object('name',new.name,'category_id',new.category_id,'normal_price',new.normal_price,'selling_price',new.selling_price,'stock',new.stock,'active',new.active,'image_url',new.image_url);
    perform private.write_audit_log(auth.uid(),'CREATE','product',new.id,null,v_new,'{}'::jsonb);
    return new;
  elsif tg_op='UPDATE' then
    if (old.name,old.category_id,old.normal_price,old.selling_price,old.stock,old.active,old.image_url)
       is not distinct from
       (new.name,new.category_id,new.normal_price,new.selling_price,new.stock,new.active,new.image_url) then
      return new;
    end if;
    v_old=jsonb_build_object('name',old.name,'category_id',old.category_id,'normal_price',old.normal_price,'selling_price',old.selling_price,'stock',old.stock,'active',old.active,'image_url',old.image_url);
    v_new=jsonb_build_object('name',new.name,'category_id',new.category_id,'normal_price',new.normal_price,'selling_price',new.selling_price,'stock',new.stock,'active',new.active,'image_url',new.image_url);
    perform private.write_audit_log(auth.uid(),'UPDATE','product',new.id,v_old,v_new,'{}'::jsonb);
    return new;
  else
    perform private.write_audit_log(auth.uid(),'DELETE','product',old.id,to_jsonb(old),null,'{}'::jsonb);
    return old;
  end if;
end;
$$;

create or replace function private.audit_categories_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='INSERT' then
    perform private.write_audit_log(auth.uid(),'CREATE','category',new.id,null,to_jsonb(new),'{}'::jsonb);
    return new;
  elsif tg_op='UPDATE' then
    if to_jsonb(old) is not distinct from to_jsonb(new) then return new; end if;
    perform private.write_audit_log(auth.uid(),'UPDATE','category',new.id,to_jsonb(old),to_jsonb(new),'{}'::jsonb);
    return new;
  else
    perform private.write_audit_log(auth.uid(),'DELETE','category',old.id,to_jsonb(old),null,'{}'::jsonb);
    return old;
  end if;
end;
$$;

drop trigger if exists products_audit_trg on public.products;
create trigger products_audit_trg
after insert or update or delete on public.products
for each row execute function private.audit_products_change();

drop trigger if exists categories_audit_trg on public.categories;
create trigger categories_audit_trg
after insert or update or delete on public.categories
for each row execute function private.audit_categories_change();

comment on table public.audit_logs is 'Append-only operational audit log. Client roles can read only as permitted; writes are server/trigger controlled.';
comment on function private.write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) is 'Server-only audit log writer.';
