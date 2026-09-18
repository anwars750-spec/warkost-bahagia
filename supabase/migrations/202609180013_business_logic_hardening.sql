create or replace function private.verify_payment(p_order_id uuid, p_status payment_status, p_provider_reference text, p_transaction_reference text default null, p_verified_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public as $function$
declare v_payment public.payments%rowtype; v_order public.orders%rowtype;
begin
 select * into v_payment from public.payments where order_id=p_order_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if p_status='paid' then
  if p_provider_reference is null or length(btrim(p_provider_reference))=0 then raise exception 'Provider reference is required for paid status'; end if;
  if v_payment.status='paid' then return true; end if;
  update public.payments set status='paid',provider_reference=p_provider_reference,transaction_reference=p_transaction_reference,paid_at=coalesce(p_verified_at,now()),verified_at=coalesce(p_verified_at,now()) where id=v_payment.id;
  update public.orders set order_status='paid' where id=p_order_id and order_status='payment_pending';
  perform private.commit_stock(p_order_id); perform private.create_fulfillments_for_paid_order(p_order_id);
  select * into v_order from public.orders where id=p_order_id;
  if v_order.customer_id is not null then perform private.create_notification(v_order.customer_id,p_order_id,'payment_verified','Pembayaran terverifikasi','Pembayaran order '||v_order.order_number||' berhasil diverifikasi.'); end if;
  perform private.notify_order_role_users(p_order_id,array['admin','kasir','kitchen']::public.app_role[],'order_created','Order baru','Order '||v_order.order_number||' sudah dibayar dan masuk proses operasional.');
  return true;
 elsif p_status in ('failed','expired') then
  if v_payment.status in ('failed','expired') then return true; end if;
  update public.payments set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),transaction_reference=coalesce(p_transaction_reference,transaction_reference),expired_at=case when p_status='expired' then coalesce(p_verified_at,now()) else expired_at end,verified_at=coalesce(p_verified_at,now()) where id=v_payment.id;
  update public.orders set order_status=case when p_status='expired' then 'expired'::public.order_status else 'cancelled'::public.order_status end,cancelled_at=case when p_status='failed' then now() else cancelled_at end where id=p_order_id and order_status in ('payment_pending','paid');
  perform private.release_stock(p_order_id,case when p_status='expired' then 'expired'::public.stock_reservation_status else 'released'::public.stock_reservation_status end);
  select * into v_order from public.orders where id=p_order_id;
  if v_order.customer_id is not null then perform private.create_notification(v_order.customer_id,p_order_id,'payment_failed',case when p_status='expired' then 'Pembayaran kedaluwarsa' else 'Pembayaran gagal' end,'Pembayaran order '||v_order.order_number||' tidak berhasil.'); end if;
  return true;
 else raise exception 'Unsupported payment status for verification';
 end if;
end;$function$;