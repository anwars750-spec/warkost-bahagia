"use client";

import { useLayoutEffect } from "react";

function isLegacyKitchenView() {
  const main = document.querySelector("main");
  const heading = main?.querySelector(".heading h1")?.textContent?.trim().toLowerCase();
  return Boolean(main?.querySelector(".order-list")) && heading === "antrean makanan";
}

export default function KitchenFlashGuard() {
  useLayoutEffect(() => {
    let frame = 0;

    const sync = () => {
      document.body.classList.toggle(
        "kitchen-dashboard-transition",
        isLegacyKitchenView(),
      );
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    sync();

    const main = document.querySelector("main");
    const observer = new MutationObserver(scheduleSync);
    if (main) observer.observe(main, { childList: true });

    const onNavClick = (event) => {
      if (!event.target.closest?.("header.top nav button")) return;
      scheduleSync();
    };
    document.addEventListener("click", onNavClick, true);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", onNavClick, true);
      document.body.classList.remove("kitchen-dashboard-transition");
    };
  }, []);

  return null;
}
