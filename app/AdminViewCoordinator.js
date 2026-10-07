"use client";

import { useEffect } from "react";

export default function AdminViewCoordinator() {
  useEffect(() => {
    let observer = null;
    let raf = null;
    let lastRoute = "";
    let kickTimer = null;

    const navButtons = () => [
      ...document.querySelectorAll("header.top nav button"),
    ];

    const labelOf = (button) =>
      button?.textContent?.replace(/\d+/g, "").trim() || "";

    const isAdmin = () =>
      navButtons().some((button) => labelOf(button) === "Operasional");

    const customerPanel = () =>
      [...document.querySelectorAll("main .panel")].find(
        (panel) => panel.querySelector("h2")?.textContent?.trim() === "Daftar pelanggan",
      );

    const printerPanel = () =>
      [...document.querySelectorAll("main .panel")].find((panel) =>
        panel.textContent?.includes("Antrean cetak struk 80mm"),
      );

    const routeFromDom = () => {
      if (document.body.classList.contains("admin-beverage-stock-view")) return "stock";
      if (printerPanel()) return "printing";
      if (customerPanel()) return "customers";
      if (document.querySelector("main .order-list")) return "orders";
      return "other";
    };

    const cleanupOperationsArtifacts = () => {
      document.getElementById("admin-daily-summary")?.remove();
      document.getElementById("admin-order-tools")?.remove();
      document.body.classList.remove("admin-operations-view");
    };

    const setHeading = (text) => {
      const h1 = document.querySelector("main .heading h1");
      if (h1 && h1.textContent?.trim() !== text) h1.textContent = text;
    };

    const setCodVisible = (visible) => {
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
      block.style.display = visible ? "" : "none";
    };

    const setNativeActive = (route) => {
      const wanted =
        route === "orders" ? "Operasional" : route === "customers" ? "Pelanggan" : route === "printing" ? "Printer" : "";
      if (!wanted) return;
      navButtons().forEach((button) => {
        const label = labelOf(button);
        if (["Operasional", "Pelanggan", "Printer"].includes(label)) {
          button.classList.toggle("admin-nav-active", label === wanted);
        }
      });
    };

    const kickEnhancers = () => {
      const main = document.querySelector("main");
      if (!main) return;
      const marker = document.createElement("span");
      marker.hidden = true;
      marker.dataset.adminViewCoordinatorKick = "1";
      main.appendChild(marker);
      requestAnimationFrame(() => marker.remove());
    };

    const applyRoute = (route) => {
      if (!isAdmin()) return;

      if (route === "orders") {
        setHeading("Pantau pesanan hari ini");
        setCodVisible(true);
        setNativeActive(route);
        if (
          !document.getElementById("admin-daily-summary") ||
          !document.getElementById("admin-order-tools")
        ) {
          kickEnhancers();
        }
      } else if (route === "customers") {
        cleanupOperationsArtifacts();
        setHeading("Kelola pelanggan");
        setCodVisible(false);
        setNativeActive(route);
        kickEnhancers();
      } else if (route === "printing") {
        cleanupOperationsArtifacts();
        setCodVisible(false);
        setNativeActive(route);
        document.body.classList.add("admin-printer-stable-view");
        kickEnhancers();
      } else if (route === "stock") {
        cleanupOperationsArtifacts();
        setCodVisible(false);
      } else {
        cleanupOperationsArtifacts();
      }

      document.body.dataset.adminRoute = route;
      lastRoute = route;
    };

    const reconcile = () => {
      if (!isAdmin()) return;
      const route = routeFromDom();
      if (route !== lastRoute) applyRoute(route);
      else if (route === "orders") {
        if (
          !document.getElementById("admin-daily-summary") ||
          !document.getElementById("admin-order-tools")
        ) {
          kickEnhancers();
        }
      } else if (route === "customers") {
        if (document.getElementById("admin-daily-summary") || document.getElementById("admin-order-tools")) {
          cleanupOperationsArtifacts();
        }
      }
    };

    const schedule = (delay = 0) => {
      if (kickTimer) clearTimeout(kickTimer);
      kickTimer = setTimeout(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(reconcile);
      }, delay);
    };

    const onClick = (event) => {
      const stock = event.target.closest?.("#admin-beverage-stock-nav-v2");
      if (stock) {
        cleanupOperationsArtifacts();
        setCodVisible(false);
        lastRoute = "stock";
        return;
      }

      const button = event.target.closest?.("header.top nav button");
      if (!button) return;
      const label = labelOf(button);
      if (!["Operasional", "Pelanggan", "Printer"].includes(label)) return;

      if (label !== "Operasional") cleanupOperationsArtifacts();
      [0, 60, 160, 320].forEach((delay) => setTimeout(reconcile, delay));
    };

    observer = new MutationObserver(() => schedule(30));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", reconcile);

    [0, 80, 220].forEach((delay) => setTimeout(reconcile, delay));

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (kickTimer) clearTimeout(kickTimer);
      observer?.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", reconcile);
      delete document.body.dataset.adminRoute;
    };
  }, []);

  return null;
}
