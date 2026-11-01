"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const TABS = [
  ["business", "Bisnis"],
  ["location", "Lokasi"],
  ["delivery", "Delivery"],
  ["payment", "Pembayaran"],
  ["printer", "Printer"],
];

const DEVICE_EMPTY = {
  agentPollSeconds: 5,
  admin: {
    station: "ADMIN",
    printerKey: "printer_admin",
    enabled: true,
    transport: "NETWORK_AGENT",
    host: "",
    port: 9100,
    paperWidth: 80,
    autoPrint: true,
    copies: 1,
    timeoutMs: 5000,
  },
  kitchen: {
    station: "KITCHEN",
    printerKey: "printer_kitchen",
    enabled: true,
    transport: "NETWORK_AGENT",
    host: "",
    port: 9100,
    paperWidth: 80,
    autoPrint: true,
    copies: 1,
    timeoutMs: 5000,
  },
};

function sectionKey(section) {
  const heading = section.querySelector("h2")?.textContent?.trim().toLowerCase() || "";
  if (heading.includes("identitas")) return "business";
  if (heading.includes("titik asal")) return "location";
  if (heading.includes("radius")) return "delivery";
  if (heading.includes("batas waktu")) return "payment";
  if (heading.includes("printer operasional")) return "printer";
  return "";
}

function setNativeValue(input, value) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeDevicePayload(value) {
  return {
    agentPollSeconds: Number(value?.agentPollSeconds || 5),
    admin: { ...DEVICE_EMPTY.admin, ...(value?.admin || {}) },
    kitchen: { ...DEVICE_EMPTY.kitchen, ...(value?.kitchen || {}) },
  };
}

async function deviceRequest(body) {
  const response = await fetch("/api/owner-device-settings", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error || "Konfigurasi printer tidak dapat diproses");
  return normalizeDevicePayload(result);
}

function DeviceCard({ title, subtitle, value, onChange }) {
  const patch = (key, next) => onChange({ ...value, [key]: next });
  const ready =
    value.enabled &&
    (value.transport === "USB_AGENT" ||
      (value.transport === "NETWORK_AGENT" && String(value.host || "").trim()));

  return (
    <article className="osx-device-card">
      <header>
        <div>
          <span>{title}</span>
          <strong>{subtitle}</strong>
          <small>{value.printerKey}</small>
        </div>
        <button
          type="button"
          className={`osx-mini-switch ${value.enabled ? "on" : ""}`}
          role="switch"
          aria-checked={Boolean(value.enabled)}
          onClick={() => patch("enabled", !value.enabled)}
        >
          <i />
        </button>
      </header>

      <div className={`osx-device-status ${ready ? "ready" : "setup"}`}>
        <b>{ready ? "Siap untuk print agent" : "Konfigurasi belum lengkap"}</b>
        <span>
          {ready
            ? "Queue sistem sudah memiliki endpoint perangkat yang dapat dibaca print agent lokal."
            : "Lengkapi koneksi perangkat sebelum mode simulasi dimatikan."}
        </span>
      </div>

      <div className="osx-device-fields">
        <label>
          <span>Tipe koneksi</span>
          <select
            value={value.transport}
            onChange={(event) => patch("transport", event.target.value)}
          >
            <option value="NETWORK_AGENT">LAN / Network Agent</option>
            <option value="USB_AGENT">USB melalui Local Agent</option>
          </select>
        </label>
        <label>
          <span>Alamat printer / host</span>
          <input
            value={value.host || ""}
            placeholder={
              value.transport === "NETWORK_AGENT"
                ? "Contoh: 192.168.1.50"
                : "Opsional untuk USB"
            }
            onChange={(event) => patch("host", event.target.value)}
          />
        </label>
        <label>
          <span>Port</span>
          <input
            type="number"
            min="1"
            max="65535"
            value={value.port}
            onChange={(event) => patch("port", Number(event.target.value))}
          />
        </label>
        <label>
          <span>Lebar kertas</span>
          <select
            value={value.paperWidth}
            onChange={(event) => patch("paperWidth", Number(event.target.value))}
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </label>
        <label>
          <span>Jumlah copy</span>
          <input
            type="number"
            min="1"
            max="5"
            value={value.copies}
            onChange={(event) => patch("copies", Number(event.target.value))}
          />
        </label>
        <label>
          <span>Timeout koneksi</span>
          <select
            value={value.timeoutMs}
            onChange={(event) => patch("timeoutMs", Number(event.target.value))}
          >
            <option value={3000}>3 detik</option>
            <option value={5000}>5 detik</option>
            <option value={10000}>10 detik</option>
            <option value={15000}>15 detik</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        className={`osx-auto-print ${value.autoPrint ? "active" : ""}`}
        onClick={() => patch("autoPrint", !value.autoPrint)}
      >
        <span className="osx-mini-switch-static"><i /></span>
        <span>
          <b>Auto print order baru</b>
          <small>
            {value.autoPrint
              ? "Job baru otomatis diarahkan ke perangkat ini."
              : "Job tetap masuk antrean, tetapi tidak diproses otomatis oleh agent."}
          </small>
        </span>
      </button>
    </article>
  );
}

