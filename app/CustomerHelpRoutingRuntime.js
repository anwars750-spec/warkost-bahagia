"use client";

import { useEffect } from "react";

const HELP_CHAT_SELECTOR = ".customer-help .help-actions a:not([href^='tel:'])";
const ADMIN_SUPPORT_SELECTOR = ".support-admin-action";
const ORDER_SUPPORT_SELECTOR = ".support-communication-card.primary-chat:not(:disabled)";
const STYLE_ID = "warkost-customer-help-routing-style";

function uuidV4FromRandomValues(cryptoApi) {
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function ensureCheckoutUuidSupport() {
  const cryptoApi = globalThis.crypto;
  if (
    !cryptoApi ||
    typeof cryptoApi.randomUUID === "function" ||
    typeof cryptoApi.getRandomValues !== "function"
  )
    return;

  Object.defineProperty(cryptoApi, "randomUUID", {
    configurable: true,
    value: () => uuidV4FromRandomValues(cryptoApi),
  });
}

export default function CustomerHelpRoutingRuntime() {
  useEffect(() => {
    ensureCheckoutUuidSupport();

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .customer-help .help-actions a[href^="tel:"] {
          display: none !important;
        }
        .customer-help .help-actions a:not([href^="tel:"]) {
          cursor: pointer;
        }
        .support-admin-action[data-general-support="true"] {
          opacity: 1 !important;
          cursor: pointer !important;
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(style);
    }

    const enableGeneralSupport = () => {
      const button = document.querySelector(ADMIN_SUPPORT_SELECTOR);
      if (!button) return;
      if (!document.querySelector(".support-order-context")) {
        button.disabled = false;
        button.dataset.generalSupport = "true";
        button.removeAttribute("aria-disabled");
      } else {
        delete button.dataset.generalSupport;
      }
    };

    const observer = new MutationObserver(enableGeneralSupport);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    enableGeneralSupport();

    const openGeneralSupport = (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelector(".support-sheet .sheet-close")?.click();
      window.dispatchEvent(
        new CustomEvent("warkost:open-general-customer-service"),
      );
    };

    const onClick = (event) => {
      const adminSupport = event.target.closest(ADMIN_SUPPORT_SELECTOR);
      if (adminSupport && !document.querySelector(".support-order-context")) {
        openGeneralSupport(event);
        return;
      }

      const chatAction = event.target.closest(HELP_CHAT_SELECTOR);
      if (!chatAction) return;

      event.preventDefault();
      event.stopPropagation();

      const helpButton = document.querySelector(
        'button.home-nav-item[aria-label="Bantuan"]',
      );
      if (!helpButton) return;

      helpButton.click();

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          enableGeneralSupport();
          const target =
            document.querySelector(ORDER_SUPPORT_SELECTOR) ||
            document.querySelector(ADMIN_SUPPORT_SELECTOR);
          target?.click();
        });
      });
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
