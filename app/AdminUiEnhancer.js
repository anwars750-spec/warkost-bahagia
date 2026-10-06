"use client";

import { useEffect } from "react";

const FILTERS = [
  ["all", "Semua"],
  ["waiting", "Menunggu"],
  ["preparing", "Disiapkan"],
  ["ready", "Siap antar"],
  ["delivery", "Dalam pengantaran"],
  ["done", "Selesai"],
];

const statusGroup = (status) => {
  if (["PENDING", "CONFIRMED"].includes(status)) return "waiting";
  if (status === "PREPARING") return "preparing";
  if (status === "READY") return "ready";
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(status))
    return "delivery";
  if (status === "DELIVERED") return "done";
  return "other";
};

export default function AdminUiEnhancer() {
  useEffect(() => {
    let activeFilter = "all";
    let query = "";
    let timer = null;

    const isAdmin = () =>
      [...document.querySelectorAll("header.top nav button")].some(
        (button) => button.textContent.trim() === "Operasional",
      );

    const getOrders = () => [
      ...document.querySelectorAll("main .order-list > .order"),
    ];

    const annotateOrder = (card) => {
      const status =
        card.querySelector(".order-head .badge")?.textContent?.trim() || "";
      const payment =
        card.querySelector(":scope > .line span")?.textContent?.trim() || "";
      card.classList.add("admin-order-card");
      card.dataset.orderStatus = status.replaceAll(" ", "_").toUpperCase();
      card.dataset.orderGroup = statusGroup(card.dataset.orderStatus);
      card.dataset.paymentStatus = payment.toUpperCase();
    };

    const applyFilter = () => {
      const cards = getOrders();
      cards.forEach(annotateOrder);
      cards.forEach((card) => {
        const matchesGroup =
          activeFilter === "all" || card.dataset.orderGroup === activeFilter;
        const haystack = card.textContent.toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        card.hidden = !(matchesGroup && matchesQuery);
      });

      const tools = document.getElementById("admin-order-tools");
      if (!tools) return;
      FILTERS.forEach(([key]) => {
        const button = tools.querySelector(`[data-filter="${key}"]`);
        if (!button) return;
        const count =
          key === "all"
            ? cards.length
            : cards.filter((card) => card.dataset.orderGroup === key).length;
        const label = FILTERS.find(([item]) => item === key)?.[1] || key;
        button.textContent = `${label} (${count})`;
        button.classList.toggle("active", activeFilter === key);
      });
    };

    const ensureTools = (main) => {
      const orderList = main.querySelector(".order-list");
      if (!orderList || document.getElementById("admin-order-tools")) return;

      const tools = document.createElement("section");
      tools.id = "admin-order-tools";
      tools.className = "admin-order-tools";
      tools.innerHTML = `
        <label class="admin-order-search">
          <span aria-hidden="true">⌕</span>
          <span class="sr-only">Cari pesanan</span>
          <input type="search" placeholder="Cari nomor pesanan, pelanggan, atau alamat..." />
        </label>
        <div class="admin-order-filters" aria-label="Filter operasional"></div>
      `;

      const filterWrap = tools.querySelector(".admin-order-filters");
      FILTERS.forEach(([key, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.filter = key;
        button.textContent = label;
        button.addEventListener("click", () => {
          activeFilter = key;
          applyFilter();
        });
        filterWrap.appendChild(button);
      });

      tools.querySelector("input").addEventListener("input", (event) => {
        query = event.currentTarget.value.trim().toLowerCase();
        applyFilter();
      });

      orderList.before(tools);
      applyFilter();
    };

    const decorateNavigation = (header, headingText) => {
      const nav = header.querySelector("nav");
      if (!nav) return;
      nav.classList.add("admin-nav");
      [...nav.querySelectorAll("button")].forEach((button) => {
        const label = button.textContent.replace(/\d+/g, "").trim();
        button.classList.remove("admin-nav-active");
        if (
          (label === "Operasional" && headingText === "Pantau pesanan hari ini") ||
          (label === "Pelanggan" && headingText === "Kelola pelanggan") ||
          (label === "Printer" && headingText.includes("cetak")) ||
          (label === "Notifikasi" && headingText === "Notifikasi")
        ) {
          button.classList.add("admin-nav-active");
        }
      });
    };

    const decorate = () => {
      const admin = isAdmin();
      document.body.classList.toggle("admin-ui-mode", admin);
      if (!admin) return;

      const header = document.querySelector("header.top");
      const main = document.querySelector("main");
      if (!header || !main) return;

      header.classList.add("admin-ui-header");
      main.classList.add("admin-ui-main");

      const heading = main.querySelector(".heading");
      const headingText = heading?.querySelector("h1")?.textContent?.trim() || "";
      if (heading) heading.classList.add("admin-ui-heading");
      decorateNavigation(header, headingText);

      const onOperations = headingText === "Pantau pesanan hari ini";
      document.body.classList.toggle("admin-operations-view", onOperations);

      const firstStats = main.querySelector(".stats:not(.payment-stats)");
      if (firstStats) firstStats.classList.add("admin-kpi-grid");
      main.querySelector(".payment-stats")?.classList.add("admin-payment-grid");
      main.querySelector(".order-list")?.classList.add("admin-order-list");
      main.querySelector(".refresh")?.classList.add("admin-refresh");

      if (onOperations) ensureTools(main);
      applyFilter();
    };

    const scheduleDecorate = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(decorate, 40);
    };

    decorate();
    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      document.body.classList.remove("admin-ui-mode", "admin-operations-view");
    };
  }, []);

  return null;
}
