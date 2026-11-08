import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./customer-pin-map.css";

const mapDataUrl = "/maps/sukabumi-delivery-v1.geojson";
const mapLoadTimeoutMs = 8_000;
let mapDataPromise;

function loadMapData() {
  if (mapDataPromise) return mapDataPromise;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), mapLoadTimeoutMs);
  mapDataPromise = fetch(mapDataUrl, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("Map data unavailable");
      const data = await response.json();
      if (
        data.type !== "FeatureCollection" ||
        !data.features?.length ||
        data.bbox?.length !== 4
      )
        throw new Error("Invalid map data");
      return data;
    })
    .catch((error) => {
      mapDataPromise = null;
      throw error;
    })
    .finally(() => window.clearTimeout(timeout));
  return mapDataPromise;
}

function lineStyle(feature) {
  switch (feature.properties.kind) {
    case "water":
      return { color: "#7bbad1", weight: 2, opacity: 0.85 };
    case "main":
      return { color: "#c59262", weight: 2.6, opacity: 0.95 };
    default:
      return { color: "#9c9b8a", weight: 1.15, opacity: 0.85 };
  }
}

export default function CustomerPinMap({ point, onPick, onMoving }) {
  const host = useRef(null);
  const mapControl = useRef(null);
  const props = useRef({ point, onPick, onMoving });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState("loading");
  const [outsideCoverage, setOutsideCoverage] = useState(false);
  props.current = { point, onPick, onMoving };

  useEffect(() => {
    const controller = new AbortController();
    let map;
    const timeout = window.setTimeout(() => {
      setState("error");
      controller.abort();
    }, mapLoadTimeoutMs);
    async function initialize() {
      try {
        const [leaflet, data, outletResponse] = await Promise.all([
          import("leaflet"),
          loadMapData(),
          fetch("/api/location/preview", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!outletResponse.ok) throw new Error("Outlet location unavailable");
        const { origin } = await outletResponse.json();
        if (controller.signal.aborted) return;
        if (
          !Number.isFinite(origin?.latitude) ||
          !Number.isFinite(origin?.longitude)
        )
          throw new Error("Invalid outlet location");
        const L = leaflet.default ?? leaflet;
        const [west, south, east, north] = data.bbox;
        const bounds = L.latLngBounds([south, west], [north, east]);
        const outlet = L.latLng(origin.latitude, origin.longitude);
        if (!bounds.contains(outlet))
          throw new Error("Outlet outside offline map coverage");

        map = L.map(host.current, {
          minZoom: 12,
          maxZoom: 19,
          maxBounds: bounds,
          maxBoundsViscosity: 1,
          preferCanvas: true,
          inertia: false,
          zoomAnimation: false,
          scrollWheelZoom: false,
          zoomControl: false,
        });
        const withinBounds = (position) =>
          position &&
          Number.isFinite(position.latitude) &&
          Number.isFinite(position.longitude) &&
          bounds.contains([position.latitude, position.longitude]);
        const initial = props.current.point;
        const center = withinBounds(initial)
          ? [initial.latitude, initial.longitude]
          : outlet;
        setOutsideCoverage(Boolean(initial && !withinBounds(initial)));
        map.setView(center, 15);
        L.control
          .zoom({ zoomInTitle: "Perbesar peta", zoomOutTitle: "Perkecil peta" })
          .addTo(map);
        map.attributionControl
          .setPrefix(false)
          .addAttribution(
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>',
          );

        L.geoJSON(data, {
          interactive: false,
          filter: (feature) => feature.geometry.type !== "Point",
          style: lineStyle,
        }).addTo(map);
        const labels = L.geoJSON(data, {
          filter: (feature) => feature.geometry.type === "Point",
          pointToLayer: (feature, latlng) => {
            const text = document.createElement("span");
            text.textContent = feature.properties.name;
            return L.marker(latlng, {
              icon: L.divIcon({
                className: "wloc-map-place-label",
                html: text,
                iconSize: null,
              }),
              interactive: false,
              keyboard: false,
            });
          },
        }).addTo(map);
        const labelVisibility = () => {
          if (map.getZoom() >= 14) labels.addTo(map);
          else labels.remove();
        };
        map.on("zoomend", labelVisibility);
        labelVisibility();

        L.circleMarker(outlet, {
          color: "#fffdfb",
          fillColor: "#326952",
          fillOpacity: 1,
          radius: 6,
          weight: 2,
          interactive: false,
        })
          .addTo(map)
          .bindTooltip("Warkost", {
            permanent: true,
            direction: "bottom",
            className: "wloc-map-outlet",
          });
        const pin = L.marker(center, {
          draggable: true,
          autoPan: true,
          title: "Pin lokasi pengantaran",
          alt: "Pin lokasi pengantaran",
          icon: L.divIcon({
            className: "wloc-delivery-pin",
            html: '<span aria-hidden="true"></span>',
            iconSize: [36, 44],
            iconAnchor: [18, 42],
          }),
        }).addTo(map);
        const select = (latlng) => {
          props.current.onMoving(false);
          if (!bounds.contains(latlng)) {
            const previous = props.current.point;
            pin.setLatLng(
              withinBounds(previous)
                ? [previous.latitude, previous.longitude]
                : map.getCenter(),
            );
            return;
          }
          const latitude = Number(latlng.lat.toFixed(6));
          const longitude = Number(latlng.lng.toFixed(6));
          pin.setLatLng([latitude, longitude]);
          map.panInside(pin.getLatLng(), {
            paddingTopLeft: [35, 52],
            paddingBottomRight: [35, 28],
            animate: false,
          });
          setOutsideCoverage(false);
          props.current.onPick({ latitude, longitude });
        };

        map.on("click", ({ latlng }) => select(latlng));
        map.on("dragstart", () => props.current.onMoving(true));
        map.on("dragend", () => select(map.getCenter()));
        pin.on("dragstart", () => props.current.onMoving(true));
        pin.on("dragend", () => select(pin.getLatLng()));

        mapControl.current = {
          selectCenter: () => select(map.getCenter()),
          show(position) {
            const isInBounds = withinBounds(position);
            setOutsideCoverage(Boolean(position && !isInBounds));
            if (!isInBounds) return;
            const next = L.latLng(position.latitude, position.longitude);
            if (!pin.getLatLng().equals(next, 0.000001)) {
              pin.setLatLng(next);
              map.panTo(next, { animate: false });
            }
          },
        };
        setState("ready");
      } catch {
        map?.remove();
        map = null;
        if (!controller.signal.aborted) setState("error");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    initialize();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      mapControl.current = null;
      map?.remove();
    };
  }, [attempt]);

  useEffect(() => {
    mapControl.current?.show(point);
  }, [point?.latitude, point?.longitude]);

  return (
    <section className="wloc-map-picker" aria-label="Peta lokasi pengantaran">
      <p>
        Geser pin untuk menentukan lokasi pengantaran. Kamu juga bisa menggeser
        peta atau mengetuk titik tujuan.
      </p>
      <div
        className="wloc-leaflet-map"
        ref={host}
        role="region"
        aria-label="Peta interaktif Sukabumi"
        data-map-state={state}
        hidden={state === "error"}
      />
      {state === "loading" && <p role="status">Memuat peta lokasi…</p>}
      {state === "error" && (
        <div className="wloc-alert">
          <p role="alert">
            Peta belum dapat dimuat. Coba lagi atau pilih alamat tersimpan.
          </p>
          <button
            type="button"
            className="wloc-secondary"
            onClick={() => {
              setState("loading");
              setAttempt((count) => count + 1);
            }}
          >
            Coba muat peta lagi
          </button>
        </div>
      )}
      {state === "ready" && outsideCoverage && (
        <p role="status">
          Titik yang dipilih di luar cakupan peta Sukabumi. Pilih titik baru di
          peta untuk menggantinya.
        </p>
      )}
      {state === "ready" && (
        <button
          type="button"
          className="wloc-secondary"
          onClick={() => mapControl.current?.selectCenter()}
        >
          Gunakan titik di tengah peta
        </button>
      )}
    </section>
  );
}
