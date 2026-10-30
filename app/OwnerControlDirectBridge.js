"use client";

import { useEffect } from "react";

const CASH_SETTLEMENT_LABEL = "Setoran Kas";
const REPORT_LABEL = "Laporan";
const PROMO_LABEL = "Promo";
const LOYALTY_LABEL = "Loyalty";
const STAFF_LABEL = "Staf";
const AUDIT_LABEL = "Audit Log";
const SETTINGS_LABEL = "Pengaturan";
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

function openOwnerPromo() {
  const button = ownerNavButton(PROMO_LABEL);
  if (!button) return false;
  button.click();
  return true;
}

function openOwnerLoyalty() {
  const button = ownerNavButton(LOYALTY_LABEL);
  if (!button) return false;
  button.click();
  return true;
}

function openOwnerStaff() {
  const button = ownerNavButton(STAFF_LABEL);
  if (!button) return false;
  button.click();
  return true;
}

function openOwnerAudit() {
  const button = ownerNavButton("Audit log");
  if (!button) return false;
  button.click();
  return true;
}

function openOwnerSettings() {
  const button = ownerNavButton(SETTINGS_LABEL);
  if (!button) return false;
  button.click();
  return true;
}

function markOwnerLegacyPromoPanel() {
  if (!ownerDashboardButton()) return false;
  const panel = [...document.querySelectorAll("main > section.panel")].find(
    (node) =>
      node
        .querySelector("h2")
        ?.textContent?.trim()
        .toLowerCase()
        .startsWith("promo customer"),
  );
  if (!panel) return false;
  panel.dataset.ownerPromoLegacyPanel = "true";
  panel.classList.add("manager-promo-center");
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
    body.owner-business-report-v2-active .obr-health.belum-ada-data {
      background: linear-gradient(120deg, #f6f7f6, #ffffff);
      border-color: #dde3df;
    }
    body.owner-business-report-v2-active .obr-health.belum-ada-data .obr-health-score strong {
      color: #66736a;
    }
    body.owner-business-report-v2-active .obr-health.belum-ada-data .obr-health-score em {
      display: none;
    }
    body.owner-business-report-v2-active .obr-health.belum-ada-data .obr-health-signals div span {
      background: #e9eeeb;
      color: #5f6f65;
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
    markOwnerLegacyPromoPanel();

    const promoPanelObserver = new MutationObserver(() => {
      markOwnerLegacyPromoPanel();
    });
    promoPanelObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-owner-nav-key"],
    });

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
      if (
        ![
          CASH_SETTLEMENT_LABEL,
          REPORT_LABEL,
          PROMO_LABEL,
          LOYALTY_LABEL,
          STAFF_LABEL,
          AUDIT_LABEL,
          SETTINGS_LABEL,
        ].includes(label)
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      // Kontrol Usaha membuka modul sebenarnya secara langsung. Popup preview
      // generik dilewati untuk modul yang sudah memiliki UI penuh.
      document.querySelector(".owner-popup-close")?.click();
      if (label === CASH_SETTLEMENT_LABEL) retry(openCashSettlementModal);
      else if (label === REPORT_LABEL) retry(openOwnerReport);
      else if (label === PROMO_LABEL) retry(openOwnerPromo);
      else if (label === LOYALTY_LABEL) retry(openOwnerLoyalty);
      else if (label === STAFF_LABEL) retry(openOwnerStaff);
      else if (label === AUDIT_LABEL) retry(openOwnerAudit);
      else retry(openOwnerSettings);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => {
      promoPanelObserver.disconnect();
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return null;
}