export default function OwnerSettingsExperience() {
  const [root, setRoot] = useState(null);
  const [tabsHost, setTabsHost] = useState(null);
  const [locationHost, setLocationHost] = useState(null);
  const [printerHost, setPrinterHost] = useState(null);
  const [active, setActive] = useState("business");
  const [coords, setCoords] = useState({ lat: -6.9217, lng: 106.9272 });
  const [geoMessage, setGeoMessage] = useState("");
  const [devices, setDevices] = useState(DEVICE_EMPTY);
  const [deviceSaved, setDeviceSaved] = useState(DEVICE_EMPTY);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("");
  const [deviceError, setDeviceError] = useState("");

  useEffect(() => {
    let mountedRoot = null;

    const cleanupHosts = () => {
      document.getElementById("owner-settings-tabs-host")?.remove();
      document.getElementById("owner-settings-location-map-host")?.remove();
      document.getElementById("owner-settings-printer-sync-host")?.remove();
      setTabsHost(null);
      setLocationHost(null);
      setPrinterHost(null);
      setRoot(null);
    };

    const sync = () => {
      const nextRoot = document.querySelector(".owner-settings-center");
      if (!nextRoot) {
        if (mountedRoot) {
          mountedRoot = null;
          cleanupHosts();
        }
        return;
      }
      mountedRoot = nextRoot;
      setRoot(nextRoot);
      nextRoot.classList.add("owner-settings-inline-v2");

      const sections = [...nextRoot.querySelectorAll(":scope > .osc-section")];
      for (const section of sections) {
        const key = sectionKey(section);
        if (key) section.dataset.ownerSettingsSection = key;
      }

      let tabTarget = document.getElementById("owner-settings-tabs-host");
      if (!tabTarget) {
        tabTarget = document.createElement("div");
        tabTarget.id = "owner-settings-tabs-host";
        const hero = nextRoot.querySelector(":scope > .osc-hero");
        hero?.insertAdjacentElement("afterend", tabTarget);
      }
      setTabsHost(tabTarget);

      const locationSection = nextRoot.querySelector(
        '[data-owner-settings-section="location"]',
      );
      if (locationSection) {
        let host = document.getElementById("owner-settings-location-map-host");
        if (!host) {
          host = document.createElement("div");
          host.id = "owner-settings-location-map-host";
          locationSection.appendChild(host);
        }
        setLocationHost(host);
        const inputs = locationSection.querySelectorAll('input[type="number"]');
        if (inputs.length >= 2) {
          const lat = Number(inputs[0].value);
          const lng = Number(inputs[1].value);
          if (Number.isFinite(lat) && Number.isFinite(lng)) setCoords({ lat, lng });
        }
      }

      const printerSection = nextRoot.querySelector(
        '[data-owner-settings-section="printer"]',
      );
      if (printerSection) {
        let host = document.getElementById("owner-settings-printer-sync-host");
        if (!host) {
          host = document.createElement("div");
          host.id = "owner-settings-printer-sync-host";
          printerSection.appendChild(host);
        }
        setPrinterHost(host);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupHosts();
    };
  }, []);

  useEffect(() => {
    if (!root) return;
    const sections = root.querySelectorAll("[data-owner-settings-section]");
    sections.forEach((section) => {
      section.hidden = section.dataset.ownerSettingsSection !== active;
    });
    root.dataset.settingsActiveTab = active;
  }, [root, active]);

  useEffect(() => {
    if (!root) return;
    const locationSection = root.querySelector(
      '[data-owner-settings-section="location"]',
    );
    if (!locationSection) return;
    const handler = () => {
      const inputs = locationSection.querySelectorAll('input[type="number"]');
      if (inputs.length < 2) return;
      const lat = Number(inputs[0].value);
      const lng = Number(inputs[1].value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) setCoords({ lat, lng });
    };
    locationSection.addEventListener("input", handler);
    return () => locationSection.removeEventListener("input", handler);
  }, [root]);

  useEffect(() => {
    if (!printerHost) return;
    let cancelled = false;
    setDeviceLoading(true);
    setDeviceError("");
    deviceRequest()
      .then((next) => {
        if (cancelled) return;
        setDevices(next);
        setDeviceSaved(next);
      })
      .catch((error) => {
        if (!cancelled) setDeviceError(error.message);
      })
      .finally(() => {
        if (!cancelled) setDeviceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [printerHost]);

  const deviceDirty = useMemo(
    () => JSON.stringify(devices) !== JSON.stringify(deviceSaved),
    [devices, deviceSaved],
  );

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoMessage("Browser ini tidak mendukung pembacaan lokasi perangkat.");
      return;
    }
    setGeoMessage("Membaca titik GPS perangkat…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const section = root?.querySelector(
          '[data-owner-settings-section="location"]',
        );
        const inputs = section?.querySelectorAll('input[type="number"]') || [];
        setNativeValue(inputs[0], lat);
        setNativeValue(inputs[1], lng);
        setCoords({ lat, lng });
        setGeoMessage(
          `Titik GPS diperbarui · akurasi ±${Math.round(position.coords.accuracy || 0)} m. Simpan Pengaturan untuk mengunci titik ini.`,
        );
      },
      (error) => {
        setGeoMessage(
          error.code === 1
            ? "Izin lokasi belum diberikan. Izinkan location pada browser lalu coba lagi."
            : "Titik GPS belum dapat dibaca. Pastikan location perangkat aktif.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function saveDevices() {
    setDeviceSaving(true);
    setDeviceMessage("");
    setDeviceError("");
    try {
      const next = await deviceRequest(devices);
      setDevices(next);
      setDeviceSaved(next);
      setDeviceMessage(
        "Konfigurasi device tersimpan dan tersedia melalui Printer Runtime Config.",
      );
    } catch (error) {
      setDeviceError(error.message);
    } finally {
      setDeviceSaving(false);
    }
  }

  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(
    `${coords.lat},${coords.lng}`,
  )}&z=18&output=embed`;
  const mapsOpenUrl = `https://www.google.com/maps?q=${encodeURIComponent(
    `${coords.lat},${coords.lng}`,
  )}`;

  const tabs = tabsHost
    ? createPortal(
        <nav className="osx-tabs" aria-label="Menu Pengaturan Owner">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={active === key ? "active" : ""}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </nav>,
        tabsHost,
      )
    : null;

  const location = locationHost
    ? createPortal(
        <section className="osx-map-card" aria-label="Titik lokasi outlet pada peta">
          <div className="osx-map-copy">
            <div>
              <span>TITIK MAPS OUTLET</span>
              <h3>Pilih titik outlet dengan GPS</h3>
              <p>
                Gunakan perangkat yang berada di outlet agar titik asal delivery
                mengikuti posisi sebenarnya. Peta di bawah selalu mengikuti
                latitude dan longitude pada form.
              </p>
            </div>
            <div className="osx-map-actions">
              <button type="button" onClick={useCurrentLocation}>
                ⌖ Gunakan lokasi perangkat
              </button>
              <a href={mapsOpenUrl} target="_blank" rel="noreferrer">
                Buka di Maps ↗
              </a>
            </div>
          </div>
          <div className="osx-map-frame">
            <iframe
              key={mapUrl}
              title="Lokasi outlet Warkost Bahagia"
              src={mapUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="osx-map-coordinates">
              <span>LAT {coords.lat}</span>
              <span>LNG {coords.lng}</span>
            </div>
          </div>
          {geoMessage && <p className="osx-map-message">{geoMessage}</p>}
        </section>,
        locationHost,
      )
    : null;

  const printer = printerHost
    ? createPortal(
        <section className="osx-printer-sync" aria-label="Printer Device Sync Settings">
          <header className="osx-printer-sync-head">
            <div>
              <span>DEVICE SYNC</span>
              <h3>Sinkronisasi printer dengan sistem</h3>
              <p>
                Print job sistem memakai key <b>printer_admin</b> dan
                <b> printer_kitchen</b>. Konfigurasi ini menjadi endpoint device
                yang dibaca local print agent melalui <code>/api/printer-config</code>.
              </p>
            </div>
            <label>
              <span>Sync interval</span>
              <select
                value={devices.agentPollSeconds}
                onChange={(event) =>
                  setDevices((current) => ({
                    ...current,
                    agentPollSeconds: Number(event.target.value),
                  }))
                }
              >
                <option value={2}>2 detik</option>
                <option value={5}>5 detik</option>
                <option value={10}>10 detik</option>
                <option value={15}>15 detik</option>
                <option value={30}>30 detik</option>
              </select>
            </label>
          </header>

          {deviceError && <div className="osx-device-feedback error">{deviceError}</div>}
          {deviceMessage && <div className="osx-device-feedback success">{deviceMessage}</div>}

          {deviceLoading ? (
            <div className="osx-device-loading">Memuat konfigurasi printer…</div>
          ) : (
            <div className="osx-device-grid">
              <DeviceCard
                title="PRINTER ADMIN"
                subtitle="Struk transaksi & item Admin"
                value={devices.admin}
                onChange={(next) =>
                  setDevices((current) => ({ ...current, admin: next }))
                }
              />
              <DeviceCard
                title="PRINTER KITCHEN"
                subtitle="Tiket makanan Kitchen"
                value={devices.kitchen}
                onChange={(next) =>
                  setDevices((current) => ({ ...current, kitchen: next }))
                }
              />
            </div>
          )}

          <div className="osx-printer-note">
            <b>Arsitektur aman:</b>
            <span>
              website membuat print job → local print agent membaca queue + config
              → agent mengirim ESC/POS ke printer LAN/USB. Hosting tidak mencoba
              membuka koneksi langsung ke printer di jaringan toko.
            </span>
          </div>

          <div className="osx-printer-actions">
            <span>
              {deviceDirty
                ? "Ada perubahan device yang belum disimpan."
                : "Konfigurasi device sudah tersimpan."}
            </span>
            <button
              type="button"
              onClick={() => setDevices(deviceSaved)}
              disabled={!deviceDirty || deviceSaving}
            >
              Batalkan
            </button>
            <button
              type="button"
              className="primary"
              onClick={saveDevices}
              disabled={!deviceDirty || deviceSaving}
            >
              {deviceSaving ? "Menyimpan…" : "Simpan Device"}
            </button>
          </div>
        </section>,
        printerHost,
      )
    : null;

  return (
    <>
      {tabs}
      {location}
      {printer}
    </>
  );
}
