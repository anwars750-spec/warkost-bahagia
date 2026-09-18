-- V1 customer ordering API: authenticated customer only.
create or replace function public.create_customer_delivery_order(
  p_items jsonb,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid := auth.uid();
  v_order_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_distance numeric;
  v_free_radius numeric;
  v_max_radius numeric;
  v_extra_fee numeric;
  v_estimated integer;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
begin
  if v_customer is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_customer and role='customer' and is_active=true)
    then raise exception 'Active customer profile required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0
    then raise exception 'Order must contain at least one item'; end if;
  if p_address is null or length(btrim(p_address))=0 then raise exception 'Delivery address is required'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    then raise exception 'Valid delivery coordinates are required'; end if;

  select
    coalesce((select value::numeric from public.settings where key='delivery_free_radius_km'),5),
    coalesce((select value::numeric from public.settings where key='max_delivery_radius_km'),8),
    coalesce((select value::numeric from public.settings where key='delivery_extra_fee'),5000)
  into v_free_radius,v_max_radius,v_extra_fee;

  if v_free_radius<0 or v_max_radius<=0 or v_free_radius>v_max_radius or v_extra_fee<0
    then raise exception 'Delivery settings are invalid'; end if;

  v_distance := 6371 * 2 * asin(sqrt(
    power(sin(radians(p_latitude - coalesce((select value::numeric from public.settings where key='cafe_latitude'),-6.9218))/2),2)
    + cos(radians(coalesce((select value::numeric from public.settings where key='cafe_latitude'),-6.9218)))
    * cos(radians(p_latitude))
    * power(sin(radians(p_longitude - coalesce((select value::numeric from public.settings where key='cafe_longitude'),106.9270))/2),2)
  ));

  if v_distance > v_max_radius then raise exception 'Location is outside delivery radius'; end if;
  if v_distance > v_free_radius then v_delivery_fee := v_extra_fee; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true;
    if not found then raise exception 'Product is unavailable'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'Invalid quantity'; end if;
    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
  end loop;

  v_total := v_subtotal + v_delivery_fee;
  v_estimated := greatest(15,30+ceil(v_distance*5)::integer);

  v_order_id := private.create_delivery_order(
    v_customer,
    'WB-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),
    v_subtotal,0,v_delivery_fee,v_total,
    btrim(p_address),p_latitude,p_longitude,v_distance,v_estimated,p_notes,
    p_items,'btn','qris',now()+interval '30 minutes'
  );
  return v_order_id;
end;
$$;

revoke all on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) from public,anon;
grant execute on function public.create_customer_delivery_order(jsonb,text,numeric,numeric,text) to authenticated;

comment on function public.create_customer_delivery_order is 'V1 customer checkout: server calculates prices, delivery fee, total, reserves stock, and creates pending payment.';
