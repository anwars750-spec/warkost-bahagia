# Customer Service Mobile UI — Locked Interaction Model

Status: UI/UX implemented on `ui/admin-operasional-v1`; backend wiring deferred to Work after weekly quota reset.

## Mobile interaction model

Mobile Customer Service must not reuse the desktop 3-panel layout.

Required mobile flow:

1. Inbox/list view
2. Open one conversation
3. Customer/profile context only when requested

## Inbox view

Keep the mobile inbox compact and scalable for many conversations:

- compact Customer Service header
- summary counters for Baru / Aktif / Selesai
- conversation search field
- three primary filters: Inbox / Aktif / Selesai
- conversation rows/cards must later support:
  - customer avatar/initials
  - customer name
  - latest message preview
  - latest message timestamp
  - unread badge
  - support status
  - related order summary when available

Do not render the desktop conversation and customer context panels simultaneously on mobile.

## Conversation view

When a conversation is selected, mobile should show one focused chat screen:

- back button to inbox
- customer name and identity summary
- customer info action
- related order context when available
- conversation messages
- reply composer

Customer Service itself is internal text chat between Customer and Admin only.

## Calling / WhatsApp rule

- Do not build in-app voice calling for v1.
- If the customer wants to call Warkost, direct them to the configured Warkost WhatsApp contact.
- WhatsApp does not need to synchronize into the internal support inbox in v1.

## Backend handoff guardrail

When Work implements Customer Service backend, connect real conversations/unread counts/messages/order context to this mobile interaction model without redesigning it unless a minimal compatibility change is technically required.
