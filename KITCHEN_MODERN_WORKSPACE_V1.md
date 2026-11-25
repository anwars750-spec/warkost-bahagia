# Kitchen modern workspace V1

Date: 2026-10-29
Branch: work/customer-qris-demo-uat-v1
Base: 85f33c57d476b5bdbcbdbdcb9778beef7dc56456
Status: implementation verified locally; PRODUCT OWNER UAT REQUIRED.

## Root cause

Kitchen rendered native panels in page.js, then global runtimes inferred the active workspace from headings, body flags and existing DOM. The dashboard/stock portals depended on main being present when observers attached. Separate click-intent, portal and CSS lifecycles could disagree with React view during session restore or navigation. Refresh also discarded the selected Kitchen view. Hiding the resulting native panel did not remove these competing sources of truth.

## Authoritative rendering

page.js now selects the approved modern Dashboard, Stock Center and Printer directly from authenticated role and React view. Navigation active class and aria-current use that same view. KitchenWorkspace applies existing presentation flags before paint and saves only an allowlisted per-user workspace in sessionStorage; initial authenticated restore reads it before rendering a Kitchen workspace. Storage is UI-only, catches unavailable storage, and defaults to Dapur. Explicit login still starts at Dapur.

The Kitchen notification popover and confirmed logout retain their existing behavior. Their lifecycle is scoped to the authenticated Kitchen workspace and semantic button attributes, without a global header observer. Badge updates use React state. Navigation closes the current popover.

## Removed legacy path

- Kitchen cannot render the native order list, stock panel, printer panel or notification page.
- Removed KitchenDashboardMount.js, KitchenFlashGuard.js, KitchenStockImageSync.js and kitchen-flash-guard.css and their global layout mounts.
- Removed dashboard/stock DOM detection, portal takeover, navigation mutation, delayed synchronization and native-panel hiding.
- PrinterCenterRuntime remains available only for Owner; modern Kitchen Printer uses the shared React printer with Kitchen scope. Admin remains the default scope.
- Product images now belong to Stock React markup, preserving existing image matching and food fallbacks.

## Files and boundaries

Application changes: page.js, layout.js, KitchenWorkspace.js, kitchen-workspace-state.mjs, KitchenDashboardFast.js, KitchenStockCenter.js, KitchenHeaderActions.js, AdminPrinterView.js and PrinterCenterRuntime.js. Existing Kitchen and printer CSS is adapted to the direct React roots without redesign.

Regression coverage: tests/kitchen-workspace.test.mjs, tests/uat/kitchen-workspace.spec.mjs and tests/uat/kitchen-role-safety.spec.mjs. Existing Admin source contracts were updated for the removed Kitchen legacy branches. The existing staging-release browser helper now waits for authenticated content before measuring responsive dimensions rather than sampling the neutral session-restore frame.

No API, database/schema, migration, stock permission, payment/QRIS, delivery or order business-rule files changed. Stock remains GET-only and food-only; station transitions and printer retry preserve their existing requests. Owner and Manager stock paths remain available. Dashboard, Stock and Printer retain polling/focus/realtime recovery as applicable; pending Dashboard/Stock reads are aborted on unmount.

## Validation

- Full safe unit/regression suite: 532/532 PASS.
- Production build: PASS, Next.js 16.4.3, all 33 static pages generated.
- Dedicated Kitchen browser regression: 10/10 PASS (desktop/mobile), including repeated navigation, one active item, cache-bypass reload, no legacy copy/placeholder, notifications, station transitions, Kitchen printer retry, late/failing requests and stock realtime.
- Admin browser regression: 12/12 PASS (desktop/mobile).
- Existing Staging UAT browser suite: 14/14 PASS (desktop/mobile, all six roles plus guest).
- Real-session Kitchen/Manager/Owner browser safety: 6/6 PASS (desktop/mobile), including modern Stock cache-bypass refresh, Manager stock controls and Owner read-only stock modal. Total unique browser coverage: 42 passing cases across the four suites.
- Browser gates use the production bundle and a new isolated local SQLite fixture. API fixtures are used for deterministic Kitchen/Admin interaction tests; real-session safety and existing staging-release tests use the local backend. No production database or secrets were changed.
- New browser harness corrections covered password-toggle label ambiguity, Manager textbox semantics, the existing Owner stock action spelling/arrow, and independent role sessions. The final dedicated role safety run passed all six cases; no Manager/Owner product change was required.
- MySQL Recovery and hosted GitHub Staging UAT were not triggered: this work is not pushed. Local browser results do not claim a hosted MySQL CI pass.
- git diff --check: PASS.

## Remaining acceptance

Product Owner must manually confirm desktop/mobile Kitchen login, Stock hard refresh (Ctrl+Shift+R), Dapur -> Stock -> Printer -> Dapur -> Stock, notifications, and a real thermal printer. Browser retry verification does not prove physical print delivery. No push, merge or deployment was performed.
