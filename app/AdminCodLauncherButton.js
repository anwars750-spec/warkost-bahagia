"use client";
import { useEffect, useState } from "react";

// Mounted only in the React-owned Admin Operations heading.
export default function AdminCodLauncherButton() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/cod-batches?filter=pending", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (response.ok && !controller.signal.aborted)
          setPending((data.batches || []).length);
      } catch {
        /* Keep the launcher available if its optional count cannot load. */
      }
    };
    void refresh();
    window.addEventListener("warkost:cod-batch-updated", refresh);
    window.addEventListener("warkost:admin-orders-rendered", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("warkost:cod-batch-updated", refresh);
      window.removeEventListener("warkost:admin-orders-rendered", refresh);
    };
  }, []);
  return (
    <button
      type="button"
      className="admin-cod-launcher-button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("warkost:open-admin-cod-batch"))
      }
      aria-label="Buka pusat setoran COD"
    >
      <span className="admin-cod-launcher-icon" aria-hidden="true">
        Rp
      </span>
      <span className="admin-cod-launcher-copy">
        <strong>SETORAN COD</strong>
        <small>
          {pending > 0
            ? `${pending} batch menunggu verifikasi`
            : "Kelola setoran tunai Driver"}
        </small>
      </span>
      <span
        className={`admin-cod-launcher-badge${pending > 0 ? " has-pending" : ""}`}
      >
        {pending > 0 ? `${pending} menunggu` : "Buka"}
      </span>
    </button>
  );
}
