"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY = {
  openTime: "08:00",
  closeTime: "22:00",
  manualStatus: "OPEN",
  closedReason: "",
  effectiveStatus: "CLOSED",
  isOpen: false,
  timeZone: "Asia/Jakarta",
};

function Icon({ name, className = "" }) {
  const paths = {
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.4 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
        <path d="M8 3.5v4M16 3.5v4M4 9.5h16" />
      </>
    ),
    pause: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.5 8.5v7M14.5 8.5v7" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </>
    ),
    moon: <path d="M19.1 15.7A8 8 0 0 1 8.3 4.9 8.5 8.5 0 1 0 19.1 15.7Z" />,
    info: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 10.5v5M12 7.5h.01" />
      </>
    ),
    note: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2.5" />
        <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
      </>
    ),
    save: (
      <>
        <path d="M5 4.5h12.5l2 2V19.5H5Z" />
        <path d="M8 4.5v5h8v-5M8.5 19.5v-6h7v6" />
      </>
    ),
    shop: (
      <>
        <path d="M5 10v9h14v-9" />
        <path d="M4 10h16l-2-5H6Z" />
        <path d="M8.5 19v-5.5h7V19M4 10c0 1.4 1 2.3 2.4 2.3S9 11.4 9 10c0 1.4 1 2.3 3 2.3s3-.9 3-2.3c0 1.4 1.2 2.3 2.6 2.3S20 11.4 20 10" />
      </>
    ),
  };

  return (
    <svg
      className={`store-hours-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.clock}
    </svg>
  );
}

async function defaultRequest(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error || "Jam operasional tidak dapat diproses");
  return result;
}

function editable(status) {
  return {
    openTime: status?.openTime || EMPTY.openTime,
    closeTime: status?.closeTime || EMPTY.closeTime,
    manualStatus: status?.manualStatus || EMPTY.manualStatus,
    closedReason: status?.closedReason || "",
  };
}

export default function StoreOperatingHoursPanel({ request = defaultRequest }) {
  const [status, setStatus] = useState(EMPTY);
  const [form, setForm] = useState(editable(EMPTY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await request("store-hours");
      setStatus(next);
      setForm(editable(next));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRealtime = (event) => {
      if (event.detail?.type === "STORE_STATUS_CHANGED") load();
    };
    window.addEventListener("warkost:realtime", onRealtime);
    return () => window.removeEventListener("warkost:realtime", onRealtime);
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(editable(status)),
    [form, status],
  );

  const statusDetail = useMemo(() => {
    if (loading) return "Sinkronisasi status server";
    if (status.isOpen) return "Sedang menerima pesanan";
    if (status.manualStatus === "CLOSED")
      return status.closedReason || "Toko ditutup sementara";
    return status.nextOpenTime
      ? `Buka kembali pukul ${status.nextOpenTime} WIB`
      : "Di luar jam operasional";
  }, [loading, status]);

  function patch(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await request("store-hours", form);
      setStatus(next);
      setForm(editable(next));
      setMessage("Jam operasional berhasil disimpan dan langsung diterapkan.");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="store-hours-panel" aria-label="Store Operating Hours">
      <header className="store-hours-head">
        <div className="store-hours-head-copy">
          <span className="store-hours-eyebrow">STORE OPERATING HOURS</span>
          <h2>Jam Operasional Toko</h2>
          <p>
            Atur waktu penerimaan pesanan dan tutup toko secara manual bila
            diperlukan.
          </p>
        </div>

        <div
          className={`store-hours-effective ${status.isOpen ? "open" : "closed"}`}
          role="status"
          aria-live="polite"
        >
          <div className="store-hours-effective-icon">
            <Icon name="shop" />
          </div>
          <div className="store-hours-effective-copy">
            <span className="store-hours-status-line">
              <i />
              <small>Status saat ini</small>
            </span>
            <strong>{loading ? "MEMUAT…" : status.isOpen ? "BUKA" : "TUTUP"}</strong>
            <small>{statusDetail}</small>
          </div>
        </div>
      </header>

      <div className="store-hours-form">
        <section className="store-hours-section">
          <div className="store-hours-section-head">
            <span className="store-hours-section-icon">
              <Icon name="clock" />
            </span>
            <div>
              <h3>Status Operasional</h3>
              <p>
                Pilih mode operasional toko. Mode buka tetap mengikuti jadwal
                yang ditentukan server.
              </p>
            </div>
          </div>

          <fieldset disabled={loading || saving}>
            <legend className="store-hours-sr-only">Status manual</legend>
            <div className="store-hours-toggle" role="radiogroup">
              <label
                className={form.manualStatus === "OPEN" ? "active open" : ""}
              >
                <input
                  type="radio"
                  name="manualStatus"
                  value="OPEN"
                  checked={form.manualStatus === "OPEN"}
                  onChange={() => patch("manualStatus", "OPEN")}
                />
                <span className="store-hours-radio-mark" aria-hidden="true" />
                <span className="store-hours-option-icon open">
                  <Icon name="calendar" />
                </span>
                <span className="store-hours-option-copy">
                  <strong>Buka sesuai jadwal</strong>
                  <small>Toko otomatis buka dan tutup sesuai jam operasional.</small>
                </span>
              </label>

              <label
                className={form.manualStatus === "CLOSED" ? "active closed" : ""}
              >
                <input
                  type="radio"
                  name="manualStatus"
                  value="CLOSED"
                  checked={form.manualStatus === "CLOSED"}
                  onChange={() => patch("manualStatus", "CLOSED")}
                />
                <span className="store-hours-radio-mark" aria-hidden="true" />
                <span className="store-hours-option-icon closed">
                  <Icon name="pause" />
                </span>
                <span className="store-hours-option-copy">
                  <strong>Tutup manual</strong>
                  <small>Toko ditutup sementara dan checkout customer dihentikan.</small>
                </span>
              </label>
            </div>
          </fieldset>
        </section>

        <section className="store-hours-section store-hours-schedule-section">
          <div className="store-hours-section-head">
            <span className="store-hours-section-icon">
              <Icon name="calendar" />
            </span>
            <div>
              <h3>Pengaturan Waktu Operasional</h3>
              <p>Tentukan jam buka dan jam tutup harian Warkost.</p>
            </div>
          </div>

          <div className="store-hours-times">
            <label>
              <span className="store-hours-field-label">
                <span className="store-hours-time-icon open">
                  <Icon name="sun" />
                </span>
                <span>
                  <strong>Jam buka</strong>
                  <small>Mulai menerima pesanan</small>
                </span>
              </span>
              <input
                type="time"
                required
                value={form.openTime}
                disabled={loading || saving}
                onChange={(event) => patch("openTime", event.target.value)}
              />
            </label>
            <label>
              <span className="store-hours-field-label">
                <span className="store-hours-time-icon closed">
                  <Icon name="moon" />
                </span>
                <span>
                  <strong>Jam tutup</strong>
                  <small>Berhenti menerima pesanan baru</small>
                </span>
              </span>
              <input
                type="time"
                required
                value={form.closeTime}
                disabled={loading || saving}
                onChange={(event) => patch("closeTime", event.target.value)}
              />
            </label>
          </div>

          <div className="store-hours-info" role="note">
            <Icon name="info" />
            <div>
              <strong>Status Tutup manual selalu menang.</strong>
              <span>
                Status Buka tetap mengikuti jam operasional server. Perubahan
                status diteruskan ke customer melalui realtime existing.
              </span>
            </div>
          </div>

          <label className="store-hours-reason">
            <span className="store-hours-field-label">
              <span className="store-hours-reason-icon">
                <Icon name="note" />
              </span>
              <span>
                <strong>Alasan tutup (opsional)</strong>
                <small>Ditampilkan kepada customer saat toko ditutup manual.</small>
              </span>
            </span>
            <textarea
              maxLength={120}
              value={form.closedReason}
              disabled={loading || saving}
              placeholder="Contoh: Persiapan operasional, stok opname, kendala teknis."
              onChange={(event) => patch("closedReason", event.target.value)}
            />
            <small className="store-hours-char-count">
              {form.closedReason.length}/120
            </small>
          </label>
        </section>

        <div className="store-hours-summary" aria-label="Ringkasan jadwal">
          <div>
            <span>JADWAL HARIAN</span>
            <strong>
              {form.openTime}–{form.closeTime} WIB
            </strong>
          </div>
          <div>
            <span>MODE</span>
            <strong>
              {form.manualStatus === "CLOSED" ? "Tutup manual" : "Ikuti jadwal"}
            </strong>
          </div>
          <div>
            <span>TIMEZONE</span>
            <strong>{status.timeZone || "Asia/Jakarta"}</strong>
          </div>
        </div>

        {error && <div className="store-hours-feedback error">{error}</div>}
        {message && (
          <div className="store-hours-feedback success">{message}</div>
        )}

        <footer className="store-hours-actionbar">
          <div className="store-hours-save-state">
            <span>{dirty ? "Ada perubahan belum disimpan" : "Semua perubahan sudah tersimpan"}</span>
            <small>
              {dirty
                ? "Periksa kembali sebelum menerapkan ke operasional."
                : "Konfigurasi server dan tampilan sudah sinkron."}
            </small>
          </div>
          <div className="store-hours-actions">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => setForm(editable(status))}
            >
              Batalkan perubahan
            </button>
            <button
              className="primary"
              type="button"
              disabled={!dirty || saving || loading}
              onClick={save}
            >
              <Icon name="save" />
              {saving ? "Menyimpan…" : "Simpan Pengaturan"}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
