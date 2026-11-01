"use client";

import { useEffect } from "react";

export default function ManagerCashSyncBridge() {
  useEffect(() => {
    let lastManagerCash = null;

    const sync = () => {
      const cards = document.querySelectorAll(".manager-cash-summary article");
      if (cards.length < 2) return;
      const value = cards[1]?.querySelector("strong")?.textContent?.trim() || "";
      if (!value) return;

      if (lastManagerCash !== null && value !== lastManagerCash) {
        window.dispatchEvent(new CustomEvent("warkost:admin-settlement-submitted"));
      }
      lastManagerCash = value;
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
