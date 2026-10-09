"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

async function request(route) {
  const response = await fetch(`/api/${route}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Gagal memuat data (${response.status})`);
  return data;
}

export default function AdminCodLauncherButton() {
  const [target, setTarget] = useState(null);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const adminMain = document.querySelector("main[data-admin-view]");

    if (adminMain?.dataset.adminView === "customers") {
      setTarget(null);
      setPending(0);
      return;
    }
    const heading = document.querySelector(
      "body.admin-operations-view main .heading.admin-ui-heading",
    );
    if (!heading) {
      setTarget(null);
      setPending(0);
      return;
    }

    try {
      const me = await request("me");
      if (me.user?.role !== "ADMIN") {
        setTarget(null);
        setPending(0);
        return;
      }

      setTarget(heading);
      const batches = await request("cod-batches?filter=pending");
      setPending((batches.batches || []).length);
    } catch {
      setTarget(null);
      setPending(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onRendered = () => refresh();
    const onUpdated = () => refresh();
    window.addEventListener("warkost:admin-orders-rendered", onRendered);
    window.addEventListener("warkost:admin-customers-rendered", onRendered);
    window.addEventListener("warkost:cod-batch-updated", onUpdated);
    return () => {
      window.removeEventListener("warkost:admin-orders-rendered", onRendered);
      window.removeEventListener("warkost:admin-customers-rendered", onRendered);
      window.removeEventListener("warkost:cod-batch-updated", onUpdated);
    };
  }, [refresh]);

  if (!target) return null;

  return createPortal(
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
      <span className={`admin-cod-launcher-badge${pending > 0 ? " has-pending" : ""}`}>
        {pending > 0 ? `${pending} menunggu` : "Buka"}
      </span>
    </button>,
    target,
  );
}
