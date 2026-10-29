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
  return (
    Boolean(main?.querySelector(".order-list")) &&
    normalizedHeading() === "antrean makanan"
  );
}

function detectedKitchenView() {
  if (
    document.body.classList.contains("admin-printer-stable-view") ||
    document.body.classList.contains("admin-printer-react-view") ||
    document.getElementById("admin-printer-center-v1")
  ) {
    return "printer";
  }

  if (
    document.body.classList.contains("kitchen-stock-modern-active") ||
    normalizedHeading() === "stok makanan"
  ) {
    return "stock";
  }

  if (
    document.body.classList.contains("kitchen-dashboard-active") ||
    isLegacyKitchenView()
  ) {
    return "kitchen";
  }

  return null;
}

function navLabel(button) {
  return String(button?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function navTarget(button) {
  const label = navLabel(button);
  if (label.startsWith("STOK MAKANAN")) return "stock";
  if (label.startsWith("PRINTER")) return "printer";
  if (label.startsWith("DAPUR")) return "kitchen";
  return null;
}

export default function KitchenFlashGuard() {
  useLayoutEffect(() => {
    let frame = 0;
    let pendingTarget = null;

    const applyTarget = (target) => {
      if (!target) return;
      document.body.dataset.kitchenNavTarget = target;
    };

    const sync = () => {
      const actualView = detectedKitchenView();

      if (pendingTarget) {
        applyTarget(pendingTarget);
        if (actualView === pendingTarget) pendingTarget = null;
      } else if (actualView) {
        applyTarget(actualView);
      }

      document.body.classList.toggle(
        "kitchen-dashboard-transition",
        actualView === "kitchen" &&
          !document.body.classList.contains("kitchen-dashboard-active") &&
          isLegacyKitchenView(),
      );

      // Stock no longer uses a full-frame hiding transition. The modern stock
      // workspace mounts from the native stock view without showing an artificial
      // loading card or leaving the operator on an empty canvas.
      document.body.classList.remove("kitchen-stock-transition");
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    sync();

    const main = document.querySelector("main");
    const mainObserver = new MutationObserver(scheduleSync);
    if (main) mainObserver.observe(main, { childList: true, subtree: false });

    const bodyObserver = new MutationObserver(scheduleSync);
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const onNavClick = (event) => {
      const button = event.target.closest?.("header.top nav button");
      if (!button) return;

      const target = navTarget(button);
      if (!target) return;

      // Treat the user's click as navigation intent immediately. DOM-derived
      // runtime state may still represent the previous view for one render, so
      // do not let that stale state move the active highlight to another tab.
      pendingTarget = target;
      applyTarget(target);
      document.body.classList.remove("kitchen-stock-transition");
      if (target !== "kitchen") {
        document.body.classList.remove("kitchen-dashboard-transition");
      }
      scheduleSync();
    };

    document.addEventListener("click", onNavClick, true);

    return () => {
      mainObserver.disconnect();
      bodyObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", onNavClick, true);
      delete document.body.dataset.kitchenNavTarget;
      document.body.classList.remove(
        "kitchen-dashboard-transition",
        "kitchen-stock-transition",
      );
    };
  }, []);

  return null;
}
