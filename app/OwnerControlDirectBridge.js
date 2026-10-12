"use client";

import { useEffect } from "react";

const CASH_SETTLEMENT_LABEL = "Setoran Kas";
const REPORT_LABEL = "Laporan";

function controlLabel(button) {
  return button?.querySelector("strong")?.textContent?.trim() || "";
}

function openCashSettlementModal() {
  const launcher = document.querySelector(
    '[data-owner-cash-settlement-nav="true"]',
  );
  if (!launcher) return false;
  launcher.click();
  return true;
}

function ownerNavButton(label) {
  const wanted = String(label || "").trim().toLowerCase();
  return [...document.querySelectorAll("header.top nav button")].find((item) =>
    item.textContent
      .trim()
      .replace(/^Rp\s*/i, "")
      .toLowerCase() === wanted,
  );
}

function openOwnerReport() {
  const button = ownerNavButton(REPORT_LABEL);
  if (!button) return false;
  button.click();
  return true;
}

function retry(action) {
  if (action()) return;
  let attempts = 0;
  const maxAttempts = 20;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (action() || attempts >= maxAttempts) window.clearInterval(timer);
  }, 25);
}

export default function OwnerControlDirectBridge() {
  useEffect(() => {
    const onClickCapture = (event) => {
      const button = event.target?.closest?.(".owner-control-grid-v3 > button");
      if (!button) return;
      const label = controlLabel(button);
      if (![CASH_SETTLEMENT_LABEL, REPORT_LABEL].includes(label)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      // Kontrol Usaha opens the real module directly. The generic preview card
      // is intentionally skipped for modules that already have a full UI.
      document.querySelector(".owner-popup-close")?.click();
      retry(label === CASH_SETTLEMENT_LABEL ? openCashSettlementModal : openOwnerReport);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}
