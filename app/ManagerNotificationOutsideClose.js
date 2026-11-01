"use client";

import { useEffect } from "react";

export default function ManagerNotificationOutsideClose() {
  useEffect(() => {
    const isNotificationTrigger = (target) => {
      const topTrigger = target?.closest?.(
        'header.top nav button[aria-label="Buka notifikasi"]',
      );
      if (topTrigger && !topTrigger.dataset.adminNav) return true;

      const moreTrigger = target?.closest?.(".manager-more-menu button");
      return moreTrigger?.textContent?.trim() === "Notifikasi";
    };

    const closeFromOutside = (event) => {
      const panel = document.querySelector(".manager-notification-panel");
      if (!panel) return;

      if (panel.contains(event.target)) return;
      if (isNotificationTrigger(event.target)) return;

      const closeButton = panel.querySelector("[data-manager-notif-close]");
      closeButton?.click();
    };

    document.addEventListener("pointerdown", closeFromOutside, true);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
    };
  }, []);

  return null;
}
