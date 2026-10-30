"use client";

import { useEffect } from "react";
import { ensurePrintBranding } from "../lib/print-branding.mjs";

const PRINT_SELECTOR = [
  ".admin-settlement-print-sheet",
  ".admin-order-print-sheet",
  ".kitchen-print-sheet",
  "[data-warkost-print-sheet='true']",
].join(",");

function ensureBranding(sheet) {
  if (!(sheet instanceof HTMLElement)) return;
  ensurePrintBranding(sheet);
}

function applyBranding() {
  document.querySelectorAll(PRINT_SELECTOR).forEach(ensureBranding);
}

export default function PrintBrandingRuntime() {
  useEffect(() => {
    applyBranding();

    const observer = new MutationObserver(() => applyBranding());
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("beforeprint", applyBranding);
    window.addEventListener("warkost:print-ready", applyBranding);

    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", applyBranding);
      window.removeEventListener("warkost:print-ready", applyBranding);
    };
  }, []);

  return null;
}
