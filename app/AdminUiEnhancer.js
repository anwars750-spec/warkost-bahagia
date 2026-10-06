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
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-9 8 9 9 0 0 1-4-1l-5 2 2-5a8 8 0 1 1 16-4Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
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

const KPI_MOBILE_LABELS = [
  "Order",
  "Revenue",
  "Menunggu",
  "Disiapkan",
  "Siap antar",
  "Diantar",
  "Selesai",
  "Pelanggan",
  "Driver",
  "Poin",
];

const ORDER_STEPS = [
  ["PENDING", "Pesanan masuk"],
  ["CONFIRMED", "Dikonfirmasi"],
  ["PREPARING", "Disiapkan"],
  ["READY", "Siap antar"],
  ["ASSIGNED", "Driver ambil"],
  ["PICKED_UP", "Pickup"],
  ["ON_DELIVERY", "Dalam pengantaran"],
  ["DELIVERED", "Selesai"],
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

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const todayLabel = () =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

const driverCopyForStatus = (status) => {
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY", "DELIVERED"].includes(status))
    return "Driver sudah menangani pesanan";
  if (status === "READY") return "Menunggu driver mengambil pesanan";
  return "Menunggu pesanan siap untuk driver";
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

    const removeOrderDetailEnhancement = (card) => {
      card.classList.remove("admin-order-expanded");
      card.querySelector(":scope > .admin-order-detail-v1")?.remove();
      card
        .querySelector(":scope > .actions .admin-detail-action-summary")
        ?.remove();
      card.querySelector(":scope > .admin-detail-toggle")?.classList.remove("admin-detail-toggle");
    };

    const resetOrderCards = () => {
      getOrders().forEach((card) => {
        card.hidden = false;
        removeOrderDetailEnhancement(card);
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

    const removeSummary = () => {
      document.getElementById("admin-daily-summary")?.remove();
    };

    const clearAdminDecorations = () => {
      removeAdminTools();
      removeSummary();
      document.body.classList.remove("admin-ui-mode", "admin-operations-view");
      document.querySelector("header.top")?.classList.remove("admin-ui-header");
      document.querySelector("main")?.classList.remove("admin-ui-main");
      document.querySelector("main .heading")?.classList.remove("admin-ui-heading");
      document.querySelector("header.top nav")?.classList.remove("admin-nav");
      document
        .querySelectorAll("header.top nav button")
        .forEach((button) => {
          button.classList.remove("admin-nav-active");
          delete button.dataset.adminNav;
          button.querySelector(".admin-nav-icon")?.remove();
        });
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

    const decorateOrderDetail = (card) => {
      const details = card.querySelector(":scope > .order-details");
      if (!details) {
        removeOrderDetailEnhancement(card);
        return;
      }

      const headMeta = card.querySelector(".order-head small")?.textContent?.trim() || "";
      const customer = card.querySelector(".order-head h2")?.textContent?.trim() || "Pelanggan";
      const status = card.dataset.orderStatus || "";
      const address = card.querySelector(":scope > p")?.textContent?.trim() || "Alamat belum tersedia";
      const total = card.querySelector(":scope > .line strong")?.textContent?.trim() || "Rp0";
      const payment = card.querySelector(":scope > .line span")?.textContent?.trim() || "";
      const stationNodes = [...card.querySelectorAll(".station-statuses .badge")];
      const stations = stationNodes.map((node) => node.textContent.trim());
      const idMatch = headMeta.match(/#(\d+)/);
      const orderId = idMatch ? idMatch[1] : "";
      const displayOrder = orderId ? `WB${String(orderId).padStart(6, "0")}` : "Pesanan";
      const dateText = headMeta.includes("·") ? headMeta.split("·").slice(1).join("·").trim() : headMeta;

      const itemRows = [...details.querySelectorAll(":scope > .line")].map((line) => {
        const text = line.querySelector("span")?.textContent?.trim() || "Item";
        const amount = line.querySelector("strong")?.textContent?.trim() || "";
        const match = text.match(/^(\d+)\s*×\s*(.*?)(?:\s*·\s*(.*))?$/);
        return {
          qty: match?.[1] || "",
          name: match?.[2] || text,
          station: match?.[3] || "",
          amount,
        };
      });

      const eventMap = new Map();
      [...details.querySelectorAll(":scope > p")].forEach((node) => {
        const text = node.textContent.trim();
        const splitAt = text.lastIndexOf(" · ");
        if (splitAt < 0) return;
        const time = text.slice(0, splitAt).trim();
        const eventStatus = text
          .slice(splitAt + 3)
          .trim()
          .replaceAll(" ", "_")
          .toUpperCase();
        eventMap.set(eventStatus, time);
      });

      const signature = JSON.stringify({
        headMeta,
        customer,
        status,
        address,
        total,
        payment,
        stations,
        itemRows,
        events: [...eventMap.entries()],
      });

      const existing = card.querySelector(":scope > .admin-order-detail-v1");
      if (existing?.dataset.signature === signature) {
        card.classList.add("admin-order-expanded");
        return;
      }

      existing?.remove();
      card
        .querySelector(":scope > .actions .admin-detail-action-summary")
        ?.remove();
      card.classList.add("admin-order-expanded");

      const toggle = [...card.querySelectorAll(":scope > button")].find((button) =>
        /detail|riwayat/i.test(button.textContent),
      );
      toggle?.classList.add("admin-detail-toggle");

      const currentIndex = ORDER_STEPS.findIndex(([key]) => key === status);
      const timeline = ORDER_STEPS.map(([key, label], index) => {
        const eventTime = eventMap.get(key) || "";
        const state =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        return `
          <div class="admin-detail-step ${state}">
            <span class="admin-detail-step-dot">${index < currentIndex ? ICONS.check : index + 1}</span>
            <div>
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(eventTime || (index === currentIndex ? "Status saat ini" : ""))}</small>
            </div>
          </div>
        `;
      }).join("");

      const itemsMarkup = itemRows.length
        ? itemRows
            .map(
              (item) => `
                <div class="admin-detail-item">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>
                      ${item.qty ? `${escapeHtml(item.qty)}×` : ""}
                      ${item.station ? `<em>${escapeHtml(item.station)}</em>` : ""}
                    </span>
                  </div>
                  <strong>${escapeHtml(item.amount)}</strong>
                </div>
              `,
            )
            .join("")
        : '<p class="admin-detail-empty">Belum ada detail item.</p>';

      const detailSection = document.createElement("section");
      detailSection.className = "admin-order-detail-v1";
      detailSection.dataset.signature = signature;
      detailSection.innerHTML = `
        <div class="admin-detail-hero">
          <div class="admin-detail-order-id">
            ${iconMarkup("receipt", "admin-svg-icon admin-detail-hero-icon")}
            <div>
              <small>DETAIL PESANAN</small>
              <strong>#${escapeHtml(displayOrder)}</strong>
              <span>${escapeHtml(dateText)}</span>
            </div>
          </div>
          <span class="admin-detail-status ${escapeHtml(statusGroup(status))}">${escapeHtml(status.replaceAll("_", " "))}</span>
        </div>

        <div class="admin-detail-info-grid">
          <section class="admin-detail-info-card">
            <span class="admin-detail-info-icon">${ICONS.customer}</span>
            <div>
              <small>PELANGGAN</small>
              <strong>${escapeHtml(customer)}</strong>
              <span>${escapeHtml(address)}</span>
              <button type="button" disabled>${iconMarkup("chat")} Chat Customer · segera tersedia</button>
            </div>
          </section>
          <section class="admin-detail-info-card">
            <span class="admin-detail-info-icon">${ICONS.truck}</span>
            <div>
              <small>PENGIRIMAN</small>
              <strong>${escapeHtml(driverCopyForStatus(status))}</strong>
              <span>${escapeHtml(address)}</span>
              <span class="admin-detail-delivery-state">Status order · ${escapeHtml(status.replaceAll("_", " "))}</span>
            </div>
          </section>
        </div>

        <section class="admin-detail-section">
          <div class="admin-detail-section-title">
            <span>${ICONS.receipt}</span>
            <div><small>RINGKASAN</small><h3>Item pesanan</h3></div>
          </div>
          <div class="admin-detail-items">${itemsMarkup}</div>
          <div class="admin-detail-total-row">
            <span>Total pesanan</span>
            <strong>${escapeHtml(total)}</strong>
          </div>
        </section>

        <section class="admin-detail-section admin-detail-timeline-section">
          <div class="admin-detail-section-title">
            <span>${ICONS.clock}</span>
            <div><small>PROGRESS</small><h3>Perjalanan pesanan</h3></div>
          </div>
          <div class="admin-detail-timeline">${timeline}</div>
        </section>
      `;
      details.before(detailSection);

      const actions = card.querySelector(":scope > .actions");
      if (actions) {
        const stationMarkup = stations.length
          ? stations.map((station) => `<span>${escapeHtml(station)}</span>`).join("")
          : '<span>Belum ada station aktif</span>';
        actions.insertAdjacentHTML(
          "afterbegin",
          `
            <div class="admin-detail-action-summary">
              <small>TINDAKAN ADMIN</small>
              <div class="admin-detail-action-total">
                <span>Total</span><strong>${escapeHtml(total)}</strong>
              </div>
              <span class="admin-detail-payment">${escapeHtml(payment || "Belum ada status pembayaran")}</span>
              <div class="admin-detail-stations">${stationMarkup}</div>
            </div>
          `,
        );
      }
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
        decorateOrderDetail(card);
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
        button.dataset.adminNav = label;
        const iconName = NAV_ICON[label];

        if (label === "Notifikasi") {
          button.querySelector(".admin-nav-icon")?.remove();
        } else if (iconName && !button.querySelector(".admin-nav-icon")) {
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
        const label = stat.querySelector("small");
        if (label) label.dataset.mobileLabel = KPI_MOBILE_LABELS[index] || label.textContent;
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

    const statValue = (main, labelPrefix) => {
      const stats = [
        ...main.querySelectorAll(".admin-kpi-grid .stat, .admin-payment-grid .stat"),
      ];
      const stat = stats.find((item) =>
        item.querySelector("small")?.textContent?.trim().startsWith(labelPrefix),
      );
      return stat?.querySelector("strong")?.textContent?.trim() || "0";
    };

    const setSummaryValue = (summary, key, value) => {
      const node = summary.querySelector(`[data-summary-value="${key}"]`);
      if (node && node.textContent !== value) node.textContent = value;
    };

    const ensureSummary = (main) => {
      const kpiGrid = main.querySelector(".admin-kpi-grid");
      if (!kpiGrid) return;

      let summary = document.getElementById("admin-daily-summary");
      if (!summary) {
        summary = document.createElement("section");
        summary.id = "admin-daily-summary";
        summary.className = "admin-daily-summary";
        summary.innerHTML = `
          <div class="admin-summary-head">
            <span class="admin-summary-icon">${ICONS.calendar}</span>
            <div>
              <small>RINGKASAN PENJUALAN</small>
              <strong>Hari ini</strong>
            </div>
            <span class="admin-summary-date">${todayLabel()}</span>
          </div>
          <div class="admin-summary-grid">
            <div><small>Total pesanan</small><strong data-summary-value="orders">0</strong></div>
            <div><small>Revenue</small><strong data-summary-value="revenue">Rp0</strong></div>
            <div><small>PAID</small><strong data-summary-value="paid">0</strong></div>
            <div><small>Selesai</small><strong data-summary-value="done">0</strong></div>
            <div class="admin-summary-secondary"><small>Menunggu</small><strong data-summary-value="waiting">0</strong></div>
            <div class="admin-summary-secondary"><small>Disiapkan</small><strong data-summary-value="preparing">0</strong></div>
            <div class="admin-summary-secondary"><small>Siap antar</small><strong data-summary-value="ready">0</strong></div>
            <div class="admin-summary-secondary"><small>Dalam pengantaran</small><strong data-summary-value="delivery">0</strong></div>
          </div>
        `;
        kpiGrid.before(summary);
      }

      setSummaryValue(summary, "orders", statValue(main, "Order hari ini"));
      setSummaryValue(summary, "revenue", statValue(main, "Revenue terverifikasi"));
      setSummaryValue(summary, "paid", statValue(main, "Pembayaran PAID"));
      setSummaryValue(summary, "done", statValue(main, "Selesai"));
      setSummaryValue(summary, "waiting", statValue(main, "Menunggu"));
      setSummaryValue(summary, "preparing", statValue(main, "Disiapkan"));
      setSummaryValue(summary, "ready", statValue(main, "Siap antar"));
      setSummaryValue(summary, "delivery", statValue(main, "Dalam pengantaran"));
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
        removeSummary();
        return;
      }

      const firstStats = main.querySelector(".stats:not(.payment-stats)");
      if (firstStats) firstStats.classList.add("admin-kpi-grid");
      main.querySelector(".payment-stats")?.classList.add("admin-payment-grid");
      main.querySelector(".order-list")?.classList.add("admin-order-list");
      main.querySelector(".refresh")?.classList.add("admin-refresh");

      decorateKpis(main);
      decorateRefresh(main);
      ensureSummary(main);
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
