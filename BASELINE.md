# V0.8.6.2 Baseline

This commit represents the source-code baseline for the Warkost Bahagia Integrated Delivery System.

## Baseline source
Uploaded archive:
Warkost_Bahagia_V08.6.2_Order_Confirmation(1).zip

## Known working flow
- Customer menu/cart/checkout
- Order confirmation popup
- Delivery fee calculation in local test mode
- Role-based login foundation
- Kitchen / Kasir / Driver / Admin / Owner foundations

## Important baseline limitations
- SQLite/local authentication
- Payment simulator is test-only
- Stock is not reservation-based
- Fulfillment is not fully separated by station
- Driver dispatch is not final automatic dispatch
- Supabase/RLS not yet implemented
- Production payment integration not yet implemented
- Google Maps production configuration is pending

## Baseline protection
Do not modify this baseline in place. Create a new feature branch for migration work.
