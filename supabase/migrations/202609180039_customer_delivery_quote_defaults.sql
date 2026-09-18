create or replace function private.get_customer_delivery_quote(
  p_customer uuid,p_latitude numeric,p_longitude numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cafe_lat numeric; v_cafe_lon numeric; v_free numeric; v_max numeric; v_extra numeric; v_distance numeric; v_fee numeric;
begin
 if p_customer is null or not exists(select 1 from public.profiles where id=p_customer and role='customer' and is_active=true) then raise exception 'Active customer profile required'; end if;
 if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid delivery coordinates are required'; end if;
 select coalesce((select (value_json #>> '{}')::numeric from public.settings where key='cafe_latitude'),-6.9218),
        coalesce((select (value_json #>> '{}')::numeric from public.settings where key='cafe_longitude'),106.9270),
        coalesce((select (value_json #>> '{}')::numeric from public.settings where key='delivery_free_radius_km'),5),
        coalesce((select (value_json #>> '{}')::numeric from public.settings where key='max_delivery_radius_km'),8),
        coalesce((select (value_json #>> '{}')::numeric from public.settings where key='delivery_extra_fee'),5000)
 into v_cafe_lat,v_cafe_lon,v_free,v_max,v_extra;
 if v_free<0 or v_max<=0 or v_free>v_max or v_extra<0 then raise exception 'Delivery settings are invalid'; end if;
 v_distance:=6371*2*asin(sqrt(power(sin(radians(p_latitude-v_cafe_lat)/2),2)+cos(radians(v_cafe_lat))*cos(radians(p_latitude))*power(sin(radians(p_longitude-v_cafe_lon)/2),2)));
 if v_distance>v_max then return jsonb_build_object('available',false,'distance_km',round(v_distance,2),'free_radius_km',v_free,'max_radius_km',v_max,'delivery_fee',null,'message',format('Lokasi di luar radius delivery maksimal (%s km)',v_max)); end if;
 v_fee:=case when v_distance<=v_free then 0 else v_extra end;
 return jsonb_build_object('available',true,'distance_km',round(v_distance,2),'free_radius_km',v_free,'max_radius_km',v_max,'delivery_fee',v_fee,'message',case when v_fee=0 then 'Gratis ongkir' else format('Ongkir Rp%s',to_char(v_fee,'FM999G999G999')) end);
end; $$;