"use client";

import { useEffect } from "react";

const CASH_SETTLEMENT_LABEL = "Setoran Kas";
const REPORT_LABEL = "Laporan";
const REPORT_SCROLL_STYLE_ID = "owner-report-scroll-polish";

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

function ownerDashboardButton() {
  return (
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ) || null
  );
}

function openOwnerDashboard() {
  const button = ownerDashboardButton();
  if (!button) return false;
  button.click();
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  return true;
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

function installReportScrollPolish() {
  if (document.getElementById(REPORT_SCROLL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = REPORT_SCROLL_STYLE_ID;
  style.textContent = `
    body.owner-business-report-v2-active main {
      scroll-padding-top: 118px;
    }
    body.owner-business-report-v2-active .owner-business-report > *,
    body.owner-business-report-v2-active .obr-section,
    body.owner-business-report-v2-active .obr-health {
      scroll-margin-top: 118px;
    }
    @media (max-width: 820px) {
      body.owner-business-report-v2-active main {
        scroll-padding-top: 92px;
      }
      body.owner-business-report-v2-active .owner-business-report > *,
      body.owner-business-report-v2-active .obr-section,
      body.owner-business-report-v2-active .obr-health {
        scroll-margin-top: 92px;
      }
    }
  `;
  document.head.appendChild(style);
}

export default function OwnerControlDirectBridge() {
  useEffect(() => {
    installReportScrollPolish();

    const onClickCapture = (event) => {
      const brandButton = event.target?.closest?.("header.top .brand-button");
      if (brandButton && ownerDashboardButton()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        retry(openOwnerDashboard);
        return;
      }

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
