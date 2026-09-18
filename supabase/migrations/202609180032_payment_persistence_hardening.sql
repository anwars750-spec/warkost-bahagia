create unique index if not exists payments_one_per_order_uidx on public.payments(order_id);

comment on index payments_one_per_order_uidx is
'Payment invariant: one order has one payment record; provider retries update the existing payment.';
