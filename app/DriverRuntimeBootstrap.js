"use client";

import { useLayoutEffect, useRef, useState } from "react";
import DriverControlCenter from "./DriverControlCenter";
import CodBatchSettlementCenter from "./CodBatchSettlementCenter";
import DriverDeliveryProofRuntime from "./DriverDeliveryProofRuntime";

function hasLegacyDriverSurface() {
  return Boolean(document.querySelector(".driver-trip-workspace"));
}

function setLegacyDriverChromeHidden(hidden) {
  const legacyHeader = document.querySelector("header.top");
  if (!legacyHeader) return;

  if (hidden) {
    legacyHeader.dataset.driverV2Hidden = "true";
    legacyHeader.setAttribute("aria-hidden", "true");
    legacyHeader.style.setProperty("display", "none", "important");

    // The legacy header nav becomes a fixed mobile bottom bar through the old
    // responsive CSS. Hide it explicitly as well so Tugas/COD/Notifikasi/Akun/
    // Keluar can never sit above Driver Center V2's icon navigation.
    legacyHeader.querySelectorAll("nav").forEach((nav) => {
      nav.dataset.driverV2Hidden = "true";
      nav.setAttribute("aria-hidden", "true");
      nav.style.setProperty("display", "none", "important");
    });
    return;
  }

  if (legacyHeader.dataset.driverV2Hidden === "true") {
    delete legacyHeader.dataset.driverV2Hidden;
    legacyHeader.removeAttribute("aria-hidden");
    legacyHeader.style.removeProperty("display");
  }

  legacyHeader.querySelectorAll('nav[data-driver-v2-hidden="true"]').forEach((nav) => {
    delete nav.dataset.driverV2Hidden;
    nav.removeAttribute("aria-hidden");
    nav.style.removeProperty("display");
  });
}

export default function DriverRuntimeBootstrap() {
  const [generation, setGeneration] = useState(0);
  const detectedRef = useRef(false);

  useLayoutEffect(() => {
    let observer = null;

    const syncDriverShell = () => {
      const legacyDriverVisible = hasLegacyDriverSurface();
      const v2Active = document.body.classList.contains("driver-v2-active");
      const shouldHideLegacyChrome = legacyDriverVisible || v2Active;

      setLegacyDriverChromeHidden(shouldHideLegacyChrome);

      if (legacyDriverVisible && !detectedRef.current) {
        detectedRef.current = true;
        document.body.classList.add("driver-v2-transition");

        // Remount both Driver runtimes immediately after a Driver login becomes
        // visible. Their original mount may have happened while the user was
        // still logged out, leaving auth state stale until the next poll.
        setGeneration((value) => value + 1);
      }

      if (!legacyDriverVisible && !v2Active && detectedRef.current) {
        detectedRef.current = false;
        document.body.classList.remove("driver-v2-transition");
      }
    };

    syncDriverShell();

    observer = new MutationObserver(syncDriverShell);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer?.disconnect();
      setLegacyDriverChromeHidden(false);
      document.body.classList.remove("driver-v2-transition");
    };
  }, []);

  return (
    <>
      <DriverControlCenter key={`driver-control-${generation}`} />
      <CodBatchSettlementCenter key={`driver-cod-${generation}`} />
      <DriverDeliveryProofRuntime key={`driver-proof-${generation}`} />
    </>
  );
}
