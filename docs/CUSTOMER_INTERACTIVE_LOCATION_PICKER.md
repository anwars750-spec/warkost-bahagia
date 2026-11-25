# Customer interactive location picker

Leaflet 1.9.4 draws the local Sukabumi basemap with Canvas and supports map
drag, a draggable marker, tap/click selection, touch pinch, zoom controls,
and selection from the map centre. It loads only when the picker opens.
MapLibre GL JS uses a WebGL rendering stack designed for styled vector
tiles. The current use case has one bounded geographic extract and a pin,
so Leaflet avoids the additional style and tile machinery.

The app serves a versioned GeoJSON asset from OpenStreetMap under ODbL 1.0.
Attribution appears on the map and the source asset can be downloaded
separately. [Data notice](../public/maps/NOTICE.md)

All map data is served from Warkost and the app has no public tile
dependency. [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

There are no per-view external map charges. The file is 1.21 MB raw and
about 311 kB with gzip. A local production GET negotiated gzip. Budget about
0.31 GB of Warkost bandwidth for 1,000 uncached map downloads, excluding JS
and the internal API. The static snapshot can get stale. Refresh it
deliberately and re-check coverage if the outlet moves or the radius expands.

## Refresh the snapshot

Submit this query once to a permitted OpenStreetMap read-only Overpass
instance, subject to that instance's capacity and usage policy. Store the
JSON response outside the tracked source.

```
[out:json][timeout:30];
(
  way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|primary_link|secondary_link|tertiary_link)$"](-7.035,106.815,-6.808,107.047);
  way["waterway"="river"](-7.035,106.815,-6.808,107.047);
  node["place"~"^(city|town|suburb|village)$"]["name"](-7.035,106.815,-6.808,107.047);
);
out geom;
```

```powershell
python scripts/build-sukabumi-basemap.py .uat/overpass.json public/maps/sukabumi-delivery-v1.geojson
```

Update the notice timestamp and version the asset URL when publishing a
new snapshot. The map uses actual OSM geometry only as a visual aid.
Coordinates come from the pin, a saved address, or an explicitly requested
device location or search suggestion. Local labels are not geocoding.

## Customer flow and failure handling

- Account can select a saved address to edit it or open the map to add one.
  Confirmation fills the existing address form. Saving an edit uses the
  existing replacement path, leaving one active address.
- Checkout can select a saved address or confirm a new pin and address.
  Saving uses the Phase A path, keeps the cart, and obtains a fresh delivery
  quote with the saved address ID.
- The map opens at the selected address when available or the configured
  outlet. Device location recentres it when the customer requests and
  authorizes GPS. Out-of-map points are explained and still checked by the
  server. Location preview waits 350 ms after movement, cancels obsolete
  requests and ignores obsolete responses. Final fees and radius remain
  subject to the existing server checks.
- A failed map shows a retry action. Saved addresses stay accessible and
  GPS can still be used if available. With no saved address and neither
  map nor device location available, a new delivery point requires recovery
  of one of those sources. The address form does not ask for coordinates.

## Browser regression

Use a disposable loopback SQLite fixture with `GEOLOCATION_EXTERNAL_ENABLED=false`
and an empty `GEOAPIFY_API_KEY`. The environment and start procedure are in
[the Checkout performance verification](./CHECKOUT_PERFORMANCE_UAT.md).
With the local server ready, run:

```powershell
node node_modules/@playwright/test/cli.js test tests/uat/customer-location-fallback.spec.mjs tests/uat/customer-geo-brake.spec.mjs tests/uat/customer-checkout-performance.spec.mjs --workers=1
node node_modules/@playwright/test/cli.js install webkit
$env:WARKOST_UAT_IOS = '1'
node node_modules/@playwright/test/cli.js test --project=iphone-webkit --workers=1
```

The map gesture and failure tests write screenshots under their Playwright
output directory. The Chromium mobile project uses touch for taps and drags.
The iPhone profile uses WebKit with touch taps and synthetic touch drag
sequences. Browser emulation does not measure performance or GPS accuracy
on physical phones.
