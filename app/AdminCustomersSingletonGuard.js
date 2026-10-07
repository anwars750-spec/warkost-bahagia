"use client";

import { useEffect } from "react";

export default function AdminCustomersSingletonGuard() {
  useEffect(() => {
    let scheduled = false;

    const cleanupDuplicates = () => {
      scheduled = false;
      const roots = [...document.querySelectorAll("#admin-customers-v1")];
      if (roots.length <= 1) return;

      // Keep the newest enhancer root. Older async mounts can finish later,
      // but rendering into a detached node will no longer affect the page.
      const keep = roots[roots.length - 1];
      roots.slice(0, -1).forEach((root) => root.remove());

      const nativePanels = [...document.querySelectorAll("main .panel")].filter((panel) =>
        panel.textContent.includes("Daftar pelanggan"),
      );
      nativePanels.forEach((panel) => panel.classList.add("admin-customers-native-hidden"));

      keep.dataset.singleton = "true";
    };

    const scheduleCleanup = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(cleanupDuplicates);
    };

    cleanupDuplicates();
    const observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
