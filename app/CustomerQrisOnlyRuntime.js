"use client";

import { useEffect } from "react";

const FULFILLMENT_STYLE_ID = "warkost-fulfillment-choice-polish";

function installFulfillmentStyles() {
  if (document.getElementById(FULFILLMENT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = FULFILLMENT_STYLE_ID;
  style.textContent = `
    .customer-fulfillment-option {
      position: relative !important;
      min-height: 92px !important;
      padding-left: 76px !important;
      text-align: left !important;
    }

    .customer-fulfillment-option::before {
      content: "";
      position: absolute;
      left: 18px;
      top: 50%;
      width: 42px;
      height: 42px;
      transform: translateY(-50%);
      border: 1px solid rgba(164, 61, 30, .16);
      border-radius: 13px;
      background-color: #fff7f1;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 23px 23px;
      box-shadow: 0 7px 18px rgba(104, 44, 32, .08);
    }

    .customer-fulfillment-option:first-child::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239a341f' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10h16l-1.6-5H5.6L4 10Z'/%3E%3Cpath d='M6 10v9h12v-9'/%3E%3Cpath d='M9 19v-5h6v5'/%3E%3Cpath d='M4 10c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2'/%3E%3C/svg%3E");
    }

    .customer-fulfillment-option:nth-child(2)::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239a341f' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h11v10H3z'/%3E%3Cpath d='M14 10h4l3 3v3h-7z'/%3E%3Ccircle cx='7' cy='18' r='2'/%3E%3Ccircle cx='18' cy='18' r='2'/%3E%3Cpath d='M14 18h2M3 18h2'/%3E%3C/svg%3E");
    }

    .customer-fulfillment-option.is-active::before {
      border-color: rgba(164, 61, 30, .42);
      background-color: #fff0e6;
      box-shadow: 0 8px 20px rgba(154, 52, 31, .14);
    }

    @media (max-width: 620px) {
      .customer-fulfillment-option {
        min-height: 86px !important;
        padding-left: 68px !important;
      }

      .customer-fulfillment-option::before {
        left: 14px;
        width: 38px;
        height: 38px;
        background-size: 21px 21px;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeCheckoutAddressActions(root = document) {
  const checkout = root.querySelector(".customer-checkout");
  const fulfillmentCard = checkout?.querySelector(
    ".customer-fulfillment-card[data-mode]",
  );
  if (!checkout || !fulfillmentCard) return;

  const mode = String(fulfillmentCard.dataset.mode || "").toUpperCase();
  const actions = checkout.querySelectorAll(".checkout-address-actions");

  for (const container of actions) {
    const launchers = Array.from(
      container.querySelectorAll(".wloc-location-launcher"),
    );
    const originals = Array.from(
      container.querySelectorAll(
        ".quick-address-toggle:not(.wloc-location-launcher)",
      ),
    );

    if (mode === "PICKUP") {
      container.style.setProperty("display", "none", "important");
      container.setAttribute("aria-hidden", "true");
      continue;
    }

    container.style.removeProperty("display");
    container.removeAttribute("aria-hidden");

    if (launchers.length) {
      originals.forEach((button) => {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
        button.style.setProperty("display", "none", "important");
      });

      const [primaryLauncher, ...duplicates] = launchers;
      primaryLauncher.hidden = false;
      primaryLauncher.removeAttribute("aria-hidden");
      primaryLauncher.style.removeProperty("display");
      duplicates.forEach((button) => button.remove());
    } else {
      const [primaryOriginal, ...duplicates] = originals;
      if (primaryOriginal) {
        primaryOriginal.hidden = false;
        primaryOriginal.removeAttribute("aria-hidden");
        primaryOriginal.style.removeProperty("display");
      }
      duplicates.forEach((button) => button.remove());
    }
  }

  if (mode === "PICKUP") {
    checkout.querySelectorAll(".wloc-location-launcher").forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.style.setProperty("display", "none", "important");
    });
  }
}

function enforceQrisOnly(root = document) {
  const cashInputs = root.querySelectorAll(
    'input[name="method"][value="CASH"]',
  );
  const qris = root.querySelector('input[name="method"][value="QRIS"]');

  if (!cashInputs.length && !qris) return;

  cashInputs.forEach((cash) => {
    const option =
      cash.closest(".payment-method-option") || cash.closest("label");

    if (option) {
      option.hidden = true;
      option.setAttribute("aria-hidden", "true");
      option.style.setProperty("display", "none", "important");
    }

    cash.disabled = true;
    cash.tabIndex = -1;
  });

  if (qris) {
    const qrisOption =
      qris.closest(".payment-method-option") || qris.closest("label");

    if (qrisOption) {
      qrisOption.style.setProperty("display", "", "");
      qrisOption.removeAttribute("aria-hidden");
    }

    if (!qris.checked) qris.click();
  }
}

export default function CustomerQrisOnlyRuntime() {
  useEffect(() => {
    let scheduled = false;

    installFulfillmentStyles();

    const apply = () => {
      enforceQrisOnly(document);
      normalizeCheckoutAddressActions(document);
    };

    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    apply();

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["checked", "class", "data-mode"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
