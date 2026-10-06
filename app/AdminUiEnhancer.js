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

const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  printer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/><path d="M18 12h.01"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h15a3 3 0 0 1 3 3v10H5a2 2 0 0 1-2-2V6Z"/><path d="M3 6l12-3v3"/><path d="M16 12h5"/><circle cx="16" cy="12" r="1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  preparing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12"/><path d="M7 2c0 5 2 6 5 8-3 2-5 3-5 8"/><path d="M17 2c0 5-2 6-5 8 3 2 5 3 5 8"/><path d="M6 22h12"/></svg>',
  scooter: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 18h6l2-7h-7l-2 4"/><path d="M15 7h3l2 4"/><path d="M5 15h2"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
  customer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  driver: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/><path d="M8 13h8"/><path d="M9 4h6"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg>',
};

const NAV_ICON = {
  Operasional: "home",
  Pelanggan: "users",
  Printer: "printer",
  Notifikasi: "bell",
  Keluar: "logout",
};

const KPI_ICONS = [
  "receipt",
  "wallet",
  "clock",
  "preparing",
  "scooter",
  "truck",
  "check",
  "customer",
  "driver",
  "star",
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

const iconMarkup = (name, className = "admin-svg-icon") =>
  `<span class="${className}" aria-hidden="true">${ICONS[name] || ""}</span>`;

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

    const resetOrderCards = () => {
      getOrders().forEach((card) => {
        card.hidden = false;
        card.classList.remove("admin-order-card");
        delete card.dataset.orderStatus;
        delete card.dataset.orderGroup;
        delete card.dataset.paymentStatus;
      });
    };

    const removeAdminTools = () => {
      document.getElementById("admin-order-tools")?.remove();
      activeFilter = "all";
      query = "";
      resetOrderCards();
    };

    const clearAdminDecorations = () => {
      removeAdminTools();
      document.body.classList.remove("admin-ui-mode", "admin-operations-view");
      document.querySelector("header.top")?.classList.remove("admin-ui-header");
      document.querySelector("main")?.classList.remove("admin-ui-main");
      document.querySelector("main .heading")?.classList.remove("admin-ui-heading");
      document.querySelector("header.top nav")?.classList.remove("admin-nav");
      document
        .querySelectorAll("header.top nav button")
        .forEach((button) => button.classList.remove("admin-nav-active"));
      document
        .querySelector("main .stats.admin-kpi-grid")
        ?.classList.remove("admin-kpi-grid");
      document
        .querySelector("main .payment-stats.admin-payment-grid")
        ?.classList.remove("admin-payment-grid");
      document
        .querySelector("main .order-list.admin-order-list")
        ?.classList.remove("admin-order-list");
      document
        .querySelector("main .refresh.admin-refresh")
        ?.classList.remove("admin-refresh");
    };

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
      const tools = document.getElementById("admin-order-tools");
      if (!tools || !document.body.classList.contains("admin-operations-view")) {
        resetOrderCards();
        return;
      }

      const cards = getOrders();
      cards.forEach(annotateOrder);
      cards.forEach((card) => {
        const matchesGroup =
          activeFilter === "all" || card.dataset.orderGroup === activeFilter;
        const haystack = card.textContent.toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        card.hidden = !(matchesGroup && matchesQuery);
      });

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
      if (!orderList) return;

      const existing = document.getElementById("admin-order-tools");
      if (existing) {
        if (existing.nextElementSibling !== orderList) orderList.before(existing);
        applyFilter();
        return;
      }

      const tools = document.createElement("section");
      tools.id = "admin-order-tools";
      tools.className = "admin-order-tools";
      tools.innerHTML = `
        <label class="admin-order-search">
          ${iconMarkup("search", "admin-svg-icon admin-search-icon")}
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
        const iconName = NAV_ICON[label];
        if (iconName && !button.querySelector(".admin-nav-icon")) {
          button.insertAdjacentHTML(
            "afterbegin",
            iconMarkup(iconName, "admin-svg-icon admin-nav-icon"),
          );
        }
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

    const decorateKpis = (main) => {
      const grid = main.querySelector(".admin-kpi-grid");
      if (!grid) return;
      [...grid.querySelectorAll(":scope > .stat")].forEach((stat, index) => {
        if (stat.querySelector(".admin-kpi-icon")) return;
        const name = KPI_ICONS[index] || "receipt";
        stat.insertAdjacentHTML(
          "afterbegin",
          iconMarkup(name, `admin-svg-icon admin-kpi-icon admin-kpi-icon-${index + 1}`),
        );
      });
    };

    const decorateRefresh = (main) => {
      const refresh = main.querySelector(".admin-refresh");
      if (!refresh || refresh.querySelector(".admin-refresh-icon")) return;
      refresh.insertAdjacentHTML(
        "afterbegin",
        iconMarkup("refresh", "admin-svg-icon admin-refresh-icon"),
      );
    };

    const decorate = () => {
      if (!isAdmin()) {
        clearAdminDecorations();
        return;
      }

      const header = document.querySelector("header.top");
      const main = document.querySelector("main");
      if (!header || !main) {
        clearAdminDecorations();
        return;
      }

      document.body.classList.add("admin-ui-mode");
      header.classList.add("admin-ui-header");
      main.classList.add("admin-ui-main");

      const heading = main.querySelector(".heading");
      const headingText = heading?.querySelector("h1")?.textContent?.trim() || "";
      if (heading) heading.classList.add("admin-ui-heading");
      decorateNavigation(header, headingText);

      const onOperations = headingText === "Pantau pesanan hari ini";
      document.body.classList.toggle("admin-operations-view", onOperations);

      if (!onOperations) {
        removeAdminTools();
        return;
      }

      const firstStats = main.querySelector(".stats:not(.payment-stats)");
      if (firstStats) firstStats.classList.add("admin-kpi-grid");
      main.querySelector(".payment-stats")?.classList.add("admin-payment-grid");
      main.querySelector(".order-list")?.classList.add("admin-order-list");
      main.querySelector(".refresh")?.classList.add("admin-refresh");

      decorateKpis(main);
      decorateRefresh(main);
      ensureTools(main);
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
      clearAdminDecorations();
    };
  }, []);

  return null;
}
