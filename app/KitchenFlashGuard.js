"use client";

import { useLayoutEffect } from "react";

function isLegacyKitchenView() {
  const main = document.querySelector("main");
  const heading = main?.querySelector(".heading h1")?.textContent?.trim().toLowerCase();
  return Boolean(main?.querySelector(".order-list")) && heading === "antrean makanan";
}

export default function KitchenFlashGuard() {
  useLayoutEffect(() => {
    const sync = () => {
      document.body.classList.toggle(
        "kitchen-dashboard-transition",
        isLegacyKitchenView(),
      );
    };

    sync();

    const main = document.querySelector("main");
    const observer = new MutationObserver(sync);
    observer.observe(main || document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      document.body.classList.remove("kitchen-dashboard-transition");
    };
  }, []);

  return null;
}
