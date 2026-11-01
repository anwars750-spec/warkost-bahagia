"use client";
import { useEffect, useRef } from "react";
export default function CustomerLogoutDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}) {
  const cancel = useRef(null);
  useEffect(() => {
    const previous = document.body.style.overflow,
      source = document.activeElement;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      source?.focus?.();
    };
  }, []);
  return (
    <div
      className="kitchen-logout-layer role-logout-layer open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <section
        className="kitchen-logout-dialog role-logout-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Konfirmasi keluar CUSTOMER"
      >
        <span className="kitchen-logout-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
          </svg>
        </span>
        <div className="kitchen-logout-copy">
          <small>AKHIRI SESI CUSTOMER</small>
          <h2>Keluar dari akun Customer?</h2>
          <p>
            Pesanan dan riwayat akun tetap tersimpan. Anda dapat masuk kembali
            kapan saja.
          </p>
        </div>
        {error && (
          <div className="kitchen-logout-error" role="alert">
            {error}
          </div>
        )}
        <div className="kitchen-logout-actions">
          <button
            ref={cancel}
            type="button"
            className="kitchen-logout-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            type="button"
            className="kitchen-logout-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </section>
    </div>
  );
}
