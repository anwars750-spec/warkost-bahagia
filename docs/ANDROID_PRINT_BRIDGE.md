# Android Print Bridge — vendor-neutral capability profiles (Issue 16 / PR 17)

This is a generic NETWORK ESC/POS adapter, not universal-all-hardware acceptance. There is no tablet/printer brand, model list, manufacturer SDK or PC dependency. Device model information is needed for physical compatibility evidence, not to begin coding or code review. Base RC a7260cf; staging/PR15/database/migration037/payment/Geoapify are outside this change.

## Compatibility matrix

| Capability | Software support | Physical evidence |
|---|---|---|
| Android 8+ (minSdk26), LAN/Ethernet/Wi-Fi standard raw TCP ESC/POS, primary 80mm target | IMPLEMENTED, generic adapter | PENDING for each tablet/printer pair |
| Configured private IPv4 + port 1–65535, bounded timeout | IMPLEMENTED; 9100 is only an existing default | Verify actual raw ESC/POS listener, firewall and network |
| 80mm / 58mm, font A/B and configured columns | IMPLEMENTED; 58mm is an additional variant, not the primary release target | Verify printable dots, font pitch and wrapping |
| Cutter NONE, FULL, PARTIAL; GS V mode0/1 or mode65/66 | IMPLEMENTED by explicit profile | Verify device supports selected operation; NONE emits no cut |
| ASCII transliteration / CP437 / CP858, explicit ESC t index | IMPLEMENTED byte encoders | Verify printer table index/manual and representative characters |
| UTF-8, CJK/raster glyphs, other codepages or arbitrary command dialects | UNSUPPORTED in this adapter; reject configuration/unsupported glyphs | Requires separately reviewed encoding/dialect adapter |
| Intentional copies 1–5 | IMPLEMENTED in one labelled, bounded payload/lease | Count intended paper copies and cuts |
| USB / Bluetooth-only printers | REQUIRES ADAPTER — NOT IMPLEMENTED | Android USB host/OTG, device permission or Bluetooth protocol/runtime permissions, reconnect and duplicate tests required |
| IPP/LPD, PCL/PostScript/PDF, vendor proprietary protocol | REQUIRES ADAPTER / may be unsupported | A configurable port does not implement another protocol |
| Paper/cutter sensors or exact paper delivery ACK | NOT IMPLEMENTED / not universally available | SENT is not paper confirmation; human verification required |

Support means implemented and tested against simulators, not guaranteed operation on every device. In particular a listener on port515 is not automatically a raw printer: LPD/IPP framing is not implemented. No automatic port scan, discovery, public IP, DNS printer host, printer Internet forwarding, USB fallback or manufacturer SDK is used.

## Profiles and existing Owner settings

Use the existing Owner Printer settings, independently for Admin and Kitchen. No database/table/schema or new Admin panel is created. New profile JSON uses existing settings keys printer_admin_profile / printer_kitchen_profile when Owner explicitly saves in an approved environment. Nothing is backfilled or changed on active staging.

Example capability declaration (not a model recommendation):

```json
{
  "adapter": "ESC_POS_NETWORK",
  "paperWidth": 80,
  "font": "A",
  "columns": 48,
  "characterSet": "ASCII",
  "codePage": null,
  "cutMode": "FULL",
  "cutCommand": "GS_V",
  "feedLines": 4,
  "copies": 1
}
```

Connection values remain existing host/port/timeoutMs fields. The renderer receives the normalized profile. Width and copies remain compatible with legacy top-level fields; contradictory duplicate values are rejected. Both the API and Android refuse unimplemented adapters and invalid capabilities. USB settings can remain stored for compatibility but do not report ready for this bridge.

