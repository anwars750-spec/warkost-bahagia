-- Payment V1: customer can read own payment, but cannot mutate it.
revoke insert, update, delete on public.payments from authenticated;
-- Keep SELECT through existing RLS. Server-side verification remains private.verify_payment.
