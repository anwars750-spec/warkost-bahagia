"use client";

import { useEffect } from "react";

const HELP_CHAT_SELECTOR = ".customer-help .help-actions a:not([href^='tel:'])";
const INTERNAL_SUPPORT_SELECTOR = [
  ".support-communication-card.primary-chat:not(:disabled)",
  ".support-admin-action:not(:disabled)",
].join(",");
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
      `;
      document.head.appendChild(style);
    }

    const onClick = (event) => {
      const chatAction = event.target.closest(HELP_CHAT_SELECTOR);
      if (!chatAction) return;

      event.preventDefault();
      event.stopPropagation();

      const helpButton = document.querySelector(
        'button.home-nav-item[aria-label="Bantuan"]',
      );
      if (!helpButton) return;

      helpButton.click();

      // Jika customer memiliki pesanan yang dapat dijadikan konteks,
      // langsung buka percakapan Customer Service Admin. Jika belum ada,
      // pusat Bantuan tetap terbuka sehingga customer tidak dilempar ke luar aplikasi.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.querySelector(INTERNAL_SUPPORT_SELECTOR)?.click();
        });
      });
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
