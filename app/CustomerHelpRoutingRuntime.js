"use client";

import { useEffect } from "react";

const HELP_CHAT_SELECTOR = ".customer-help .help-actions a:not([href^='tel:'])";
const ADMIN_SUPPORT_SELECTOR = ".support-admin-action";
const ORDER_SUPPORT_SELECTOR = ".support-communication-card.primary-chat:not(:disabled)";
const STYLE_ID = "warkost-customer-help-routing-style";

export default function CustomerHelpRoutingRuntime() {
  useEffect(() => {
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
