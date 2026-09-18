create or replace function public.get_customer_delivery_quote(
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid := auth.uid();
  v_cafe_lat numeric;
  v_cafe_lon numeric;
  v_free numeric;
  v_max numeric;
  v_extra numeric;
  v_distance numeric;
  v_fee numeric;
begin
  if v_customer is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_customer and role='customer' and is_active=true)
    then raise exception 'Active customer profile required'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    then raise exception 'Valid delivery coordinates are required'; end if;

  select coalesce((value_json #>> '{}')::numeric,-6.9218) into v_cafe_lat from public.settings where key='cafe_latitude';
  select coalesce((value_json #>> '{}')::numeric,106.9270) into v_cafe_lon from public.settings where key='cafe_longitude';
  select coalesce((value_json #>> '{}')::numeric,5) into v_free from public.settings where key='delivery_free_radius_km';
  select coalesce((value_json #>> '{}')::numeric,8) into v_max from public.settings where key='max_delivery_radius_km';
  select coalesce((value_json #>> '{}')::numeric,5000) into v_extra from public.settings where key='delivery_extra_fee';

  v_distance := 6371 * 2 * asin(sqrt(
    power(sin(radians(p_latitude-v_cafe_lat)/2),2)
    + cos(radians(v_cafe_lat))*cos(radians(p_latitude))
    * power(sin(radians(p_longitude-v_cafe_lon)/2),2)
  ));

  if v_distance > v_max then
    return jsonb_build_object('available',false,'distance_km',round(v_distance,2),'free_radius_km',v_free,'max_radius_km',v_max,'delivery_fee',null,'message',format('Lokasi di luar radius delivery maksimal (%s km)',v_max));
  end if;

  v_fee := case when v_distance <= v_free then 0 else v_extra end;
  return jsonb_build_object('available',true,'distance_km',round(v_distance,2),'free_radius_km',v_free,'max_radius_km',v_max,'delivery_fee',v_fee,'message',case when v_fee=0 then 'Gratis ongkir' else format('Ongkir Rp%s',to_char(v_fee,'FM999G999G999')) end);
end;
$$;

revoke all on function public.get_customer_delivery_quote(numeric,numeric) from public, anon;
grant execute on function public.get_customer_delivery_quote(numeric,numeric) to authenticated;
