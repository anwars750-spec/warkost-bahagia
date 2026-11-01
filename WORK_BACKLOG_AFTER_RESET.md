# Warkost Bahagia — Work Backlog After Weekly Reset

Date recorded: 2026-10-07
Status: **DO NOT RUN YET — wait for Work weekly quota reset**
Owner decision: UI/UX stays handled outside Work. Work is reserved for backend, business logic, security, data model, concurrency, and test-heavy changes.

## Locked guardrails

- Do **not** redesign Customer UI.
- Do **not** redesign locked Admin Order Detail UI.
- Do **not** redesign approved Admin Customer/Data Pelanggan/Customer Service shell except minimal compatibility changes required by backend wiring.
- Admin may search/view customer data but may **not** deactivate/reactivate accounts, edit loyalty, reset customer passwords, or change account security. Those controls remain Owner-only.
- Manager global Settings remains Owner-only.
- No Admin ↔ Driver chat in v1.
- Customer ↔ Admin communication must use one centralized internal Customer Service system.
- Customer ↔ Driver communication is allowed only after a driver is assigned and only for the active delivery context.
- General/call contact uses WhatsApp as an external action; do not build voice calling inside Warkost v1.
- Preserve existing Driver self-claim dispatch: eligible ONLINE driver, atomic claim, one winner, max 5 active deliveries, no Admin manual assignment.

---

# P0 — Work Pack 1: COD Settlement Integrity + Payment Guards

This is the highest-priority backend milestone after quota reset because it protects cash revenue and prevents fraud/accounting mismatch.

## Critical Admin bug that must be fixed first

A confirmed UAT bug currently exists in Admin Operasional:

> While an order is still actively being processed, Admin can still trigger payment actions that mark the payment as successful/paid or failed/cancelled.

This is a **critical state-integrity bug**, not merely a UI issue.

Required behavior:

- While fulfillment is still running, payment terminal actions must not be available unless the business flow explicitly allows that transition.
- For COD, Admin must not be able to set payment to `PAID` or `FAILED` during preparation/delivery states before the physical cash settlement flow is completed.
- The UI must hide or disable invalid actions such as `Tandai lunas` / `Tandai gagal` when the order state does not permit them.
- The server/API must independently reject the same invalid transitions even if a request is sent manually.
- A page refresh, duplicate request, direct API call, stale browser state, or manipulated client must not bypass the guard.
- Payment state changes must follow an explicit allowed-transition matrix tied to order status and payment method.
- Provider-managed payment methods such as QRIS must not be manually overridden by Admin during an active transaction unless there is a separately authorized reconciliation flow.
- Any rejected transition must leave order/payment state unchanged and must not trigger loyalty, stock, print, notification, or fulfillment side effects.

This bug must be covered by targeted regression tests before Pack 1 is considered complete.

## Required business rules

### A. COD cannot be prematurely marked paid/failed
For COD orders, Admin must **not** be able to mark payment `PAID` or `FAILED` while the order is still in any pre-settlement operational state, including at minimum:

- `PENDING`
- `CONFIRMED`
- `PREPARING`
- `READY`
- `ASSIGNED`
- `PICKED_UP`
- `ON_DELIVERY`

The restriction must be enforced **server-side**, not only by hiding UI buttons.

### B. Delivery cash collection and Admin settlement are separate events
Required flow:

1. Customer pays cash to the assigned Driver at handover.
2. Driver completes delivery / records that COD cash was collected for the exact server-authoritative order amount.
3. Payment must **not** become final `PAID` merely because the Driver says cash was collected.
4. Order enters a settlement state such as `SETTLEMENT_PENDING` / equivalent.
5. Driver must hand over the full COD cash to Admin/cash handling station.
6. Admin confirms physical receipt of the full required amount.
7. Only after successful Admin settlement verification may COD payment become final `PAID`.
8. Loyalty earning continues to follow the existing rule: credit only when order is terminal `DELIVERED` and payment is `PAID`.

