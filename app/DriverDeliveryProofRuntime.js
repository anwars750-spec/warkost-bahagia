"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DriverDeliveryProofRuntime.module.css";

function orderIdFromCard(card) {
  const text = card?.querySelector("h3")?.textContent || "";
  const match = text.match(/WB0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export default function DriverDeliveryProofRuntime() {
  const [target, setTarget] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    const intercept = (event) => {
      const button = event.target.closest?.(".driver-v2-primary");
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!label.startsWith("Pesanan Diterima")) return;
      const card = button.closest(".driver-v2-order-card");
      const orderId = orderIdFromCard(card);
      if (!orderId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setTarget({ orderId, code: `WB${String(orderId).padStart(6, "0")}` });
      setFile(null);
      setError("");
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, []);

  useEffect(() => {
    if (!target) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) setTarget(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [target, busy]);

  const close = () => {
    if (busy) return;
    setTarget(null);
    setFile(null);
    setError("");
  };

  const submit = async () => {
    if (!target || !file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("orderId", String(target.orderId));
      form.append("image", file);
      const response = await fetch("/api/delivery-proof", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Gagal menyimpan bukti pengantaran");
      window.dispatchEvent(
        new CustomEvent("warkost:delivery-proof-completed", {
          detail: { orderId: target.orderId },
        }),
      );
      window.dispatchEvent(new Event("warkost:realtime-recovered"));
      close();
    } catch (submitError) {
      setError(submitError.message || "Gagal menyimpan bukti pengantaran");
    } finally {
      setBusy(false);
    }
  };

  if (!target || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="delivery-proof-title">
        <header className={styles.header}>
          <div>
            <span>BUKTI PENGANTARAN</span>
            <h2 id="delivery-proof-title">Selesaikan {target.code}</h2>
            <p>Foto wajib disimpan sebelum pesanan dapat ditandai selesai.</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Tutup">×</button>
        </header>

        <div className={styles.body}>
          {preview ? (
            <div className={styles.preview}>
              <img src={preview} alt="Preview bukti pengantaran" />
              <button type="button" onClick={() => setFile(null)} disabled={busy}>Ganti foto</button>
            </div>
          ) : (
            <label className={styles.upload}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                capture="environment"
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  if (selected && selected.size > 8 * 1024 * 1024) {
                    setError("Ukuran foto maksimal 8 MB");
                    event.target.value = "";
                    return;
                  }
                  setError("");
                  setFile(selected);
                }}
              />
              <span className={styles.camera} aria-hidden="true">◎</span>
              <strong>Ambil / pilih foto bukti</strong>
              <small>Pastikan pesanan yang diterima terlihat jelas. JPG, PNG, WEBP, atau AVIF · maks. 8 MB.</small>
            </label>
          )}

          <div className={styles.note}>
            <strong>Foto ini menjadi bukti penyelesaian delivery.</strong>
            <span>Status pesanan baru berubah menjadi Selesai setelah bukti berhasil tersimpan.</span>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={close} disabled={busy}>Batal</button>
          <button type="button" className={styles.primary} onClick={submit} disabled={!file || busy}>
            {busy ? "Menyimpan..." : "Simpan Bukti & Selesaikan"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
