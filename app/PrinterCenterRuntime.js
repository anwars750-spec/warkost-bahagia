"use client";

import { useEffect, useState } from "react";
import AdminPrinterController from "./AdminPrinterController";

const LEGACY_PRINTER_TITLE = "Antrean cetak struk 80mm";

export default function PrinterCenterRuntime() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let lastPrinting = false;

    const hasLegacyPrinterView = () => {
      const headings = document.querySelectorAll("main h2");
      return Array.from(headings).some(
        (heading) => heading.textContent?.trim() === LEGACY_PRINTER_TITLE,
      );
    };

    const detect = async () => {
      const printing = hasLegacyPrinterView();

      if (!printing) {
        lastPrinting = false;
        setActive(false);
        return;
      }

      if (lastPrinting || checking) return;
      lastPrinting = true;
      checking = true;

      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const role = String(data?.user?.role || "").toUpperCase();

        if (!cancelled) {
          setActive(response.ok && ["KITCHEN", "OWNER"].includes(role));
        }
      } catch {
        if (!cancelled) setActive(false);
      } finally {
        checking = false;
      }
    };

    detect();

    const observer = new MutationObserver(() => {
      void detect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onViewChange = () => {
      lastPrinting = false;
      void detect();
    };

    window.addEventListener("popstate", onViewChange);
    window.addEventListener("warkost:view-changed", onViewChange);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("popstate", onViewChange);
      window.removeEventListener("warkost:view-changed", onViewChange);
    };
  }, []);

  if (!active) return null;
  return <AdminPrinterController />;
}
