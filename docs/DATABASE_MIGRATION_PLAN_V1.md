# Database Migration Plan V1

Target: Supabase Auth + PostgreSQL + RLS

Core domains:
- identity/profiles
- catalog
- orders
- payments
- fulfillment
- delivery
- stock reservations
- notifications
- loyalty
- sales
- audit
- settings

Critical rules:
1. Payment PAID is server-verified only.
2. Stock uses reservation lifecycle RESERVED -> COMMITTED or RELEASED/EXPIRED.
3. Payment webhook handling is idempotent.
4. Loyalty earning is server-controlled and idempotent.
5. Sales has UNIQUE(order_id).
6. Driver active stops are capped at 5 server-side.
7. Driver pickup requires all required fulfillments READY.
8. Role access is enforced with Supabase RLS plus server-side rules.
9. Historical order delivery address is stored on the order.
