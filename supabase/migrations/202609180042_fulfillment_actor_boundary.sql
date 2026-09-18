-- V1.1 server boundary for authenticated Kitchen/Bar fulfillment actions
create function public.server_transition_fulfillment(p_fulfillment_id uuid,p_next_status public.fulfillment_station_status,p_actor_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 if p_actor_id is null then raise exception 'Actor identity required'; end if;
 return private.transition_fulfillment(p_fulfillment_id,p_next_status,p_actor_id);
end $$;
revoke all on function public.server_transition_fulfillment(uuid,public.fulfillment_station_status,uuid) from public,anon,authenticated;
grant execute on function public.server_transition_fulfillment(uuid,public.fulfillment_station_status,uuid) to service_role;