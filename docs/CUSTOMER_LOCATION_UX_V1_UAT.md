# CUSTOMER LOCATION UX V1 — UAT LOCK

Status: UI/UX implementation candidate
Branch: `ui/customer-maps-location-v1`
Scope owner: Customer UI/UX only

## Product goal

Customer can choose a delivery location with a simple mobile-first flow:

`Search / saved / current location → confirm location → see delivery quote → add delivery detail → use location → checkout`

The interaction pattern may feel familiar to modern delivery apps, but the visual identity remains Warkost Bahagia.

## Locked screen flow

### 1. Pilih lokasi

Must show:
- back/close action
- title `Pilih lokasi`
- search field `Cari alamat, gedung, atau tempat...`
- `Gunakan lokasi saat ini`
- saved addresses when query is empty
- manual-address fallback

Search behavior contract:
- minimum 3 characters
- debounce approximately 500 ms
- stale requests ignored/cancelled
- loading state visible
- clear-search action available

### 2. Search results

Each result must prioritize:
1. place/POI name
2. readable secondary address
3. large, comfortable tap target

Do not display raw latitude/longitude to Customer.

### 3. Konfirmasi lokasi

Must show:
- map preview area
- selected place name
- formatted address
- distance from Warkost
- delivery fee
- estimated travel time when available
- delivery detail/patokan field
- label chips: Rumah / Kantor / Lainnya
- primary CTA `GUNAKAN LOKASI INI`

### 4. Free-delivery state

When backend quote says free delivery:
- show `GRATIS`
- show `GRATIS ONGKIR` confirmation
- CTA remains enabled

UI must not independently decide the free-delivery threshold.

### 5. Paid-delivery state

When location is eligible but not free:
- show actual delivery fee from backend
- show distance
- CTA remains enabled

UI must not calculate pricing independently.

### 6. Out-of-range state

When backend quote marks location ineligible:
- show `Di luar jangkauan pengantaran Warkost`
- supporting copy: `Lokasi ini belum dapat kami layani.`
- do not show a misleading fee
- `GUNAKAN LOKASI INI` must not be available
- show `Cari lokasi lain`

### 7. Current-location state

When Customer taps `Gunakan lokasi saat ini`:
- show `Mencari lokasimu...`
- browser geolocation is requested
- after coordinates resolve, confirmation screen is shown
- readable address is used when reverse geocoding is available

Permission denied:
- show friendly message
- Customer can continue using search/manual/saved address

### 8. Provider unavailable / zero-bill cap reached

Never expose technical errors such as API key, 403, quota code, or provider stack traces.

Customer-facing behavior:
- explain automatic search is temporarily unavailable
- saved addresses remain available
- manual address remains available
- checkout UI must not crash

### 9. Manual fallback

Manual address remains a first-class fallback.

Must collect:
- address
- delivery detail/patokan
- label

The existing Warkost address-save flow remains the persistence path.

## Mobile quality gate

Target: 360–430 px.

PASS only when:
- no horizontal overflow
- search input remains easy to reach
- buttons/tap rows are comfortably sized
- text remains readable without zoom
- bottom CTA respects phone safe area
- modal/sheet scroll does not scroll the page behind it
- keyboard does not make the primary fields unusable

## Regression guard

This UI milestone must not change:
- realtime system
- notification sounds
- order lifecycle
- COD settlement
- Admin operational behavior
- Kitchen routing
- Driver state machine
- Manager UI
- Owner UI
- payment rules
- voucher/loyalty rules
- inventory/printer logic

## Manual UAT order

1. Open Customer checkout.
2. Tap add/select another location.
3. Verify dedicated `Pilih lokasi` UX opens.
4. Verify saved addresses are shown.
5. Type fewer than 3 characters — no search request behavior should be visible.
6. Type `citimall` once provider backend exists — recommendations should appear.
7. Select a recommendation — `Konfirmasi lokasi` opens.
8. Verify place/address/map preview/quote presentation.
9. Verify detail and address-label controls.
10. Verify free-delivery state.
11. Verify paid-delivery state.
12. Verify out-of-range state blocks final location CTA.
13. Verify current-location flow.
14. Deny location permission and verify fallback.
15. Simulate provider unavailable and verify manual/saved fallback.
16. Save/use location and verify existing checkout selects the created address.
17. Verify Guest checkout remains usable.
18. Verify authenticated Customer saved-address flow remains usable.

## Lock rule

Do not mark `CUSTOMER MAPS UX V1` as LOCKED until:
- local build passes
- automated tests pass
- mobile visual UAT passes
- selected address successfully returns into existing checkout

Do not merge/deploy from this UI branch before backend integration and final regression review.