Limits: width58 fontA at most32 columns/fontB42; width80 fontA48/fontB64, minimum16 columns. These are software bounds for standard font commands, not automatic knowledge of a printer's actual pitch. Operator chooses a verified lower count if needed. Each copy initializes font with ESC M, then optional ESC t codepage. CP437/CP858 require an explicit 0–255 page index from the device manual; numeric indexes vary by firmware. Missing index or unrepresentable text is rejected before a lease is persisted. ASCII is explicitly transliterated/replaces unavailable glyphs, not Unicode support. C0/C1/ESC control input is removed; no free-form command bytes are accepted.

FULL/PARTIAL with GS_V emits modes0/1; GS_V_FEED emits65/66 with zero additional dot feed after the configured line feed. NONE emits no cutter instruction. A final line terminator is always sent, including feedLines=0; extra blank feed lines can be0–8. Every intentional copy is labelled SALINAN n/N and rendered into the same SHA256-protected payload (maximum64KiB). Lost ACK never resends the bundle. A partial bundle is UNKNOWN; the operator must count actual copies before an explicit manual reprint.

## Protocol and security

All agent calls are authenticated HTTPS POST /api/print-bridge/{action}, no-store, bounded JSON, no permissive CORS, redirects or TLS bypass. Owner session + same-origin checks protect enrollment/revocation. Enrollment code: random256-bit, single-use, five minutes. Device bearer: station-only, seven days, hashed at rest on server; no admin password/session on tablet. Owner can revoke deviceId. Never paste codes, tokens, customer payloads or secrets into chat/logs.

Protocol2 claim body requires protocol=2, profileVersion=1, adapters=[ESC_POS_NETWORK]. Old APKs without capability negotiation cannot consume new leases. Response carries immutable bytes+SHA256, station/printerKey, connection {adapter,host,port,timeoutMs} and profile. Android validates version, supported capability fields, private host and Owner host mapping, and uses the supplied port/timeout. Connection profiles are not persisted in the journal: restart remains ACK-only. A connection/profile hash is frozen with the claim; any Owner config change or disable before begin rejects the old authorization without printing.

Routing remains Owner-approved: **Admin full transaction/all items; Kitchen prep_station=KITCHEN only, no address or financial totals.** Pickup/Delivery follows the persisted order. UNIQUE(order_id,station), row-locked claims, secret lease fences, bounded pre-begin offline retries/backoff, and transactional audit remain intact. MySQL JSON objects and SQLite strings are both supported.

State meanings:
- QUEUED: eligible only with explicit enabled/autoPrint/configured NETWORK_AGENT and simulation OFF.
- SIMULATED: never physical success; explicit reconciliation/requeue required.
- UNVERIFIED: pre-bridge records, including old QUEUED/FAILED/PRINTED; no automatic adoption or silent rewrite.
- CLAIMED: 30-second pre-send lease. Expiry before begin is safely reclaimable; old begin is fenced.
- PRINTING: one committed begin authorization; Android records durable intent BEFORE asking begin. Expiry becomes UNKNOWN, not auto-retry.
- SENT: socket bytes written, not proof of paper or cut.
- UNKNOWN: potential partial send; hold for operator reconciliation.
- FAILED: connect failed before begin, at most three attempts with bounded backoff per manual cycle.
- CONFIRMED: authenticated station operator checked paper. Only this stamps legacy PRINTED/REPRINTED and printed_at.

Raw SQL status enum alone is not the lifecycle: private metadata is in payload_json and stripped from public job/ticket views. Owner/station audit tracks dispatch; human confirmation is an attestation, not hardware telemetry. Exactly-once paper cannot be guaranteed across a commodity TCP failure boundary; ambiguous sends are deliberately held rather than automatically duplicated.

Journals/config are AES-GCM encrypted using Android Keystore, per-record AAD, fsynced atomic files in Android no-backup storage, explicit cloud/transfer exclusions. Pending journals contain only ID/lease/outcome, not ticket bytes. Restart/lost ACK retries ACK only. Existing manual browser window.print does not acknowledge agent dispatch or physical paper. Reprint requires station authority and duplicate-risk consent; active printing cannot be automatically requeued.

