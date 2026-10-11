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
  if (sheet.querySelector(":scope > .warkost-print-brand")) return;

  const header = document.createElement("div");
  header.className = "warkost-print-brand";
  header.innerHTML = `
    <img src="/warkost-bahagia-logo-transparent.png" alt="Warkost Bahagia" />
    <div>
      <strong>WARKOST BAHAGIA</strong>
      <span>DELIVERY</span>
    </div>
  `;
  sheet.prepend(header);
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
