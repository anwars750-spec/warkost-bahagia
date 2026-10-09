"use client";

import { useEffect, useState } from "react";
import AdminPrinterController from "./AdminPrinterController";

const LEGACY_PRINTER_TITLE = "Antrean cetak struk 80mm";

export default function PrinterCenterRuntime() {
  const [active, setActive] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setRole(String(data?.user?.role || "").toUpperCase());
      })
      .catch(() => {
        if (!cancelled) setRole("");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!["KITCHEN", "OWNER"].includes(role)) {
      setActive(false);
      return undefined;
    }

    const detect = () => {
      const headings = document.querySelectorAll("main section.panel h2");
      const printing = Array.from(headings).some(
        (heading) => heading.textContent?.trim() === LEGACY_PRINTER_TITLE,
      );
      setActive(printing);
    };

    detect();

    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", detect);
    window.addEventListener("warkost:view-changed", detect);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", detect);
      window.removeEventListener("warkost:view-changed", detect);
    };
  }, [role]);

  if (!active) return null;
  return <AdminPrinterController />;
}
