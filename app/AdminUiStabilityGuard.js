"use client";

import { useEffect } from "react";

export default function AdminUiStabilityGuard() {
  useEffect(() => {
    let observer = null;
    let raf = null;
    let lastOperationsKick = 0;
    let lastPrinterKick = 0;

    const navButtons = () => [
      ...document.querySelectorAll("header.top nav button"),
    ];

    const labelOf = (button) =>
      button?.textContent?.replace(/\d+/g, "").trim() || "";

    const isAdmin = () =>
      navButtons().some((button) => labelOf(button) === "Operasional");

    const portal = () => document.getElementById("admin-ui-portal-root");

    const findPrinterPanel = () =>
      [...document.querySelectorAll("main .panel")].find((panel) =>
        panel.textContent?.includes("Antrean cetak struk 80mm"),
      );

    const findCustomerPanel = () =>
      [...document.querySelectorAll("main .panel")].find((panel) =>
        panel.querySelector("h2")?.textContent?.trim() === "Daftar pelanggan",
      );

    const safeKick = (kind) => {
      const host = portal();
      if (!host) return;
      const now = Date.now();
      if (kind === "operations") {
        if (now - lastOperationsKick < 800) return;
        lastOperationsKick = now;
      } else {
        if (now - lastPrinterKick < 800) return;
        lastPrinterKick = now;
      }
      const marker = document.createElement("span");
      marker.hidden = true;
      marker.dataset.adminUiKick = kind;
      host.appendChild(marker);
      requestAnimationFrame(() => marker.remove());
    };

    const cleanLegacyStockArtifacts = () => {
      document
        .querySelectorAll("header.top nav [data-admin-stock-nav]")
        .forEach((node) => node.remove());
      document
        .querySelectorAll("main > #admin-beverage-stock-v1")
        .forEach((node) => node.remove());
    };

    const stabilizePrinter = () => {
      const host = portal();
      const printerPanel = findPrinterPanel();
      const root = document.getElementById("admin-printer-center-v1");

      if (printerPanel) {
        document.body.classList.add("admin-printer-stable-view");
        if (root && host && root.parentElement !== host) host.appendChild(root);
        if (!root) safeKick("printer");
        return true;
      }

      document.body.classList.remove("admin-printer-stable-view");
      const heading = document.querySelector("main .heading");
      if (
        heading &&
        heading.style.display === "none" &&
        !document.body.classList.contains("admin-beverage-stock-view")
      ) {
        heading.style.display = "";
      }
      return false;
    };

    const stabilizeHeading = (printing) => {
      if (printing) return;
      const main = document.querySelector("main");
      const h1 = main?.querySelector(".heading h1");
      if (!main || !h1) return;
      const text = h1.textContent?.trim() || "";
      if (text !== "Pusat cetak printer") return;

      if (findCustomerPanel()) {
        h1.textContent = "Kelola pelanggan";
        return;
      }
      if (main.querySelector(".order-list")) h1.textContent = "Pantau pesanan hari ini";
    };

    const stabilizeOperations = (printing) => {
      if (printing || document.body.classList.contains("admin-beverage-stock-view"))
        return;
      const main = document.querySelector("main");
      const headingText = main?.querySelector(".heading h1")?.textContent?.trim();
      if (headingText !== "Pantau pesanan hari ini") return;

      const hasStats = Boolean(main.querySelector(".stats:not(.payment-stats)"));
      const hasOrderList = Boolean(main.querySelector(".order-list"));
      const enhanced =
        Boolean(document.getElementById("admin-daily-summary")) &&
        Boolean(document.getElementById("admin-order-tools"));

      if (hasStats && hasOrderList && !enhanced) safeKick("operations");
    };

    const restoreCodOutsidePrinter = (printing) => {
      if (printing || document.body.classList.contains("admin-beverage-stock-view"))
        return;
      const matches = [...document.querySelectorAll("main *")].filter((node) =>
        node.textContent?.trim().includes("SETORAN COD"),
      );
      const leaf = matches.find(
        (node) =>
          ![...node.children].some((child) =>
            child.textContent?.trim().includes("SETORAN COD"),
          ),
      );
      if (!leaf) return;
      let block = leaf;
      while (
        block.parentElement &&
        block.parentElement.matches("main *") &&
        block.parentElement.textContent.trim().length < 260
      ) {
        block = block.parentElement;
      }
      if (block.style.display === "none") block.style.display = "";
    };

    const run = () => {
      if (!isAdmin()) {
        document.body.classList.remove("admin-printer-stable-view");
        return;
      }
      cleanLegacyStockArtifacts();
      const printing = stabilizePrinter();
      stabilizeHeading(printing);
      stabilizeOperations(printing);
      restoreCodOutsidePrinter(printing);
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };

    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
      document.body.classList.remove("admin-printer-stable-view");
    };
  }, []);

  return null;
}
