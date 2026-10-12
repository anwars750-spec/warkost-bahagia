"use client";

import { useEffect } from "react";

const CASH_SETTLEMENT_LABEL = "Setoran Kas";

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

function openCashSettlementWithRetry() {
  if (openCashSettlementModal()) return;

  let attempts = 0;
  const maxAttempts = 20;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (openCashSettlementModal() || attempts >= maxAttempts) {
      window.clearInterval(timer);
    }
  }, 25);
}

export default function OwnerControlDirectBridge() {
  useEffect(() => {
    const onClickCapture = (event) => {
      const button = event.target?.closest?.(".owner-control-grid-v3 > button");
      if (!button || controlLabel(button) !== CASH_SETTLEMENT_LABEL) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      // Kontrol Usaha must open the real module directly, never the generic
      // preview card. Close a stale preview defensively before launching.
      document.querySelector(".owner-popup-close")?.click();
      openCashSettlementWithRetry();
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  return null;
}
