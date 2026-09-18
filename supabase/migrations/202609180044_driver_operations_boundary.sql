create or replace function public.server_set_driver_status(
  p_actor_id uuid,
  p_status public.driver_status
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_driver public.drivers%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_driver from public.drivers where user_id=p_actor_id for update;
  if not found then raise exception 'Driver profile not found'; end if;
  if p_status='online' and v_driver.status='inactive' then raise exception 'Driver is inactive'; end if;
  if p_status='offline' and v_driver.status='busy' and v_driver.active_trip_id is not null then raise exception 'Driver with active trip cannot go OFFLINE'; end if;
  update public.drivers set status=p_status,updated_at=now() where id=v_driver.id;
  return true;
end;
$$;

create or replace function public.server_mark_delivery_picked_up(
  p_delivery_order_id uuid,p_actor_id uuid
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  return private.mark_delivery_picked_up(p_delivery_order_id,p_actor_id);
end; $$;

create or replace function public.server_complete_delivery(
  p_delivery_order_id uuid,p_proof_photo text,p_actor_id uuid,p_notes text default null
)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  return private.complete_delivery(p_delivery_order_id,p_proof_photo,p_actor_id,p_notes);
end; $$;

revoke all on function public.server_set_driver_status(uuid,public.driver_status) from public,anon,authenticated;
grant execute on function public.server_set_driver_status(uuid,public.driver_status) to service_role;
revoke all on function public.server_mark_delivery_picked_up(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_mark_delivery_picked_up(uuid,uuid) to service_role;
revoke all on function public.server_complete_delivery(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.server_complete_delivery(uuid,text,uuid,text) to service_role;
