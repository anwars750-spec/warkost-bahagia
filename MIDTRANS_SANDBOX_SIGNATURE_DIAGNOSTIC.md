# Midtrans Sandbox — read-only signature diagnosis (2026-11-15)

## Scope / safety

- Sandbox UAT ONLY. Production is not activated. Do not change payment status, credentials, webhook verification, or settlement logic.
- The existing production-facing webhook returns HTTP 401 on invalid signature. **Keep that security boundary.**
- Formula confirmed against Midtrans official docs: SHA512(order_id + status_code + gross_amount + ServerKey), on the exact, original STRING fields.
- Current UAT evidence: runtime Sandbox Server Key matches configured process and GET Status returns settlement, but received callback signature mismatch remains unexplained. This tool does **not** claim that error is fixed.
- The diagnostic is offline, read-only. It makes **no network requests** and **no database writes**.

## Procedure (authorized UAT operator)

1. Obtain the exact, untouched webhook JSON as sent by Midtrans for a specific transaction. Do not use a manually retyped notification or a GET Status response. Preserve original string spellings like "22000.00".
2. Store the callback temporarily in an access-restricted file **outside the git repository**. Never upload that file, the signature, Server Key or customer data to a GitHub issue or chat.
3. On the UAT host, load the **existing Sandbox** environment through the approved private environment-loading procedure. Ensure the process has MIDTRANS_SANDBOX_SERVER_KEY and MIDTRANS_SANDBOX_MERCHANT_ID; never echo or paste their values.
4. Run from the repository root (after this diagnostic branch is checked out, NOT on the live service):

   node --test tests/diagnose-midtrans-signature.test.mjs
   node scripts/diagnose-midtrans-signature.mjs < /secure/path/original-midtrans-notification.json

5. Share only the *sanitized diagnostic JSON* with the developer. Remove the temporary webhook file securely under your data-retention policy.

## Interpret results

- signature_matches_runtime_sandbox_key = true AND merchant_matches_runtime_sandbox_merchant = true: the captured notification is authenticated for the runtime config. Investigate whether the webhook endpoint actually received the *same* payload and used the *same* configuration.
- signature matches = false with alternate_amount_spelling_match not null: possible modification to gross_amount string before verification. This is diagnostic evidence ONLY. Never accept a modified signed payload.
- signature matches = false with merchant matches = false: investigate whether callback belongs to a different merchant account.
- signature matches = false without an alternate spelling match: verify the raw signed notification and its originating Sandbox merchant against the runtime Sandbox Server Key; escalate the minimal safe evidence to Midtrans technical integration.
- Cannot diagnose / missing fields: the body may not be an original notification JSON. HTTP 401 from an **empty test POST** is the expected secure response, not proof that genuine signed callbacks are broken.

## Acceptance criteria for eventual fix (NOT satisfied by this PR)

- Genuine Midtrans Sandbox callback authenticated and HTTP 200.
- Payment status PAID only after verified provider observation.
- Duplicate / replay webhook is idempotent.
- One stock movement, one kitchen/admin print enqueue and no duplicated business effects.
- Forged signature is rejected with HTTP 401.
- Production OFF until Midtrans enables the account and production-specific UAT is approved.

## Audit trail

Verified repository branch: work/go-live-safety-brakes-v1. Previously deployed UAT commit reported as 41d4787. Read-only diagnostic isolated in diagnostic/midtrans-sandbox-signature-20261115.
