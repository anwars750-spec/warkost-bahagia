"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 500;

function joinAddress(detail, extra) {
  const primary = String(detail || "").trim();
  const secondary = String(extra || "").trim();
  if (!primary) return secondary;
  if (!secondary) return primary;
  return `${primary} — ${secondary}`;
}

function normaliseSuggestions(payload) {
  const rows = payload?.suggestions || payload?.results || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      placeId: item.placeId || item.place_id || item.id || "",
      name:
        item.name ||
        item.displayName ||
        item.mainText ||
        item.primaryText ||
        "Lokasi",
      address:
        item.address ||
        item.formattedAddress ||
        item.secondaryText ||
        item.description ||
        "",
    }))
    .filter((item) => item.placeId);
}

function normalisePlace(payload) {
  const place = payload?.place || payload || {};
  const latitude = Number(
    place.latitude ?? place.location?.latitude ?? place.location?.lat,
  );
  const longitude = Number(
    place.longitude ?? place.location?.longitude ?? place.location?.lng,
  );
  return {
    placeId: place.placeId || place.place_id || place.id || "",
    name: place.name || place.displayName || "Lokasi pilihan",
    address: place.formattedAddress || place.address || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function formatDistance(value) {
  if (value === null || value === undefined || value === "") return "—";
  const km = Number(value);
  if (!Number.isFinite(km)) return "—";
  return `${km.toLocaleString("id-ID", {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  })} km`;
}

function formatFee(value, free) {
  if (free) return "GRATIS";
  if (value === null || value === undefined || value === "") return "—";
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

async function readJson(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(
      data?.error || data?.message || "Layanan lokasi belum tersedia.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

export default function CustomerLocationPickerUx() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [detail, setDetail] = useState("");
  const [label, setLabel] = useState("Rumah");
  const [customLabel, setCustomLabel] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const sessionToken = useRef("");
  const searchSequence = useRef(0);

  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY || "";

  const effectiveLabel =
    label === "Lainnya" ? customLabel.trim() || "Lainnya" : label;

  const outOfRange = Boolean(
    quote?.eligible === false || quote?.outOfRange === true || quote?.out_of_range,
  );
  const freeDelivery = Boolean(
    quote?.free === true || quote?.freeDelivery === true || quote?.isFree === true,
  );
  const distanceKm =
    quote?.distanceKm ?? quote?.distance_km ?? quote?.distance ?? null;
  const fee = quote?.fee ?? quote?.deliveryFee ?? quote?.delivery_fee ?? null;
  const duration = quote?.durationText || quote?.duration || quote?.estimatedMinutes;

  const mapSrc = useMemo(() => {
    if (!embedKey || selected?.latitude === null || selected?.longitude === null)
      return "";
    const q = encodeURIComponent(`${selected.latitude},${selected.longitude}`);
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${q}`;
  }, [embedKey, selected?.latitude, selected?.longitude]);

  function startSession() {
    sessionToken.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `warkost-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function readSavedAddressesFromCheckout() {
    const select = document.querySelector('select[name="address"]');
    if (!select) {
      setSavedAddresses([]);
      return;
    }
    const rows = Array.from(select.options)
      .filter((option) => option.value)
      .map((option) => {
        const text = String(option.textContent || "").trim();
        const [name, ...addressParts] = text.split("·");
        return {
          id: option.value,
          name: String(name || "Alamat").trim(),
          address: addressParts.join("·").trim(),
        };
      });
    setSavedAddresses(rows);
  }

  function resetPicker() {
    setScreen("search");
    setQuery("");
    setResults([]);
    setSearchBusy(false);
    setProviderUnavailable(false);
    setSearchError("");
    setSelected(null);
    setQuote(null);
    setQuoteBusy(false);
    setQuoteError("");
    setDetail("");
    setLabel("Rumah");
    setCustomLabel("");
    setManualMode(false);
    setManualAddress("");
    setLocationBusy(false);
    setLocationError("");
    startSession();
    readSavedAddressesFromCheckout();
  }

  useEffect(() => {
    function handleQuickAddressClick(event) {
      const trigger = event.target.closest?.(".quick-address-toggle");
      if (!trigger) return;
      window.setTimeout(() => {
        resetPicker();
        setOpen(true);
      }, 0);
    }
    document.addEventListener("click", handleQuickAddressClick, true);
    return () => document.removeEventListener("click", handleQuickAddressClick, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || screen !== "search") return;
    const trimmed = query.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setResults([]);
      setSearchBusy(false);
      setSearchError("");
      return;
    }

    const sequence = ++searchSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({
          q: trimmed,
          sessionToken: sessionToken.current,
        });
        const response = await fetch(`/api/location/autocomplete?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readJson(response);
        if (sequence !== searchSequence.current) return;
        setProviderUnavailable(false);
        setResults(normaliseSuggestions(data));
      } catch (error) {
        if (error.name === "AbortError" || sequence !== searchSequence.current)
          return;
        setResults([]);
        setProviderUnavailable(true);
        setSearchError(
          error.status === 404
            ? "Pencarian lokasi otomatis sedang disiapkan. Kamu tetap bisa memakai alamat tersimpan atau alamat manual."
            : "Pencarian lokasi otomatis sedang tidak tersedia. Coba lagi atau gunakan alamat manual.",
        );
      } finally {
        if (sequence === searchSequence.current) setSearchBusy(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, screen]);

  async function requestQuote(place) {
    if (place.latitude === null || place.longitude === null) return;
    setQuoteBusy(true);
    setQuoteError("");
    setQuote(null);
    try {
      const response = await fetch("/api/delivery/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: place.latitude,
          longitude: place.longitude,
        }),
      });
      const data = await readJson(response);
      setQuote(data);
    } catch (error) {
      setQuoteError(
        error.status === 404
          ? "Perhitungan jarak otomatis akan aktif setelah layanan Maps terhubung."
          : "Perhitungan jarak otomatis sedang tidak tersedia.",
      );
    } finally {
      setQuoteBusy(false);
    }
  }

  async function chooseSuggestion(suggestion) {
    setSearchBusy(true);
    setSearchError("");
    try {
      const response = await fetch("/api/location/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: sessionToken.current,
        }),
      });
      const place = normalisePlace(await readJson(response));
      setSelected(place);
      setManualMode(false);
      setDetail("");
      setScreen("confirm");
      sessionToken.current = "";
      await requestQuote(place);
    } catch (error) {
      setProviderUnavailable(true);
      setSearchError(
        "Detail lokasi belum dapat dimuat. Gunakan alamat tersimpan atau alamat manual.",
      );
    } finally {
      setSearchBusy(false);
    }
  }

  function chooseSavedAddress(address) {
    const select = document.querySelector('select[name="address"]');
    if (!select) return;
    select.value = address.id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
  }

  function beginManualAddress() {
    setManualMode(true);
    setSelected({
      placeId: "",
      name: "Alamat manual",
      address: "",
      latitude: null,
      longitude: null,
    });
    setManualAddress("");
    setDetail("");
    setQuote(null);
    setQuoteError("");
    setScreen("confirm");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Perangkat ini tidak mendukung akses lokasi.");
      return;
    }
    setLocationBusy(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const fallback = {
          placeId: "",
          name: "Lokasi perangkat",
          address: "Lokasi perangkat berhasil ditemukan.",
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        try {
          const response = await fetch("/api/location/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: coords.latitude,
              longitude: coords.longitude,
            }),
          });
          const place = normalisePlace(await readJson(response));
          const resolved = {
            ...fallback,
            ...place,
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
          setSelected(resolved);
          setManualMode(false);
          setScreen("confirm");
          await requestQuote(resolved);
        } catch {
          setSelected(fallback);
          setManualMode(false);
          setScreen("confirm");
          await requestQuote(fallback);
        } finally {
          setLocationBusy(false);
        }
      },
      () => {
        setLocationBusy(false);
        setLocationError(
          "Lokasi perangkat tidak dapat diakses. Cari alamat atau gunakan alamat manual.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function applyToExistingCheckout() {
    const quickForm = document.querySelector(".checkout-quick-address");
    if (!quickForm) return;
    const labelField = quickForm.querySelector('[name="quickAddressLabel"]');
    const detailField = quickForm.querySelector('[name="quickAddressDetail"]');
    const latField = quickForm.querySelector('[name="quickAddressLatitude"]');
    const lngField = quickForm.querySelector('[name="quickAddressLongitude"]');
    const saveButton = quickForm.querySelector(".quick-address-buttons .primary");

    const baseAddress = manualMode ? manualAddress : selected?.address;
    const finalDetail = joinAddress(baseAddress, detail);
    if (!effectiveLabel || effectiveLabel.length < 2 || finalDetail.length < 10) {
      setQuoteError("Lengkapi label dan detail alamat sebelum melanjutkan.");
      return;
    }

    if (labelField) labelField.value = effectiveLabel;
    if (detailField) detailField.value = finalDetail;
    if (latField) latField.value = selected?.latitude ?? "";
    if (lngField) lngField.value = selected?.longitude ?? "";

    saveButton?.click();
    window.setTimeout(() => setOpen(false), 50);
  }

  if (!open) return null;

  return (
    <div className="wloc-shell" role="dialog" aria-modal="true" aria-label="Pilih lokasi pengantaran">
      <div className="wloc-sheet">
        <header className="wloc-header">
          <button
            type="button"
            className="wloc-back"
            aria-label={screen === "confirm" ? "Kembali ke pencarian" : "Tutup"}
            onClick={() => (screen === "confirm" ? setScreen("search") : setOpen(false))}
          >
            ←
          </button>
          <div>
            <strong>{screen === "confirm" ? "Konfirmasi lokasi" : "Pilih lokasi"}</strong>
            <small>Warkost Bahagia</small>
          </div>
        </header>

        {screen === "search" ? (
          <main className="wloc-body">
            <div className="wloc-search-box">
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari alamat, gedung, atau tempat..."
                aria-label="Cari lokasi pengantaran"
              />
              {query && (
                <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery("")}>×</button>
              )}
            </div>

            <button
              type="button"
              className="wloc-current"
              onClick={useCurrentLocation}
              disabled={locationBusy}
            >
              <span className="wloc-current-icon" aria-hidden="true">◎</span>
              <span>
                <strong>{locationBusy ? "Mencari lokasimu..." : "Gunakan lokasi saat ini"}</strong>
                <small>Gunakan GPS perangkat untuk menentukan titik pengantaran.</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>

            {locationError && <p className="wloc-alert">{locationError}</p>}

            {query.trim().length >= SEARCH_MIN_LENGTH ? (
              <section className="wloc-section">
                <div className="wloc-section-title">
                  <span>HASIL PENCARIAN</span>
                  {searchBusy && <small>Mencari…</small>}
                </div>
                {searchError && <p className="wloc-alert">{searchError}</p>}
                {!searchBusy && !searchError && results.length === 0 && (
                  <div className="wloc-empty">
                    <strong>Belum ada lokasi yang cocok</strong>
                    <span>Coba nama tempat, jalan, gedung, atau area yang lebih spesifik.</span>
                  </div>
                )}
                <div className="wloc-results">
                  {results.map((item) => (
                    <button
                      type="button"
                      key={item.placeId}
                      className="wloc-result"
                      onClick={() => chooseSuggestion(item)}
                    >
                      <span className="wloc-pin" aria-hidden="true">●</span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.address}</small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="wloc-section">
                <div className="wloc-section-title"><span>ALAMAT TERSIMPAN</span></div>
                {savedAddresses.length ? (
                  <div className="wloc-results">
                    {savedAddresses.map((address) => (
                      <button
                        type="button"
                        key={address.id}
                        className="wloc-result"
                        onClick={() => chooseSavedAddress(address)}
                      >
                        <span className="wloc-saved-icon" aria-hidden="true">
                          {address.name.toLowerCase().includes("kantor") ? "▣" : "⌂"}
                        </span>
                        <span>
                          <strong>{address.name}</strong>
                          <small>{address.address || "Alamat tersimpan"}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="wloc-empty">
                    <strong>Belum ada alamat tersimpan</strong>
                    <span>Tambahkan alamat agar checkout berikutnya lebih cepat.</span>
                  </div>
                )}
              </section>
            )}

            <button type="button" className="wloc-manual" onClick={beginManualAddress}>
              Masukkan alamat secara manual
            </button>

            {providerUnavailable && (
              <p className="wloc-footnote">
                Pencarian otomatis tidak menghalangi checkout. Alamat manual dan alamat tersimpan tetap tersedia.
              </p>
            )}
          </main>
        ) : (
          <main className="wloc-body wloc-confirm">
            <section className="wloc-map-card" aria-label="Pratinjau lokasi">
              {mapSrc ? (
                <iframe
                  title="Google Maps lokasi pengantaran"
                  src={mapSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="wloc-map-placeholder">
                  <span className="wloc-map-road wloc-map-road-a" />
                  <span className="wloc-map-road wloc-map-road-b" />
                  <span className="wloc-map-pin" aria-hidden="true">●</span>
                  <small>Pratinjau peta aktif setelah Google Maps Embed dikonfigurasi</small>
                </div>
              )}
            </section>

            <section className="wloc-place-card">
              <div className="wloc-place-title">
                <span className="wloc-pin" aria-hidden="true">●</span>
                <div>
                  <strong>{manualMode ? "Alamat pengantaran" : selected?.name || "Lokasi pilihan"}</strong>
                  {!manualMode && <small>{selected?.address || "Lengkapi detail pengantaran di bawah."}</small>}
                </div>
              </div>

              {manualMode && (
                <label className="wloc-field">
                  <span>Alamat lengkap</span>
                  <textarea
                    value={manualAddress}
                    onChange={(event) => setManualAddress(event.target.value)}
                    placeholder="Nama jalan, nomor, kelurahan, kecamatan, kota"
                    rows="3"
                  />
                </label>
              )}

              <div className="wloc-quote-grid">
                <div>
                  <span>Jarak dari Warkost</span>
                  <strong>{quoteBusy ? "Menghitung…" : formatDistance(distanceKm)}</strong>
                </div>
                <div>
                  <span>Ongkir</span>
                  <strong className={freeDelivery ? "is-free" : ""}>
                    {quoteBusy ? "…" : formatFee(fee, freeDelivery)}
                  </strong>
                </div>
                <div>
                  <span>Estimasi</span>
                  <strong>{duration ? (typeof duration === "number" ? `${duration} menit` : duration) : "—"}</strong>
                </div>
              </div>

              {freeDelivery && !outOfRange && (
                <div className="wloc-free-badge">✓ GRATIS ONGKIR</div>
              )}
              {outOfRange && (
                <div className="wloc-range-warning">
                  <strong>Di luar jangkauan pengantaran Warkost</strong>
                  <span>Lokasi ini belum dapat kami layani.</span>
                </div>
              )}
              {quoteError && <p className="wloc-alert">{quoteError}</p>}
            </section>

            <section className="wloc-form-card">
              <label className="wloc-field">
                <span>Detail pengantaran</span>
                <textarea
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Nomor rumah, lantai, lobby, patokan, RT/RW"
                  rows="3"
                />
              </label>

              <div className="wloc-label-block">
                <span>Label alamat</span>
                <div className="wloc-chips">
                  {["Rumah", "Kantor", "Lainnya"].map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={label === item ? "is-selected" : ""}
                      onClick={() => setLabel(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {label === "Lainnya" && (
                  <input
                    className="wloc-custom-label"
                    value={customLabel}
                    onChange={(event) => setCustomLabel(event.target.value)}
                    placeholder="Contoh: Kos, Kampus, Orang Tua"
                  />
                )}
              </div>
            </section>

            <div className="wloc-confirm-actions">
              {outOfRange ? (
                <button type="button" className="wloc-secondary" onClick={() => setScreen("search")}>
                  Cari lokasi lain
                </button>
              ) : (
                <button
                  type="button"
                  className="wloc-primary"
                  onClick={applyToExistingCheckout}
                  disabled={quoteBusy}
                >
                  {quoteBusy ? "Menghitung ongkir…" : "GUNAKAN LOKASI INI"}
                </button>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