### C. Mandatory settlement evidence / audit trail
The system must create auditable evidence that Driver COD money was deposited to Admin.

At minimum persist:

- order id
- assigned driver id
- exact expected COD amount (server authoritative)
- amount reported/received
- cash-collected timestamp
- driver handover/submission timestamp
- Admin verifier id
- Admin verification timestamp
- settlement status
- audit log entries for each transition

If proof attachment/photo/receipt evidence is implemented, store a safe reference and metadata. Do not treat an editable client-entered amount as authoritative.

### D. Full amount integrity
- Settlement cannot finalize if deposited amount is less than the required COD amount.
- No silent partial settlement.
- Any discrepancy must remain visible and unresolved until handled explicitly.
- Repeated requests must be idempotent and must not double-settle.

### E. Fraud and RBAC controls
- Only the assigned Driver can record cash collection for that active order.
- Only authorized Admin/Owner settlement role can confirm receipt.
- Other drivers cannot access or settle the order.
- Customer cannot alter payment settlement state.
- All critical transitions must be server-authoritative and audited.

## Work verification for Pack 1

Targeted tests must cover:

- Admin cannot mark an actively processed COD order `PAID`.
- Admin cannot mark an actively processed COD order `FAILED`/cancel payment while the state forbids it.
- Direct API attempts to bypass hidden/disabled payment buttons are rejected.
- Rejected payment transition leaves payment/order state unchanged and creates no side effects.
- COD premature Admin `PAID` rejected.
- COD premature Admin `FAILED` rejected where business rule prohibits it.
- Driver cash collection requires assigned driver.
- Wrong driver rejected.
- Settlement amount mismatch rejected.
- Admin confirmation required before final `PAID`.
- Duplicate cash collection idempotent.
- Duplicate Admin settlement idempotent.
- Loyalty not earned before final COD settlement.
- Loyalty awarded once after `DELIVERED + PAID`.
- Audit records created.

Run targeted tests first, focused regression second, production build last. STOP after this single verified milestone.

---

# P0 — Work Pack 2: Customer Service Backend

Run only after Pack 1 is completed and checkpointed. Do not combine both into one oversized Work session unless quota is clearly sufficient.

## Communication contract

### A. Internal Customer Service
- Internal chat is **Customer ↔ Admin only**.
- Customer action `Hubungi Admin` must open/create the same centralized support conversation.
- All Admin support chats appear in `Admin → Pelanggan → Customer Service`.
- Do not create multiple parallel Customer↔Admin chat systems.

### B. Conversation data
Support conversations should persist at minimum:

- conversation id
- customer id
- optional related order id
- status: `NEW` / `HANDLING` / `RESOLVED` (or equivalent)
- created_at / updated_at
- last_message_at
- unread counts/state

Messages should persist at minimum:

- conversation id
- sender user id / role
- message body
- created_at
- read state / timestamp where appropriate

### C. Order context
If Customer starts support from a specific order:

- retain `order_id` on the conversation/context
- Admin must be able to see the related order summary without manually searching
- existing locked Order Detail modal should be reused for detailed inspection where technically practical

### D. Inbox behavior
Backend must support the approved UI shell:

- conversation list
- unread badge/count
- latest message preview
- active/handling/resolved state
- selected customer context
- reply composer
- resolve workflow

### E. Security
- Customer can access only their own support conversations.
- Admin can access customer support conversations required by Admin support role.
- Manager/Kitchen/Driver/other Customer accounts must not gain unauthorized access.
- No Admin ↔ Driver chat.
- No permanent Driver access to unrelated customer conversations.

### F. WhatsApp / calling rule
Internal Customer Service remains text chat only.

When Customer wants to call/contact externally:

- action should direct to the configured Warkost WhatsApp number
- do **not** build voice calling inside the app for v1
- WhatsApp does not need to be synchronized into the internal Customer Service inbox in v1

## Work verification for Pack 2

Tests must cover:

