# Brake B Midtrans QRIS sandbox

Midtrans transport requires all of these settings on an isolated SQLite environment.

- `DEPLOYMENT_ENV=isolated-uat`
- `PAYMENT_PROVIDER_MODE=midtrans-sandbox`
- An explicit `DATABASE_PATH` for the disposable database and an empty `DATABASE_URL`
- The sandbox merchant ID and sandbox Server Key in `MIDTRANS_SANDBOX_MERCHANT_ID` and `MIDTRANS_SANDBOX_SERVER_KEY`

The server uses the fixed Midtrans sandbox origin and rejects redirects. The QR image is proxied through an authenticated same-origin endpoint. Owner can enable new QRIS from the sandbox reconciliation panel. The setting starts OFF and is audited. Existing callbacks, QR reads and status checks still work while new QRIS is stopped. A charge already authorized when the switch changes can finish in flight.

Checkout stores its intent, merchant and immutable provider order reference before the network call. The worker checks Get Status before retrying a charge and uses the same reference and Idempotency-Key each time. The browser stores the hash and key of an unresolved checkout in its session so retrying the same checkout after a lost response can recover the existing order.

The sandbox webhook is `POST /api/payment/midtrans/webhook`. The server verifies the signed callback and matches it to the stored intent before calling Get Status. Only a matching authenticated observation can mark the payment PAID. Signed callback evidence and verified observations are persisted separately. The core transaction applies the stock, notifications and print queue once. Its existing fulfillment and loyalty rules handle the paid order afterwards.

A verified settlement after local expiry remains an attention case for Owner/Admin with the order reference, transaction ID, amount and settlement time. Operators can recheck the case and record review. The case leaves fulfillment and replacement orders under manual review. Authenticated status checks run without a browser. Polling backs off after expiry, and unresolved transactions continue hourly after the 48-hour attention threshold. A terminal provider status stops automatic polling after that window. Signed callbacks and manual case rechecks remain available.

Official sandbox UAT is pending. It must confirm the merchant's QRIS acquirer, custom expiry, QR response, signed webhook and Get Status shapes and delivery behavior before Control Center and Owner review. Production activation requires separate approval. [QRIS Core API](https://docs.midtrans.com/reference/qris) · [Idempotency](https://docs.midtrans.com/reference/api-headers) · [Webhook](https://docs.midtrans.com/docs/https-notification-webhooks) · [Get Status](https://docs.midtrans.com/docs/get-status-api-requests)

## Local regression with fixture transport

Run the Node suite and production build with provider mode off. Run the browser fixture only on loopback, with a fresh SQLite database. The fixture generates a mock QR and intercepts all sandbox provider requests before network I/O.

```powershell
$env:DATABASE_URL = ''
$env:DATABASE_PATH = './.uat/midtrans-browser.db'
$env:DEPLOYMENT_ENV = 'isolated-uat'
$env:PAYMENT_PROVIDER_MODE = 'midtrans-sandbox'
$env:MIDTRANS_SANDBOX_SERVER_KEY = 'SB-Mid-server-' + [Guid]::NewGuid().ToString()
$env:MIDTRANS_SANDBOX_MERCHANT_ID = 'WARKOST_FIXTURE_MERCHANT'
$env:SESSION_SECRET = [Guid]::NewGuid().ToString()
$env:WARKOST_MIDTRANS_FIXTURE_SETTLEMENT_FILE = Join-Path (Get-Location).Path '.uat/midtrans-settled.txt'
$env:GEOLOCATION_EXTERNAL_ENABLED = 'false'
$env:GEOAPIFY_API_KEY = ''
$env:BASE_URL = 'http://127.0.0.1:3044'
$env:WARKOST_TEST_STORE_NOW_MS = '1792731600000'
node scripts/setup-local-uat.mjs
node --import ./tests/helpers/midtrans-browser-fetch.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3044
```

Run Playwright with the same fixture variables, plus the local fixture password as `SEED_DEMO_PASSWORD`. To include the optional iPhone project, install Playwright WebKit and set `WARKOST_UAT_IOS=1`.

```powershell
node node_modules/@playwright/test/cli.js test tests/uat/midtrans-sandbox.spec.mjs --workers=1
```
