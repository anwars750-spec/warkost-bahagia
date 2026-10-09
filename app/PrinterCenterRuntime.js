"use client";

import { useEffect, useState } from "react";
import AdminPrinterController from "./AdminPrinterController";

const LEGACY_PRINTER_TITLE = "Antrean cetak struk 80mm";
const ALLOWED_ROLES = new Set(["KITCHEN", "OWNER"]);
let cachedRole = "";

function printerViewVisible() {
  const headings = document.querySelectorAll("main h2");
  return Array.from(headings).some(
    (heading) => heading.textContent?.trim() === LEGACY_PRINTER_TITLE,
  );
}

async function resolveRole() {
  if (cachedRole) return cachedRole;
  const response = await fetch("/api/me", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal membaca role");
  cachedRole = String(data?.user?.role || "").toUpperCase();
  return cachedRole;
}

export default function PrinterCenterRuntime() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let lastPrinting = false;

    // Remove the experimental pre-navigation mask if a previous build left it
    // on the body. KitchenFlashGuard owns the Kitchen transition separately.
    document.body.classList.remove("printer-center-transition");

    const detect = async () => {
      const printing = printerViewVisible();

      if (!printing) {
        lastPrinting = false;
        setActive(false);
        return;
      }

      if (ALLOWED_ROLES.has(cachedRole)) {
        lastPrinting = true;
        setActive(true);
        return;
      }

      if (lastPrinting || checking) return;
      lastPrinting = true;
      checking = true;

      try {
        const role = await resolveRole();
        if (!cancelled) setActive(ALLOWED_ROLES.has(role));
      } catch {
        if (!cancelled) setActive(false);
      } finally {
        checking = false;
      }
    };

    void detect();

    const observer = new MutationObserver(() => {
      void detect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const onViewChange = () => {
      lastPrinting = false;
      void detect();
    };

    const onLogout = (event) => {
      const button = event.target.closest(".top nav button");
      if (!button) return;
      const label = String(button.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      if (label.startsWith("KELUAR")) cachedRole = "";
    };

    document.addEventListener("click", onLogout, true);
    window.addEventListener("popstate", onViewChange);
    window.addEventListener("warkost:view-changed", onViewChange);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("click", onLogout, true);
      window.removeEventListener("popstate", onViewChange);
      window.removeEventListener("warkost:view-changed", onViewChange);
      document.body.classList.remove("printer-center-transition");
    };
  }, []);

  if (!active) return null;
  return <AdminPrinterController />;
}
