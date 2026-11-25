# Realtime Operations V1

Realtime Operations V1 is a foreground, server-to-client update channel. It supplements the existing APIs; it does not replace their validation, authorization, transactions, or manual refresh controls.

## Architecture

- `GET /api/realtime` is an SSE endpoint authenticated with the existing `wb_session` HTTP-only cookie. No credential or session token is accepted through the URL.
- The server publishes small domain signals after a business transaction commits. Raw database rows and audience identifiers are not sent to the browser.
- Update audience and sound audience are separate, server-authoritative policies. Role broadcasts and explicit user recipients are evaluated before an event is written to a connection; the browser receives only its own `audible` decision, never either raw audience.
- The browser coalesces event bursts and refetches only the relevant existing API data. After a real disconnect, the first recovered connection emits one silent recovery signal so visible role-specific state is fetched immediately. Initial connection does not emit recovery. Fallback polling remains at 120 seconds and manual refresh remains available.
- The stream sends a 15-second heartbeat and revalidates the session. Normal logout revokes only the current token and closes only that browser's event source; other valid sessions for the same account remain connected. Account deactivation, remote password reset, and staff password revocation remain user-wide and force all protected UIs back to authentication after `/api/me` confirms revocation.
- Reconnect uses bounded exponential backoff. Event and sound IDs are held in bounded client sets to avoid duplicate processing.
- Authoritative idempotency results propagate as `replayed`; replay events may refresh data but are made inaudible on the server and rejected again by the client sound guard.
- A self-service password change uses an explicit session-rotation handshake: the old stream closes, the replacement cookie is confirmed through `/api/me`, and realtime reconnects without leaving the protected UI. Remote reset/deactivation remains fail-closed.

The V1 hub is process-local and requires no database migration. A horizontally scaled production deployment must add a shared authenticated pub/sub adapter (for example Redis) behind the same publisher/subscriber contract; separate server instances cannot share an in-memory event hub.

## Audience matrix

| Event | Role audience | Explicit audience |
| --- | --- | --- |
| `ORDER_CREATED` | Admin, Manager, Owner | Customer who placed the order |
| `KITCHEN_ORDER_CREATED` | Kitchen, only when persisted order items include Kitchen work | — |
| `ORDER_STATUS_CHANGED` / `ORDER_CANCELLED` | Admin, Manager, Owner; Kitchen only for Kitchen-routed orders | Order customer and assigned Driver |
| `KITCHEN_ORDER_READY` | Admin, Driver, Manager, Owner | Order customer and assigned Driver |
| `DRIVER_ASSIGNMENT_CHANGED` / `DELIVERY_STATUS_CHANGED` | Admin, Manager, Owner | Order customer and assigned Driver |
| `PAYMENT_STATUS_CHANGED` / `PAYMENT_PAID` | Admin, Manager, Owner | Order customer and assigned Driver when relevant |
| `COD_STATUS_CHANGED` / `SETTLEMENT_STATUS_CHANGED` | Admin, Manager, Owner | Related customer and Driver |
| `STOCK_CHANGED` | Customer, Admin, Kitchen, Manager, Owner | — |
| `PRODUCT_LOW_STOCK` / `PRODUCT_OUT_OF_STOCK` | Manager, Owner | — |
| `PROMO_CHANGED` | Customer, Admin, Manager, Owner | — |
| `LOYALTY_CHANGED` | Owner | Affected customer |
| `STAFF_CHANGED` | Manager, Owner (or Owner-only for Owner operator data) | — |
| `PRINTER_STATUS_CHANGED` | Admin, Kitchen, Owner | — |
| `CONVERSATION_CHANGED` | — | Authorized conversation participants; active Admin users for Customer–Admin threads |

Customer and Driver order events are never broadcast to every customer/driver. They use the order/conversation ownership resolved by the server.
COD batch recipients are resolved exclusively from the authoritative batch order list. A batch identifier is never interpreted as an order identifier.

## Foreground notification sound

- The preference is stored locally as Sound ON/OFF and defaults to ON.
- The audio context is created or resumed only after a real pointer or keyboard gesture. The runtime never loops on an autoplay failure and never requests browser notification permission on page load.
- Only new actionable events explicitly marked audible for that authenticated subscriber may play a short sound. Ordinary refresh signals are silent, old/replayed event IDs are silent, and every event can sound at most once.
- Admin receives audible new-order/action-required payment signals. Kitchen receives only Kitchen-routed work. Driver and customer sounds are ownership-scoped. Manager/Owner receive selected stock/control alerts and do not ring for every customer order.
- Cash sounds follow workflow ownership: Admin shift start and Manager self-verification are silent; Manager submission alerts Owner; Owner rejection alerts only the submitting Manager; replayed settlements remain silent.
- Logout closes the event source, so no further notification sound can be triggered for that session.

## Browser limitation

This milestone only covers foreground realtime. SSE and audio are not guaranteed while a browser tab is suspended, a phone is locked, or a PWA/browser process is terminated. Background Web Push and Service Worker delivery are intentionally deferred.
