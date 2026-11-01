# Admin UI Regression Audit

Date: 2026-10-07
Scope: Admin UI/UX branch `ui/admin-operasional-v1`

## Regression observed

After adding the Admin beverage stock workspace, several previously enhanced Admin screens could fall back to the native/basic UI after switching views:

- Operasional lost enhanced KPI icons, daily summary, search/filter, and modern order workspace.
- Printer could fall back to the native `Antrean cetak struk 80mm` panel.
- Printer could incorrectly show the Operasional COD banner.
- Active navigation state could become inconsistent after moving between Stok and native React views.

## Root cause

Admin enhancers were mounted globally from `app/layout.js`, regardless of the authenticated role or active React `view`. Multiple body-wide `MutationObserver` instances inferred routes from headings and native panel text, rewrote React-owned navigation, and independently added or removed the same body classes and portal roots.

The floating Stok navigation and successive Printer/Customer stability guards added more competing lifecycle owners. A React render, polling refresh, or delayed observer callback could therefore restore stale content after another enhancer had already switched the visible workspace.

## Structural fix

1. React `role + view` in `app/page.js` is the only Admin workspace lifecycle owner.
2. Admin navigation, including Stok, active state, labels, and icons is rendered by React; no floating navigation or heading-based routing remains.
3. Operasional, Pelanggan, Stok, and Printer enhancers mount only for their matching view and are removed by React on every transition.
4. Printer and Stok keep their approved portal workspaces, but their roots/body classes now exist only for the lifetime of the active view.
5. Customer Service mobile and order-card polish use explicit render events rather than body-wide observers.
6. Obsolete coordinators, singleton guards, legacy Stock/Printer enhancers, polling heartbeats, and CSS route fences were removed.

## Acceptance checklist

### Operasional
- [x] Modern Admin Operasional lifecycle is scoped to `view === "orders"`.
- [x] Daily summary and search/filter are removed on unmount and recreated on return.
- [x] KPI/card polish receives an explicit Operasional render event.
- [x] COD styling is gated by the Operasional body class only.

### Pelanggan
- [x] Data Pelanggan and Customer Service mount only for `view === "customers"`.
- [x] Native customer panel is hidden only during that mount and restored on cleanup.
- [x] Mobile Inbox → Chat → Info enhancement follows explicit customer render events.
- [x] Modal, timers, and mobile roots are removed on view cleanup.

### Stok
- [x] Stok is a native React navigation button with React-owned active state.
- [x] Product image polish observes only the active stock root.
- [x] Existing desktop/mobile stock presentation remains unchanged.
- [x] Admin stock remains read-only.
- [x] Leaving Stok synchronously removes its body class and portal root.

### Printer
- [x] Printer Center mounts directly for `view === "printing"` and hides the native main.
- [x] Printer active state is owned by React.
- [x] Operasional/COD artifacts are removed when the Operasional enhancer unmounts.
- [x] Existing Antrean / Riwayat / Status Printer tabs are preserved.
- [x] Existing Semua / Admin / Kitchen filters and search are preserved.

### Notifikasi
- [x] Notification remains an anchored popover and does not change the Admin view.
- [x] The popover component is keyed to the current view, so navigation removes stale overlays.
- [x] Existing compact mobile presentation remains unchanged.

## Backend items intentionally not addressed by this UI fix

- `/api/admin-beverage-stock` remains a deferred narrow read-only backend endpoint.
- COD settlement integrity/payment state guards remain Work P0.
- Customer Service persistence/backend remains Work P0.
- Driver communication backend remains Work P1.
