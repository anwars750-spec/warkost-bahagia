"use client";

import { useEffect, useRef, useState } from "react";
import {
  normalizeLocationQuery,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
  validLocationQuery,
} from "../lib/location-search.mjs";
const ACCOUNT_PICKER_EVENT = "warkost:location-picker-open";

function joinAddress(detail, extra) {
  const primary = String(detail || "").trim();
  const secondary = String(extra || "").trim();
  if (!primary) return secondary;
  if (!secondary) return primary;
  return `${primary} — ${secondary}`;
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

export default function CustomerLocationPickerUx({
  savedAddresses,
  onSelectSavedAddress,
  onSaveCheckoutAddress,
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchCode, setSearchCode] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState(null);
  const [adjustPoint, setAdjustPoint] = useState(false);
  const [pointDraft, setPointDraft] = useState({ latitude: "", longitude: "" });
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
  const [saving, setSaving] = useState(false);
  const gpsRequest = useRef(0);
  const pickerContext = useRef(null);
  const savingRef = useRef(false);
  const backButton = useRef(null);

  const normalizedQuery = normalizeLocationQuery(query);
  const validQuery = validLocationQuery(normalizedQuery);
  const latitude = selected?.latitude;
  const longitude = selected?.longitude;
  const pointKey =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude},${longitude}`
      : null;
  const currentQuote = quote?.pointKey === pointKey ? quote : null;

  const effectiveLabel =
    label === "Lainnya" ? customLabel.trim() || "Lainnya" : label;

  const outOfRange = currentQuote?.available === false;
  const freeDelivery = currentQuote?.free_delivery === true;
  const distanceKm = currentQuote?.distance_km;
  const fee = currentQuote?.delivery_fee;

  function startSession() {
    setAttemptId(globalThis.crypto?.randomUUID?.() || "");
    setSearchCode("");
    setSearchError("");
    setResults([]);
  }

  function resetPicker() {
    setScreen("search");
    setQuery("");
    setResults([]);
    setSearchBusy(false);
    setSearchCode("");
    setSearchError("");
    setSelected(null);
    setAdjustPoint(false);
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
  }

  useEffect(() => {
    function openPicker(event) {
      const context = event.detail;
      if (
        savingRef.current ||
        !["account", "checkout"].includes(context?.source)
      )
        return;
      gpsRequest.current++;
      pickerContext.current = context;
      resetPicker();
      setOpen(true);
    }

    window.addEventListener(ACCOUNT_PICKER_EVENT, openPicker);
    return () => window.removeEventListener(ACCOUNT_PICKER_EVENT, openPicker);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backButton.current?.focus();
    function handleEscape(event) {
      if (event.key === "Escape" && !savingRef.current) setOpen(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      gpsRequest.current++;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const attemptExhausted = searchCode === "ATTEMPT_LIMIT";
  useEffect(() => {
    if (!open || screen !== "search" || attemptExhausted) return;
    setResults([]);
    setSearchBusy(false);
    setSearchError("");
    setSearchCode("");
    if (!validQuery || !attemptId) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const response = await fetch("/api/location/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalizedQuery, attemptId }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setSearchCode(data.code || "UNAVAILABLE");
          setSearchError(data.error || "Pencarian lokasi belum tersedia.");
          return;
        }
        setResults(
          Array.isArray(data.suggestions)
            ? data.suggestions.slice(0, SEARCH_RESULT_LIMIT)
            : [],
        );
      } catch {
        if (!controller.signal.aborted)
          setSearchError(
            "Pencarian lokasi belum tersedia. Gunakan alamat tersimpan atau tentukan titik secara manual.",
          );
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, normalizedQuery, validQuery, attemptId, screen, attemptExhausted]);

  useEffect(() => {
    if (!open || screen !== "confirm" || !pointKey) {
      setQuoteBusy(false);
      return;
    }
    const controller = new AbortController();
    setQuoteBusy(true);
    setQuoteError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/location/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
          signal: controller.signal,
        });
        const data = await readJson(response);
        if (!controller.signal.aborted) setQuote({ ...data, pointKey });
      } catch {
        if (!controller.signal.aborted)
          setQuoteError(
            "Pratinjau ongkir belum tersedia. Periksa titik lokasi lalu coba lagi.",
          );
      } finally {
        if (!controller.signal.aborted) setQuoteBusy(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, screen, pointKey, latitude, longitude]);

  function chooseSuggestion(suggestion) {
    if (
      !Number.isFinite(suggestion.latitude) ||
      !Number.isFinite(suggestion.longitude)
    )
      return;
    gpsRequest.current++;
    setLocationBusy(false);
    setSelected(suggestion);
    setManualMode(false);
    setAdjustPoint(false);
    setDetail("");
    setScreen("confirm");
  }

  function editPoint() {
    setPointDraft({
      latitude: selected?.latitude ?? "",
      longitude: selected?.longitude ?? "",
    });
    setAdjustPoint(true);
  }

  function applyPoint() {
    const nextLatitude = Number(pointDraft.latitude);
    const nextLongitude = Number(pointDraft.longitude);
    if (
      String(pointDraft.latitude).trim() === "" ||
      String(pointDraft.longitude).trim() === "" ||
      !Number.isFinite(nextLatitude) ||
      !Number.isFinite(nextLongitude) ||
      Math.abs(nextLatitude) > 90 ||
      Math.abs(nextLongitude) > 180
    ) {
      setQuoteError("Masukkan latitude dan longitude yang valid.");
      return;
    }
    setQuoteError("");
    setSelected({
      ...selected,
      latitude: nextLatitude,
      longitude: nextLongitude,
    });
    setAdjustPoint(false);
  }

  function chooseSavedAddress(address) {
    onSelectSavedAddress(address.id, pickerContext.current?.source);
    setOpen(false);
  }

  function beginManualAddress() {
    gpsRequest.current++;
    setLocationBusy(false);
    setAdjustPoint(true);
    setPointDraft({ latitude: "", longitude: "" });
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
    if (!window.isSecureContext) {
      setLocationBusy(false);
      setLocationError(
        "GPS memerlukan koneksi aman (HTTPS). Pilih alamat tersimpan atau masukkan titik secara manual.",
      );
      return;
    }
    const geolocation = window.navigator?.geolocation;
    if (typeof geolocation?.getCurrentPosition !== "function") {
      setLocationBusy(false);
      setLocationError(
        "GPS tidak tersedia di perangkat ini. Pilih alamat tersimpan atau masukkan titik secara manual.",
      );
      return;
    }
    const requestId = ++gpsRequest.current;
    setLocationBusy(true);
    setLocationError("");
    geolocation.getCurrentPosition(
      ({ coords }) => {
        if (requestId !== gpsRequest.current) return;
        setSelected({
          placeId: "",
          name: "Lokasi perangkat",
          address: "",
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setManualAddress("");
        setManualMode(true);
        setAdjustPoint(false);
        setScreen("confirm");
        setLocationBusy(false);
      },
      (error) => {
        if (requestId !== gpsRequest.current) return;
        setLocationBusy(false);
        setLocationError(
          error?.code === 1
            ? "Izin lokasi ditolak. Izinkan akses lokasi di browser atau masukkan titik secara manual."
            : error?.code === 3
              ? "Waktu pencarian GPS habis. Coba lagi atau masukkan titik secara manual."
              : "Lokasi perangkat tidak dapat ditemukan. Periksa layanan lokasi perangkat atau masukkan titik secara manual.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function applyLocation() {
    if (currentQuote?.available !== true || adjustPoint || savingRef.current)
      return;
    const finalDetail = joinAddress(
      manualMode ? manualAddress : selected?.address,
      detail,
    );
    if (effectiveLabel.length < 2 || finalDetail.length < 10) {
      setQuoteError("Lengkapi label dan detail alamat sebelum melanjutkan.");
      return;
    }

    const address = {
      label: effectiveLabel,
      detail: finalDetail,
      latitude,
      longitude,
    };
    savingRef.current = true;
    setSaving(true);
    setQuoteError("");
    try {
      if (pickerContext.current?.source === "account") {
        const applyAddress = pickerContext.current.applyAddress;
        if (!applyAddress)
          throw new Error(
            "Form alamat belum siap. Buka kembali pemilih lokasi dari Akun.",
          );
        applyAddress(address);
      } else {
        await onSaveCheckoutAddress(address);
      }
      setOpen(false);
    } catch (error) {
      setQuoteError(
        error.message || "Alamat belum dapat digunakan. Coba lagi.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="wloc-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih lokasi pengantaran"
    >
      <div className="wloc-sheet">
        <header className="wloc-header">
          <button
            type="button"
            className="wloc-back"
            ref={backButton}
            disabled={saving}
            aria-label={screen === "confirm" ? "Kembali ke pencarian" : "Tutup"}
            onClick={() =>
              screen === "confirm" ? setScreen("search") : setOpen(false)
            }
          >
            ←
          </button>
          <div>
            <strong>
              {screen === "confirm" ? "Konfirmasi lokasi" : "Pilih lokasi"}
            </strong>
            <small>Warkost Bahagia</small>
          </div>
        </header>

        {screen === "search" ? (
          <>
            <main className="wloc-body">
              <div className="wloc-search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  maxLength={SEARCH_MAX_LENGTH}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari alamat, gedung, atau tempat..."
                  aria-label="Cari lokasi pengantaran"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                className="wloc-current"
                onClick={useCurrentLocation}
                disabled={locationBusy}
              >
                <span className="wloc-current-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>
                    {locationBusy
                      ? "Mencari lokasimu..."
                      : "Gunakan lokasi saat ini"}
                  </strong>
                  <small>
                    Gunakan GPS perangkat untuk menentukan titik pengantaran.
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>

              {locationError && (
                <p className="wloc-alert" role="status">
                  {locationError}
                </p>
              )}

              {(validQuery || attemptExhausted) && (
                <section className="wloc-section">
                  <div className="wloc-section-title">
                    <span>HASIL PENCARIAN</span>
                    {searchBusy && <small>Mencari…</small>}
                  </div>
                  {searchError && (
                    <p className="wloc-alert" role="status">
                      {searchError}
                    </p>
                  )}
                  {attemptExhausted && (
                    <button
                      type="button"
                      className="wloc-manual"
                      onClick={startSession}
                    >
                      Mulai pencarian baru
                    </button>
                  )}
                  {!searchBusy && !searchError && results.length === 0 && (
                    <div className="wloc-empty">
                      <strong>Belum ada lokasi yang cocok</strong>
                      <span>
                        Coba nama tempat, jalan, gedung, atau area yang lebih
                        spesifik.
                      </span>
                    </div>
                  )}
                  <div className="wloc-results">
                    {results.slice(0, SEARCH_RESULT_LIMIT).map((item) => (
                      <button
                        type="button"
                        key={item.placeId}
                        className="wloc-result"
                        onClick={() => chooseSuggestion(item)}
                      >
                        <span className="wloc-pin" aria-hidden="true">
                          ●
                        </span>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.address}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                  </div>
                  {results.length > 0 && (
                    <small>
                      Pencarian oleh{" "}
                      <a
                        href="https://www.geoapify.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Geoapify
                      </a>{" "}
                      ·{" "}
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noreferrer"
                      >
                        © OpenStreetMap contributors
                      </a>
                    </small>
                  )}
                </section>
              )}
              <section className="wloc-section">
                <div className="wloc-section-title">
                  <span>ALAMAT TERSIMPAN</span>
                </div>
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
                          {address.label.toLowerCase().includes("kantor")
                            ? "▣"
                            : "⌂"}
                        </span>
                        <span>
                          <strong>{address.label}</strong>
                          <small>{address.detail}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="wloc-empty">
                    <strong>Belum ada alamat tersimpan</strong>
                    <span>
                      Tambahkan alamat agar checkout berikutnya lebih cepat.
                    </span>
                  </div>
                )}
              </section>

              {searchCode && (
                <p className="wloc-footnote">
                  Pencarian otomatis tidak menghalangi checkout. Alamat manual
                  dan alamat tersimpan tetap tersedia.
                </p>
              )}
            </main>
            <footer className="wloc-search-actions">
              <button
                type="button"
                className="wloc-manual"
                onClick={beginManualAddress}
              >
                Masukkan alamat secara manual
              </button>
            </footer>
          </>
        ) : (
          <main className="wloc-body wloc-confirm">
            <section className="wloc-place-card" aria-label="Titik lokasi">
              <button
                type="button"
                className="wloc-secondary"
                onClick={editPoint}
              >
                {pointKey
                  ? "Periksa / ubah titik lokasi"
                  : "Masukkan titik lokasi"}
              </button>
              {adjustPoint && (
                <div>
                  {["latitude", "longitude"].map((field) => (
                    <label key={field} className="wloc-field">
                      <span>
                        {field === "latitude" ? "Latitude" : "Longitude"}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={pointDraft[field]}
                        onChange={(event) =>
                          setPointDraft({
                            ...pointDraft,
                            [field]: event.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="wloc-secondary"
                    onClick={applyPoint}
                  >
                    Terapkan titik
                  </button>
                </div>
              )}
            </section>

            <section className="wloc-place-card">
              <div className="wloc-place-title">
                <span className="wloc-pin" aria-hidden="true">
                  ●
                </span>
                <div>
                  <strong>
                    {manualMode
                      ? "Alamat pengantaran"
                      : selected?.name || "Lokasi pilihan"}
                  </strong>
                  {!manualMode && (
                    <small>
                      {selected?.address ||
                        "Lengkapi detail pengantaran di bawah."}
                    </small>
                  )}
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
                  <strong>
                    {quoteBusy ? "Menghitung…" : formatDistance(distanceKm)}
                  </strong>
                </div>
                <div>
                  <span>Ongkir</span>
                  <strong className={freeDelivery ? "is-free" : ""}>
                    {quoteBusy ? "…" : formatFee(fee, freeDelivery)}
                  </strong>
                </div>
                <div>
                  <span>Estimasi</span>
                  <strong>—</strong>
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
                <button
                  type="button"
                  className="wloc-secondary"
                  onClick={() => setScreen("search")}
                >
                  Cari lokasi lain
                </button>
              ) : (
                <button
                  type="button"
                  className="wloc-primary"
                  onClick={applyLocation}
                  disabled={
                    saving ||
                    quoteBusy ||
                    adjustPoint ||
                    currentQuote?.available !== true
                  }
                >
                  {saving
                    ? "Menyimpan…"
                    : quoteBusy
                      ? "Menghitung ongkir…"
                      : "GUNAKAN LOKASI INI"}
                </button>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
