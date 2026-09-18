# V1 AUTH + END-TO-END TEST RUNBOOK

## Test users
Create temporary Auth users in Supabase Dashboard:
- customer.test@warkostbahagia.local
- admin.test@warkostbahagia.local
- kasir.test@warkostbahagia.local
- kitchen.test@warkostbahagia.local
- driver.test@warkostbahagia.local

The auth.users INSERT trigger creates a public.profiles row automatically with role=customer.
After creation, set roles for admin/kasir/kitchen/driver through a controlled server-side SQL/migration action. Do not insert auth.users directly.

## Required actor mapping
- customer -> customer
- admin -> admin
- kasir -> kasir
- kitchen -> kitchen
- driver -> driver
- all is_active=true

Driver additionally requires public.drivers.user_id = driver profile id and status=online.

## E2E scenario
1. Customer creates mixed FOOD + DRINK delivery order.
2. Verify stock reservation and payment=pending.
3. Verify PAID server-side; stock commits and exactly two fulfillment streams exist.
4. Kitchen actor: new -> processing -> ready. Verify kitchen cannot transition bar fulfillment.
5. Kasir actor: new -> processing -> ready. Verify kasir cannot transition kitchen fulfillment.
6. Verify order becomes ready_for_pickup only after all required streams are ready.
7. Admin actor assigns driver.
8. Verify driver receives assignment and max active stops remains <=5.
9. Driver actor picks up only when all fulfillment is ready.
10. Driver actor completes delivery with proof photo.
11. Verify order=completed, delivery=delivered, stop=delivered.
12. Verify exactly one sales row per order.
13. Verify exactly one loyalty earn per eligible order.
14. Verify driver returns online when trip has no remaining active stops.
15. Repeat completion/earn attempts and verify no duplicate financial/loyalty effects.

## Security tests
- customer cannot modify payment status
- customer cannot access another customer's order
- kasir cannot transition kitchen fulfillment
- kitchen cannot transition bar fulfillment
- driver cannot pickup another driver's delivery
- driver cannot complete another driver's delivery
- driver cannot exceed 5 active stops
- non-admin cannot assign delivery
- direct client execution of server-only functions is denied

## Exit criteria
All critical tests PASS before merging migration/supabase-v1 into main.
