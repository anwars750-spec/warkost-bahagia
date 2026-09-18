# V1 AUTH + END-TO-END TEST RUNBOOK

## Test users
Created in Supabase Auth:
- customer.test@warkostbahagia.local
- admin.test@warkostbahagia.local
- kasir.test@warkostbahagia.local
- kitchen.test@warkostbahagia.local
- driver.test@warkostbahagia.local

The auth.users INSERT trigger creates public.profiles automatically. Roles were assigned server-side:
customer, admin, kasir, kitchen, driver. Driver record was created and set ONLINE.

## E2E scenario
1. Customer creates mixed FOOD + DRINK delivery order. PASS
2. Stock reservation and payment PENDING. PASS
3. Server-side PAID verification commits stock and creates exactly two fulfillment streams. PASS
4. Kitchen actor operates kitchen fulfillment. PASS
5. Kitchen actor attempting bar fulfillment is rejected. PASS
6. Kasir actor operates bar fulfillment. PASS
7. Kasir actor attempting kitchen fulfillment is rejected. PASS
8. Both streams READY causes order READY_FOR_PICKUP and delivery queue. PASS
9. Admin actor assigns driver. PASS
10. Non-admin dispatch attempt is rejected. PASS
11. Assigned driver pickup. PASS
12. Driver pickup blocked while fulfillment is incomplete. PASS
13. Driver completion without proof photo is rejected. PASS
14. Driver completion with proof photo marks delivery/order completed. PASS
15. Completed order creates exactly one sales row. PASS
16. Completed eligible order creates exactly one loyalty earn. PASS
17. Driver is returned ONLINE and active_trip_id cleared when trip has no active stops. PASS
18. Duplicate completion is rejected. PASS
19. Final stock reflects exactly one committed quantity. PASS

## Max 5
- Server-side assignment rule checks active stops < 5. PASS by implementation review.
- Database trigger delivery_stops_max_five uses transaction advisory locking and rejects a sixth active/pending stop. PASS by implementation review.
- A live six-stop actor integration test remains pending because it requires a multi-stop fixture; do not label this integration test PASS yet.

## Security
- Customer payment modification: server-only function design; direct client EXECUTE revoked. PASS by privilege review.
- Customer cross-order access: RLS policy restricts to own orders. PASS by policy review.
- Kasir cannot operate kitchen fulfillment. PASS.
- Kitchen cannot operate bar fulfillment. PASS.
- Driver actor binding for pickup/completion. PASS.
- Non-admin dispatch rejected. PASS.
- Legacy dispatch/pickup/completion overloads removed. PASS.
- Critical tables have RLS enabled. PASS.
- Sales/Loyalty server-controlled. PASS.

## Exit criteria
Database/business-logic E2E is PASS for the tested transaction path.
Do not merge to main yet. Remaining gate: live Max-5 integration test plus frontend authenticated session testing and production payment/maps/printer integrations.
