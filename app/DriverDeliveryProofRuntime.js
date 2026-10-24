"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./DriverDeliveryProofRuntime.module.css";
import captureStyles from "./DriverDeliveryProofCapture.module.css";

function orderIdFromCard(card) {
  const text = card?.querySelector("h3")?.textContent || "";
  const match = text.match(/WB0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function proofTarget(orderIdValue) {
  const orderId = Number(orderIdValue);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return null;
  return { orderId, code: `WB${String(orderId).padStart(6, "0")}` };
}

export default function DriverDeliveryProofRuntime() {
  const [target, setTarget] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cameraInputRef = useRef(null);
  const attachmentInputRef = useRef(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    const openProof = (event) => {
      const nextTarget = proofTarget(event.detail?.orderId);
      if (!nextTarget) return;
      setTarget(nextTarget);
      setFile(null);
      setError("");
    };
    window.addEventListener("warkost:open-delivery-proof", openProof);
    return () => window.removeEventListener("warkost:open-delivery-proof", openProof);
  }, []);

  useEffect(() => {
    const intercept = (event) => {
      const button = event.target.closest?.(".driver-v2-primary");
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!label.startsWith("Pesanan Diterima")) return;
      const card = button.closest(".driver-v2-order-card");
      const nextTarget = proofTarget(orderIdFromCard(card));
      if (!nextTarget) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setTarget(nextTarget);
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

  const chooseFile = (event) => {
    const selected = event.target.files?.[0] || null;
    if (selected && selected.size > 8 * 1024 * 1024) {
      setError("Ukuran foto maksimal 8 MB");
      event.target.value = "";
      return;
    }
    setError("");
    setFile(selected);
    event.target.value = "";
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
            <div className={`${styles.upload} ${captureStyles.capturePanel}`}>
              <input
                ref={cameraInputRef}
                className={captureStyles.hiddenInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={chooseFile}
              />
              <input
                ref={attachmentInputRef}
                className={captureStyles.hiddenInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={chooseFile}
              />
              <span className={styles.camera} aria-hidden="true">◎</span>
              <strong>Pilih cara mengambil bukti</strong>
              <small>Gunakan kamera saat serah terima atau lampirkan foto yang sudah tersimpan. Maks. 8 MB.</small>
              <div className={captureStyles.sourceActions}>
                <button
                  type="button"
                  className={captureStyles.cameraButton}
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                >
                  <span aria-hidden="true">📷</span>
                  <span><strong>Ambil Foto</strong><small>Buka kamera belakang</small></span>
                </button>
                <button
                  type="button"
                  className={captureStyles.attachmentButton}
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={busy}
                >
                  <span aria-hidden="true">🖼️</span>
                  <span><strong>Lampirkan Foto</strong><small>Pilih dari galeri / file</small></span>
                </button>
              </div>
            </div>
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