## Android installation / upgrade (no PC in daily operation)

1. Review exact-commit PR17 and successful CI; download android-print-bridge-uat artifact on tablet browser, extract APK using Files, install only the reviewed UAT APK. Record APK SHA256 and source SHA. It is debug-signed UAT software; release signing/update policy is a separate gate. Resolve jobs and revoke old identity before uninstalling/clearing data to change signing keys.
2. Before a protocol1-to-2 upgrade in a separately approved environment, stop agents, drain/reconcile pending jobs, preserve encrypted journals and deploy/update server+APK coherently. Old pending ACKs remain processable; no old client may claim a new profile. No live change is authorized by this guide.
3. Use two distinct raw TCP endpoints (private IPv4 + port) on a trusted LAN; one shared private host with different ports is allowed when verified raw forwarding is available. Reserve addresses and verify each listener accepts raw ESC/POS at its configured port. Restrict LAN access to the tablet. Do not expose/forward printer ports to the Internet. Verify actual capabilities with any compatible hardware; a specific brand/model is not a coding prerequisite.
4. After separate approval, set existing Owner device transport NETWORK_AGENT, host, port, paper width, font/columns, text/codepage, cutter/feed, copies and timeout. Explicitly enable autoPrint and disable simulation only in the approved isolated hardware UAT. Review old UNVERIFIED jobs first. Saving a profile is not device acceptance.
5. Owner logs into the approved app and opens /print-bridge; generate one station code and enter it with HTTPS origin and the corresponding private IP in Android. Repeat for the other station. Port/profile comes from Owner/server, not a hardcoded connection. Device IDs are shown for revocation. Reverse proxy must preserve the real HTTPS scheme recognized by Next; do not bypass the guard or trust arbitrary forwarded headers.
6. Allow notifications and start bridge while the app is visible. Keep the foreground notification and power/Wi-Fi policy appropriate for the tablet. Android connectedDevice foreground service and OS/OEM battery restrictions remain device-dependent. No background boot-start guarantee: reopen/start after reboot or force-stop.
7. Verify paper in Printer Center. Confirm only after reading the real ticket/order. Stop and let the journal settle before re-pairing; pending journals block pairing. On stranded expired/revoked credentials, reconcile the server job and revoke identity before any explicitly approved app-data reset. Never blindly resend UNKNOWN or a partially printed multi-copy bundle.

## Verification / hardware release gate

Automated tests cover widths/fonts/columns, codepage byte accuracy, cut/no-cut variants, configurable ports, copy bundles, unsupported capability refusal, version negotiation, Owner config freeze, ACLs, concurrent leases, simulated/historical truthfulness, offline backoff, database rollback and encrypted-journal sender restart behavior. Native JVM tests execute the shipped sender against fake TCP, including a non-9100 ephemeral endpoint through an injected dialer. CI uses synthetic SQLite and an EMPTY disposable MySQL8 fixture; no migration or staging connection. APK build/lint is distinct from Android runtime/device acceptance.

Physical evidence is still mandatory to close Issue16: at least two compatible real printers and an Android tablet; one Pickup and Delivery with food/nonfood; Admin full receipt vs Kitchen food-only; actual text/width/characters/page index, configured port, full/partial/no-cut as available, intended copy count, paper-out/offline/reconnect, lost ACK/restart, screen lock/Wi-Fi sleep/charger removal, force-stop/reboot, token rotation, and no unintended duplicate. Record actual models/firmware/Android for the evidence, not as a software allowlist. Unsupported features require an adapter or are explicitly rejected; do not mark all printer types PASS from fake TCP.

No deploy, merge, active settings/database/schema changes, migration037, Midtrans Production or Geoapify activation is included.

References (command examples, not a brand dependency): [ESC/POS cut variants](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html), [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [Android backup rules](https://developer.android.com/identity/data/autobackup).
