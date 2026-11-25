# Warkost Bahagia — Admin Setoran COD UI Specification

Date recorded: 2026-10-07
Status: **DEFERRED UNTIL COD BACKEND EXISTS**
Owner decision: Do not build a fake/non-functional Setoran COD workflow before the settlement backend is implemented and verified. UI/UX implementation should start only after Work Pack 1 provides the required settlement states, fields, permissions, and APIs.

## Purpose

`Admin → Setoran COD` is the cash-control workspace for reconciling COD money collected by Drivers and physically handed over to Admin.

It must protect Warkost revenue from missing cash, partial handover, duplicate settlement, or fraudulent payment-state changes.

## Required backend dependency

This screen depends on Work Pack 1: COD Settlement Integrity + Payment Guards.

Do not finalize this UI until backend exposes server-authoritative settlement data including at minimum:

- order id / display order number
- assigned driver id + driver name
- customer/order context if needed
- expected COD amount
- amount collected by Driver
- amount submitted/handover amount
- settlement status
- cash-collected timestamp
- driver submission/handover timestamp
- Admin verifier id
- Admin verification timestamp
- discrepancy state/reason where applicable
- audit trail / events
- safe proof/evidence reference if implemented

## Admin Setoran COD screen — final structure

### 1. Header

Title: `Setoran COD`
Subtitle: `Verifikasi uang tunai dari Driver sebelum pembayaran COD dinyatakan lunas.`

Optional date selector may be added later for historical review, but default view should prioritize unsettled/current items.

### 2. KPI summary

Display compact operational KPI cards:

- `Menunggu Setoran` — delivered COD orders whose cash has not yet been submitted by Driver
- `Menunggu Verifikasi` — Driver has submitted cash; Admin has not verified
- `Selesai Hari Ini` — settlements verified today
- `Total COD Belum Disetor` — server-authoritative expected amount still outstanding
- `Total Diverifikasi Hari Ini` — amount successfully verified today
- `Selisih / Bermasalah` — unresolved discrepancy count or amount

Do not calculate critical settlement totals only from client-side state when server aggregates are available.

### 3. Filters and search

Search by:

- order number
- Driver name
- customer name where available

Filters:

- Semua
- Menunggu Setoran
- Menunggu Verifikasi
- Selisih
- Selesai

Optional date filter after historical backend support exists.

### 4. Settlement card / table row

Each settlement item should show enough information without opening detail:

- order number
- Driver name
- delivery completion time
- expected COD amount
- amount submitted
- difference if any
- settlement status
- age / how long outstanding

Recommended status labels:

- `MENUNGGU SETORAN`
- `MENUNGGU VERIFIKASI`
- `SELISIH`
- `SELESAI`

Do not expose a generic `Tandai lunas` action on these cards.

### 5. Settlement detail modal

Clicking `Lihat detail` should open a modal, not expand a long inline panel.

Detail should include:

#### Order
- order number
- completed/delivered timestamp
- COD expected amount
- payment status

#### Driver
- Driver name
- cash-collected timestamp
- submitted/handover timestamp

#### Reconciliation
- expected amount
- amount submitted
- difference
- current settlement status

#### Audit
- Driver collection event
- Driver submission event
- Admin verification event
- verifier identity
- timestamps

#### Evidence
If Work implements receipt/photo/proof reference, show it read-only with a safe preview/link.

### 6. Admin verification action

Primary action should appear only when backend says settlement is eligible for verification.

Recommended action:

`Konfirmasi Setoran Diterima`

Before confirmation, Admin should see a confirmation dialog containing:

- order number
- Driver
- expected amount
- submitted amount
- explicit warning that final confirmation makes COD payment eligible to become `PAID`

The frontend must never decide eligibility on its own; use server state/capability response.

### 7. Amount discrepancy

If submitted amount is not equal to expected amount:

- do not allow silent final settlement
- show a clear `SELISIH` state
- show expected, submitted, and difference
- keep the case unresolved
- do not automatically mark payment `PAID`

Any future discrepancy-resolution flow must be explicitly designed and authorized; do not invent one in UI before business rules are approved.

### 8. Payment relationship

For COD:

`Driver collected cash` ≠ `Payment PAID`

Required flow:

`DELIVERED / cash collected` → `SETTLEMENT_PENDING` → Driver submits cash → Admin verifies full cash → final `PAID`

The Setoran COD screen must reflect this distinction clearly.

### 9. Security / role rules

Admin:
- can see COD settlement items required for operational verification
- can verify only eligible submitted settlements
- cannot arbitrarily alter expected COD amount
- cannot prematurely mark payment paid/failed

Driver:
- can only submit settlement for COD money they actually collected from orders assigned to them

Owner:
- may monitor/audit according to Owner permissions

Customer / Kitchen / Manager:
- must not gain settlement-verification capability unless separately approved

### 10. Mobile

Mobile should prioritize one-column cards:

- Order + status
- Driver
- Expected amount
- Submitted amount
- Difference
- `Lihat detail`

Verification action should be easy to reach but protected by the same backend guard and confirmation dialog.

## Do not implement yet

Until Work Pack 1 is complete, do not create simulated settlement records or pretend verification works.

Temporary dashboard CTA may remain informational, but should not offer destructive/financial actions.

## Acceptance gate before UI implementation

Start Setoran COD UI implementation only when Work confirms:

- settlement data model exists
- valid settlement statuses are defined
- Admin settlement API exists
- server-side amount integrity exists
- premature payment transitions are blocked
- RBAC is enforced
- audit trail exists
- targeted COD settlement tests pass

After that backend milestone is accepted, implement and UAT the Setoran COD UI against real backend states.