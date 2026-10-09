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

    const finishPrinterTransition = () => {
      if (
        document.body.classList.contains("admin-printer-stable-view") &&
        document.getElementById("admin-printer-center-v1")
      ) {
        document.body.classList.remove("printer-center-transition");
      }
    };

    const detect = async () => {
      const printing = printerViewVisible();

      if (!printing) {
        lastPrinting = false;
        if (active) setActive(false);
        finishPrinterTransition();
        return;
      }

      if (ALLOWED_ROLES.has(cachedRole)) {
        lastPrinting = true;
        setActive(true);
        requestAnimationFrame(finishPrinterTransition);
        return;
      }

      if (lastPrinting || checking) return;
      lastPrinting = true;
      checking = true;

      try {
        const role = await resolveRole();
        if (!cancelled) {
          setActive(ALLOWED_ROLES.has(role));
          requestAnimationFrame(finishPrinterTransition);
        }
      } catch {
        if (!cancelled) setActive(false);
      } finally {
        checking = false;
      }
    };

    const onNavigationIntent = (event) => {
      const button = event.target.closest(".top nav button");
      if (!button) return;
      const label = String(button.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

      if (label.startsWith("PRINTER")) {
        document.body.classList.add("printer-center-transition");
        document.body.classList.remove("kitchen-dashboard-transition");
        lastPrinting = false;
        if (ALLOWED_ROLES.has(cachedRole)) setActive(true);
        return;
      }

      if (label.startsWith("DAPUR")) {
        document.body.classList.add("kitchen-dashboard-transition");
        document.body.classList.remove("printer-center-transition");
        lastPrinting = false;
        setActive(false);
        return;
      }

      if (label.startsWith("KELUAR")) {
        cachedRole = "";
        document.body.classList.remove(
          "printer-center-transition",
          "kitchen-dashboard-transition",
        );
        setActive(false);
      }
    };

    document.addEventListener("click", onNavigationIntent, true);
    void detect();

    const observer = new MutationObserver(() => {
      finishPrinterTransition();
      void detect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    const onViewChange = () => {
      lastPrinting = false;
      void detect();
    };

    window.addEventListener("popstate", onViewChange);
    window.addEventListener("warkost:view-changed", onViewChange);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("click", onNavigationIntent, true);
      window.removeEventListener("popstate", onViewChange);
      window.removeEventListener("warkost:view-changed", onViewChange);
      document.body.classList.remove("printer-center-transition");
    };
  }, [active]);

  if (!active) return null;
  return <AdminPrinterController />;
}
