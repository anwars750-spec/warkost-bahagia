# UI Legacy / Flash Cleanup V1

Date: 2026-10-27
Branch: `work/customer-qris-demo-uat-v1`
Verified base: `dc1dd538a6bb6d02dcdc5802fa4dbd3e10556909`
Status: READY FOR CONTROL CENTER REVIEW (Product Owner UAT remains required)

## Root cause and first-paint trace

1. `App` initially rendered the guest/menu branch while the session request was pending. The authenticated Admin role and default orders view were assigned later by `refresh()`.
2. `page.js` then rendered generic header/main, KPI rows and `Order` markup, plus native customer/stock/printer panels.
3. `AdminUiRuntime` mounted `AdminUiEnhancer` in a passive effect. It added the Admin frame classes, icons, summary and order annotations, and watched main with a MutationObserver using `setTimeout(decorate, 40)`.
4. `AdminOrderCardEnhancer` separately read card text, fetched orders/items, inserted preview markup, and redecorated after nested animation frames. A global `AdminOrderNumberEnhancer` watched the whole body and inserted order numbers after another timeout.
5. Customer, Stock and Printer controllers subsequently hid native content and created replacement workspaces. Stock image/hero polish introduced another fetch/observer pass.

The browser could paint intermediate native markup at several boundaries. Merely shortening the timers would leave multiple owners competing with React on refresh/navigation.

## Architecture before

Unresolved session -> guest workspace -> basic Admin React workspace -> passive effects/observers/timers -> approved final workspace.

## Architecture after

Actual session resolution -> role/view -> final React frame and workspace -> browser paint. Data requests update the existing final component tree.

- While real session I/O is pending, the app renders only a neutral brand header. It does not guess a guest/Admin workspace. There is no artificial delay, workspace visibility mask, or timed loading screen.
- Header, navigation, active state, heading, KPI icons, summary, order cards, previews and order numbers render directly from React props/state.
- Customer, read-only Stock, and Admin Printer screens are direct React children of main, including their search/filter/selection/error/loading state. Their existing endpoints and action payloads are preserved.
- Stock images and hero polish render in the same React tree, eliminating the second image decoration layer.
- The settlement launcher is a React heading child. Its optional pending count loads asynchronously, without delaying or injecting the button.
- Admin detail buttons emit an explicit order-id event; their modal listener is installed before paint. The existing modal renderer is retained, and its native-card capture path remains only for compatibility consumers. Admin buttons no longer fall through to native inline detail.
- `AdminWorkspaceLifecycle` uses a layout effect only for existing body CSS mode flags and compatibility render events used by cash/shift/realtime consumers. It neither constructs nor decorates workspace markup and has no timer/observer.

## Modified files

- `app/page.js`: session resolution boundary, direct final Admin frame/components, role-scoped legacy panel removal, explicit order detail event.
- `app/AdminPresentation.js` (new): approved icon geometry, React daily summary, status grouping, pre-paint compatibility body flags/events.
- `app/AdminOrderCardEnhancer.js`: retained filename, now a React order preview using parent-authoritative order metadata and abortable item loading.
- `app/AdminCustomersEnhancer.js`: retained filename, now a React customer workspace/profile modal with existing Customer Service event contract.
- `app/AdminBeverageStockEnhancerV2.js`: retained filename, now a React stock workspace; original category/stock/promo filtering helpers retained.
- `app/AdminPrinterView.js` (new): Admin-only React Printer Center; same tabs, target/search filters, retry endpoint and detail dialog.
- `app/AdminOrderModalEnhancer.js`: pre-paint event registration and explicit order-id entry, preserving existing detail/settlement behavior.
- `app/AdminCodLauncherButton.js`: direct React launcher; removed DOM target discovery and portal takeover.
- `app/layout.js`: removes global order-number decorator and settlement launcher mounts.
- `app/admin-ui-stability.css`: Admin main stays visible; shared Kitchen/Owner printer portal behavior remains.
- `app/printer-header-frame-fix.css`: existing printer frame styling also applies to direct Admin Printer view.
- `tests/admin-first-paint.test.mjs` (new): source/ownership regression contracts and explicit detail event coverage.
- `tests/uat/admin-first-paint.spec.mjs` (new): safe browser fixtures, DOM mutation/frame monitoring, refresh/repeated navigation, controls, request failure/cancellation, and realtime metadata coverage on desktop/mobile.
- Existing source contracts updated in `tests/admin-ui-stabilization.test.mjs`, `tests/admin-order-filter.test.mjs`, `tests/admin-customers-ui.test.mjs`, `tests/customers.test.mjs`, `tests/owner-customers-activation.test.mjs`, and `tests/realtime-safety-correction.test.mjs` to assert direct React ownership instead of obsolete decorator internals.

