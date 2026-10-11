"use client";

import { useLayoutEffect } from "react";

function normalizedHeading() {
  return document
    .querySelector("main .heading h1")
    ?.textContent?.trim()
    .toLowerCase();
}

function isLegacyKitchenView() {
  const main = document.querySelector("main");
  return Boolean(main?.querySelector(".order-list")) && normalizedHeading() === "antrean makanan";
}

function isLegacyKitchenStockView() {
  return normalizedHeading() === "stok makanan";
}

function navLabel(button) {
  return String(button?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export default function KitchenFlashGuard() {
  useLayoutEffect(() => {
    let frame = 0;
    let pendingStock = false;

    const sync = () => {
      const stockModern = document.body.classList.contains(
        "kitchen-stock-modern-active",
      );

      document.body.classList.toggle(
        "kitchen-dashboard-transition",
        !pendingStock && isLegacyKitchenView(),
      );

      document.body.classList.toggle(
        "kitchen-stock-transition",
        !stockModern && (pendingStock || isLegacyKitchenStockView()),
      );

      if (stockModern) pendingStock = false;
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    sync();

    const main = document.querySelector("main");
    const observer = new MutationObserver(scheduleSync);
    if (main) observer.observe(main, { childList: true, subtree: false });

    const onNavClick = (event) => {
      const button = event.target.closest?.("header.top nav button");
      if (!button) return;

      const label = navLabel(button);
      if (label.startsWith("STOK MAKANAN")) {
        /* Hide the outgoing/native frame immediately, before React swaps views.
           This prevents the one-frame stock flash/layout jump that feels like
           a vibration when entering Kitchen Stock. */
        pendingStock = true;
        document.body.classList.add("kitchen-stock-transition");
        document.body.classList.remove("kitchen-dashboard-transition");
      } else {
        pendingStock = false;
        document.body.classList.remove("kitchen-stock-transition");
      }

      scheduleSync();
    };

    document.addEventListener("click", onNavClick, true);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", onNavClick, true);
      document.body.classList.remove(
        "kitchen-dashboard-transition",
        "kitchen-stock-transition",
      );
    };
  }, []);

  return null;
}
