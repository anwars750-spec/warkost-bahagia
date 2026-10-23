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
        <div>
          <span>STORE OPERATING HOURS</span>
          <h2>Jam Operasional Toko</h2>
          <p>
            Atur waktu penerimaan pesanan dan tutup toko secara manual bila
            diperlukan.
          </p>
        </div>
        <div
          className={`store-hours-effective ${status.isOpen ? "open" : "closed"}`}
          role="status"
        >
          <i />
          <span>
            <small>Status efektif</small>
            <strong>
              {loading ? "Memuat…" : status.isOpen ? "BUKA" : "TUTUP"}
            </strong>
          </span>
        </div>
      </header>

      <div className="store-hours-form">
        <fieldset disabled={loading || saving}>
          <legend>Status manual</legend>
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
              <span>Buka sesuai jadwal</span>
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
              <span>Tutup manual</span>
            </label>
          </div>
          <small className="store-hours-help">
            Status Tutup manual selalu menang. Status Buka tetap mengikuti jam
            operasional server.
          </small>
        </fieldset>

        <div className="store-hours-times">
          <label>
            <span>Jam buka</span>
            <input
              type="time"
              required
              value={form.openTime}
              disabled={loading || saving}
              onChange={(event) => patch("openTime", event.target.value)}
            />
          </label>
          <label>
            <span>Jam tutup</span>
            <input
              type="time"
              required
              value={form.closeTime}
              disabled={loading || saving}
              onChange={(event) => patch("closeTime", event.target.value)}
            />
          </label>
        </div>

        <label className="store-hours-reason">
          <span>Alasan tutup (opsional)</span>
          <input
            maxLength={120}
            value={form.closedReason}
            disabled={loading || saving}
            placeholder="Contoh: Persiapan operasional"
            onChange={(event) => patch("closedReason", event.target.value)}
          />
        </label>

        <div className="store-hours-summary">
          <span>Jadwal harian</span>
          <strong>
            {form.openTime}–{form.closeTime} WIB
          </strong>
          <small>
            Source of truth: server · {status.timeZone || "Asia/Jakarta"}
          </small>
        </div>

        {error && <div className="store-hours-feedback error">{error}</div>}
        {message && (
          <div className="store-hours-feedback success">{message}</div>
        )}

        <footer>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setForm(editable(status))}
          >
            Batalkan
          </button>
          <button
            className="primary"
            type="button"
            disabled={!dirty || saving || loading}
            onClick={save}
          >
            {saving ? "Menyimpan…" : "Simpan Jam Operasional"}
          </button>
        </footer>
      </div>
    </section>
  );
}
