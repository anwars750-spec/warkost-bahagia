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

The first stock implementation inserted a custom Stok button directly into the React-owned `<nav>` and appended a custom stock root directly inside the React-owned `<main>`.

Those foreign DOM children could remain present while React reconciled native view changes and periodic dashboard/notification refreshes. This made the UI enhancers compete with the React tree and could cause stale or reverted presentation state.

## Structural fix

1. The legacy stock enhancer is no longer loaded.
2. `AdminBeverageStockEnhancerV2` renders the stock workspace through `#admin-ui-portal-root`, outside the React-owned `<main>` subtree.
3. The Stok navigation control is rendered from the portal layer and positioned visually next to Printer instead of becoming a child of the React-owned `<nav>`.
4. `AdminUiStabilityGuard` removes old stock artifacts, restores stale heading visibility, kicks the Operasional enhancer when its modern summary/tools are missing, and ensures the Printer Center enhancer remounts when the native printer panel is detected.
5. Printer Center roots are moved to the portal layer after creation so they no longer remain as foreign children inside the React-owned main content.

## Acceptance checklist

### Operasional
- [ ] Modern Admin Operasional styling is visible.
- [ ] Daily sales summary is visible.
- [ ] KPI icon cards are visible.
- [ ] Search and status filters are visible.
- [ ] Order cards remain modern after navigating away and back.
- [ ] COD banner appears only where intended.

### Pelanggan
- [ ] Data Pelanggan remains polished.
- [ ] Customer Service desktop remains 3-pane where appropriate.
- [ ] Customer Service mobile remains compact Inbox -> Chat -> Info flow.
- [ ] Customer detail popup still works.

### Stok
- [ ] Stok opens without replacing/corrupting native React navigation.
- [ ] Product images stay synchronized with Customer Menu.
- [ ] Mobile KPI remains 4 columns with centered values.
- [ ] Admin stock remains read-only.
- [ ] Leaving Stok restores the selected native Admin view cleanly.

### Printer
- [ ] Printer Center enhanced UI appears instead of the native panel.
- [ ] Printer nav is active.
- [ ] COD banner is hidden on Printer.
- [ ] Antrean / Riwayat / Status Printer tabs work.
- [ ] Semua / Admin / Kitchen filters work.

### Notifikasi
- [ ] Notification opens as a small anchored popover.
- [ ] It does not navigate to the old inline notification page.
- [ ] Mobile popover remains compact.

## Backend items intentionally not addressed by this UI fix

- `/api/admin-beverage-stock` remains a deferred narrow read-only backend endpoint.
- COD settlement integrity/payment state guards remain Work P0.
- Customer Service persistence/backend remains Work P0.
- Driver communication backend remains Work P1.
