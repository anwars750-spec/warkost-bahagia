"use client";

import { useEffect } from "react";

const PRINT_SELECTOR = [
  ".admin-settlement-print-sheet",
  ".admin-order-print-sheet",
  ".kitchen-print-sheet",
  "[data-warkost-print-sheet='true']",
].join(",");

function ensureBranding(sheet) {
  if (!(sheet instanceof HTMLElement)) return;
  sheet.dataset.warkostPrintSheet = "true";

  let header = sheet.querySelector(":scope > .warkost-print-brand");
  if (!header) {
    header = document.createElement("div");
    header.className = "warkost-print-brand";
    sheet.prepend(header);
  }

  header.innerHTML = `
    <div class="warkost-print-brand-logo-wrap">
      <img src="/warkost-bahagia-logo-clean.png" alt="Warkost Bahagia" />
    </div>
    <div class="warkost-print-brand-copy">
      <strong>WARKOST BAHAGIA</strong>
      <span>DELIVERY</span>
    </div>
  `;
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
