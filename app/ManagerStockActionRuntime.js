"use client";

import { useEffect } from "react";

export default function ManagerStockActionRuntime() {
  useEffect(() => {
    const currentDrawer = () => {
      const drawer = document.querySelector(
        '[data-manager-stock-drawer="true"]',
      );
      return drawer && typeof drawer.openFor === "function" ? drawer : null;
    };

    const handleClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const stockPage = target.closest(".manager-stock-page");
      if (!stockPage) return;

      const rowAction = target.closest(".manager-stock-action");
      const toolbarAction = target.closest(".manager-stock-adjust-all");
      if (!rowAction && !toolbarAction) return;

      const drawer = currentDrawer();
      if (!drawer) return;

      let row = rowAction?.closest(".manager-stock-row");
      if (!row) {
        row = [...stockPage.querySelectorAll(".manager-stock-row")].find(
          (candidate) => !candidate.hidden,
        );
      }
      if (!row) return;

      // The UI polish layer can rebuild the drawer after a stock refresh.
      // Always resolve the current drawer at click time so actions never keep
      // a stale reference to an already detached drawer.
      event.preventDefault();
      event.stopPropagation();
      drawer.openFor(row);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