- customer creates/opens support conversation
- repeated open uses intended conversation policy without accidental duplicates
- Admin lists conversation
- Admin replies
- customer reads reply
- unread state/count
- status NEW → HANDLING → RESOLVED
- related order context
- customer A cannot read customer B conversation
- unauthorized roles rejected
- persistent messages survive reload

Targeted tests → focused regression → build → checkpoint → STOP.

---

# P1 — Work Pack 3: Customer ↔ Driver Delivery Communication

Do after Customer Service backend unless a delivery UAT blocker makes it urgent.

## Required rules

- Customer ↔ Driver internal contact becomes available only after a driver is assigned.
- Driver can contact only the customer for an order assigned to that driver.
- Customer can contact only the assigned driver for the relevant active delivery.
- Access should end/restrict appropriately after delivery completion; do not expose a permanent customer contact directory to drivers.
- Driver UI should provide `Chat Pelanggan` during the valid assigned/delivery phase.
- Driver may have a `WhatsApp Pelanggan` external action only when allowed by the active assigned-order context and phone data is legitimately available.
- No Admin ↔ Driver chat requirement.

Security and authorization must be server-side.

---

# P1 — Work Pack 4: Admin Historical Daily Summary by Date

UI requirement already identified: Admin needs `Ringkasan Penjualan` for today and previous dates.

Backend requirement:

- support a date parameter for Admin operational dashboard/daily summary, e.g. `YYYY-MM-DD`
- return only the operational daily metrics Admin is allowed to see
- do **not** grant broad Owner reporting permissions merely to support this selector
- prefer a narrow Admin `DASHBOARD_READ`-compatible endpoint/capability rather than exposing full `REPORTS_READ`
- server validates date input and timezone handling

Expected daily summary includes available operational values such as:

- total orders
- verified revenue
- payment counts/statuses
- waiting/preparing/ready/in-delivery/completed counts

Historical selection must not alter order state.

---

# Existing functionality that Work must preserve

These are not new tasks; they are regression guardrails:

- Driver self-claim pool after all required preparation stations are READY.
- Food-only order: Kitchen READY is sufficient for driver pool.
- Beverage-only order: Admin beverage READY is sufficient.
- Mixed order: all required stations must be READY.
- Online eligible Driver self-claims atomically.
- Maximum 5 active deliveries per Driver.
- Admin does not manually assign Driver.
- Admin may search/view customer data.
- Customer deactivate/reactivate remains Owner-only server-side.
- Customer UI remains locked except minimal backend integration wiring.
- Voucher and loyalty non-stacking remains intact.
- Loyalty earn remains based on terminal delivery + `PAID`, idempotent.

---

# UI state at time of backlog record

Handled outside Work:

- Admin Operasional UI polish
- Admin order cards / 3-column desktop layout
- Admin Order Detail modal — **LOCKED**
- Admin Pelanggan split into `Data Pelanggan` and `Customer Service`
- Customer Detail modal polish
- Responsive/UI polish continues outside Work

Work must not spend quota redesigning these screens.

---

# Secondary deferred product items — NOT first Work session

Keep separate from the first reset milestone:

- real production QRIS provider adapter/credentials if still pending
- production SMTP environment/configuration if still pending
- birthday voucher automation
- Maps API integration
- deployment/pilot production configuration

These should be opened only after the active Admin/Driver/COD/communication functional completion is verified.

---

# Execution policy after reset

Use **one Work session = one verified outcome**.

Recommended order:

1. **COD Settlement Integrity + Payment Guards**
2. **Customer Service Backend**
3. **Customer ↔ Driver Delivery Communication**
4. **Admin Historical Daily Summary by Date**
5. Only then revisit secondary deferred production integrations

For every Work session:

- inspect latest repo/checkpoint first
- verify ancestry from latest accepted baseline
- make only scoped backend/functionality changes
- targeted tests
- fix/retest
- focused regression
- production build
- commit
- checkpoint
- handoff bundle if needed
- STOP

Do not consume a reset quota on a broad multi-feature audit or UI redesign.