## Removed files and evidence

- `app/AdminUiEnhancer.js`: frame/summary/card decoration migrated to React; modal capture already superseded its inline detail presentation.
- `app/AdminOrderNumberEnhancer.js`: React previews now include order numbers at render time; its only layout mount was removed.
- `app/AdminBeverageStockPolish.js`: stock image/hero presentation now rendered directly; its only active Admin mount was removed.

Repository search confirms no remaining app imports of these files. CSS was not mass-deleted: approved visual rules and compatibility rules still serve active UI.

## Retained legacy code and reasons

- `AdminOrderModalEnhancer`, notification popover: user-initiated overlays with existing close, detail, retry/verification and anchoring behavior. They no longer own initial workspace presentation. The order modal retains native-card capture for compatibility.
- `AdminCashControlCenter`, `AdminShiftGateRuntime`, `AdminShiftSettlementRuntime`, `AdminSettlementStabilityBridge`, `AdminCodBatchEventBridge`: active shift continuity, operator PIN, custody, settlement and cross-view session handoff. Removing their observers/events would broaden scope and risk financial workflows.
- `AdminPrinterController` and `PrinterCenterRuntime`: shared Kitchen/Owner printer screens. Admin now mounts `AdminPrinterView`; the other roles are intentionally unchanged.
- Shared `Order` native markup/actions: still needed by Owner/Kitchen/Driver and existing delivery/payment controls. Admin final card markup and preview are rendered directly, with no decorator dependency.
- Existing Admin CSS layers: preserve approved desktop/mobile visuals, including the intentional hiding of sales summary/revenue in Admin Operations. They are not all dead code.

## Customer flash audit

- The unresolved-session guest/menu render was shared with Admin. The small common session boundary prevents that wrong-role first workspace.
- Customer still uses `CustomerCatalogPolish` (passive effect + MutationObserver/animation frame), `CustomerQrisOnlyRuntime` (post-render mutation), and `CustomerAccountAddressLocationFirst` (observers). These are credible separate first-paint/transition risks; this task does not claim the entire Customer UI is flash-free.
- No Customer feature refactor or payment-rule change was made. The original checkout JSX was preserved, including QRIS availability gating. Customer migration requires separate scope/UAT.

## Verification and limits

Executed results: full npm test 528/528 PASS; production build PASS (33/33 pages); Admin desktop/mobile browser suite 8/8 PASS; guest/Customer shared-session browser checks 4/4 PASS. After narrowing unrelated formatting, explicit-event/realtime contracts were rechecked: 21/21 PASS. Browser tests run against the local production build with in-browser API fixtures; mutations are intercepted, never sent to a real backend. They verify rendering/lifecycle and unchanged request contracts, not production account/payment/print execution. Full unit regression covers existing domain/RBAC/security behavior. No destructive legacy UAT script was run.

Screenshots were inspected for Admin Operations mobile and Admin Stock desktop. Existing horizontal mobile navigation and visual CSS remain in use.

No database/schema/API/business-rule/QRIS/delivery changes, secrets or staging environment edits, merge, deployment, or push were performed. This report does not grant Product Owner UAT PASS.

## Regression risk

Main residual risk is visual parity for uncommon data/overlay combinations and retained legacy overlay/shift integrations. Product Owner should validate Admin refresh and navigation, real shift restore/Setoran, live notifications, Printer retry, Customer Service and order detail on desktop/mobile. Customer's remaining decorators require their own follow-up; they were not silently removed.
