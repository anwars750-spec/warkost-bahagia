# V1 Customer Ordering

## Implemented
- Supabase Auth session required.
- Customer role and active profile verified.
- Active products loaded directly from Supabase.
- Cart is client-side only; prices/stock are never trusted for final order totals.
- Checkout uses Google Places address selection.
- Coordinates are sent to a server-side RPC.
- public.create_customer_delivery_order(...) calculates subtotal from current product selling prices, delivery distance/fee, total, and creates the order through private.create_delivery_order.
- Stock reservation and payment PENDING are created transactionally by the existing private business logic.
- Customer cannot execute the RPC as anon.
- Customer order creation does not simulate payment.

## Security model
Frontend is UX only. The authoritative values are calculated server-side.
auth.uid() is used by the RPC to bind the order to the authenticated customer.
RLS remains active for customer-owned orders/order items/payments.

## Current V1 flow
Login -> Customer Workspace -> Menu -> Cart -> Map Address -> Create Order -> Payment PENDING.

## Not yet production
- BTN QRIS callback/webhook integration.
- Google Maps production API key/restrictions.
- Payment UI/deep link/QR presentation.
- Order tracking UI.
- Production deployment configuration.

## Security Advisor note
Supabase may report the customer RPC as an authenticated SECURITY DEFINER function. This is intentional because the RPC is the controlled server-side boundary for price/stock/order creation. It is restricted to authenticated, checks auth.uid() and customer profile, and delegates to private business logic.
Supabase Auth leaked-password protection still needs to be enabled in the Auth settings before production.