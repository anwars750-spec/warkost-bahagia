"use client";

import { useEffect } from "react";

export default function CustomerLocationLauncher() {
  useEffect(() => {
    const installed = new Set();

    function installLauncher() {
      const actions = document.querySelectorAll(".checkout-address-actions");
      for (const container of actions) {
        if (container.dataset.wlocLauncherReady === "1") continue;

        const original = container.querySelector(
          ".quick-address-toggle:not(.wloc-location-launcher)",
        );
        if (!original) continue;

        const launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "quick-address-toggle wloc-location-launcher";
        launcher.textContent = "+ Tambah lokasi lain";
        launcher.setAttribute("aria-expanded", "false");
        launcher.setAttribute("aria-label", "Pilih lokasi pengantaran");

        original.hidden = true;
        original.setAttribute("aria-hidden", "true");
        original.insertAdjacentElement("afterend", launcher);
        container.dataset.wlocLauncherReady = "1";
        installed.add({ container, original, launcher });
      }

      const legacyForms = document.querySelectorAll(".checkout-quick-address");
      for (const form of legacyForms) {
        if (!form.dataset.wlocLegacyHidden) {
          form.dataset.wlocLegacyHidden = "1";
          form.style.display = "none";
        }
      }
    }

    installLauncher();

    const observer = new MutationObserver(() => installLauncher());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const entry of installed) {
        entry.launcher.remove();
        entry.original.hidden = false;
        entry.original.removeAttribute("aria-hidden");
        delete entry.container.dataset.wlocLauncherReady;
      }
      const legacyForms = document.querySelectorAll(
        '.checkout-quick-address[data-wloc-legacy-hidden="1"]',
      );
      for (const form of legacyForms) {
        form.style.removeProperty("display");
        delete form.dataset.wlocLegacyHidden;
      }
    };
  }, []);

  return null;
}
