"use client";

import { useEffect } from "react";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const summaryIcons = new Map([
  ["Total Pesanan", "orders"],
  ["Revenue", "revenue"],
  ["Qty Terjual", "quantity"],
  ["AOV (Rata-rata)", "aov"],
  ["PAID", "paid"],
  ["Selesai", "done"],
  ["Menunggu", "waiting"],
  ["Disiapkan", "preparing"],
  ["Siap Antar", "ready"],
  ["Dalam Pengantaran", "delivery"],
  ["Total Produk", "quantity"],
  ["Produk Aktif", "done"],
  ["Produk Nonaktif", "inactive"],
  ["Stok Rendah", "warning"],
]);

const sectionIcons = new Map([
  ["Ringkasan Penjualan", "summary"],
  ["Tren Penjualan", "trend"],
  ["Kontribusi Kategori", "category"],
  ["Insight", "insight"],
  ["Kategori Terlaris", "ranking"],
  ["Subkategori Terbaik", "ranking"],
  ["Produk Terlaris", "ranking"],
]);

const periodKeys = new Map([
  ["Hari ini", "today"],
  ["Kemarin", "yesterday"],
  ["7 hari", "week"],
  ["Bulan ini", "month"],
  ["Custom", "custom"],
]);

const navKeys = [
  ["Dashboard", "dashboard"],
  ["Produk & Menu", "products"],
  ["Subkategori", "subcategories"],
  ["Stok", "stock"],
  ["Promo", "promotions"],
  ["Banner", "banners"],
  ["Jam Operasional", "store-hours"],
  ["Notifikasi", "notifications"],
  ["Keluar", "logout"],
];

const navIconMasks = new Map([
  [
    "banners",
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='2.5'/%3E%3Ccircle cx='8.5' cy='9' r='1.5'/%3E%3Cpath d='m5.5 17 4.2-4.3 3.1 3.1 2.1-2.2 3.6 3.4'/%3E%3C/svg%3E\")",
  ],
  [
    "store-hours",
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='8.5'/%3E%3Cpath d='M12 7.5V12l3.2 2'/%3E%3C/svg%3E\")",
  ],
]);

function activeNavFromHeading(heading) {
  if (/kelola banner|banner customer/i.test(heading)) return "banners";
  if (/jam operasional/i.test(heading)) return "store-hours";
  if (/produk/i.test(heading)) return "products";
  if (/subkategori/i.test(heading)) return "subcategories";
  if (/stok/i.test(heading)) return "stock";
  if (/promo/i.test(heading)) return "promotions";
  if (/notifikasi/i.test(heading)) return "notifications";
  return "dashboard";
}

export default function ManagerDashboardUiPolish() {
  useEffect(() => {
    let frame = 0;

    const decorate = () => {
      const root = document.querySelector(".manager-control-center");
      const header = document.querySelector("header.top");
      const navButtons = [...(header?.querySelectorAll("nav button") || [])];
      const navTexts = navButtons.map((button) => clean(button.textContent));
      const managerHeader =
        navTexts.includes("Produk & Menu") && navTexts.includes("Subkategori");

      if (!root && !managerHeader) {
        document.body.classList.remove("manager-dashboard-polished");
        header?.classList.remove("manager-role-header");
        return;
      }

      document.body.classList.add("manager-dashboard-polished");
      header?.classList.add("manager-role-header");

      const heading = clean(
        [...(root?.querySelectorAll("h1, h2") || [])]
          .map((node) => node.textContent)
          .join(" ") || document.querySelector("main h1, main h2")?.textContent,
      );
      const activeNav = activeNavFromHeading(heading);

      navButtons.forEach((button) => {
        const text = clean(button.textContent);
        const match = navKeys.find(([label]) => text === label);
        if (!match) return;
        const [, key] = match;
        button.classList.add("manager-role-nav-item");
        button.dataset.managerNav = key;
        const iconMask = navIconMasks.get(key);
        if (iconMask) button.style.setProperty("--manager-nav-mask", iconMask);
        else button.style.removeProperty("--manager-nav-mask");
        button.classList.toggle("manager-role-nav-active", key === activeNav);
        if (key === activeNav) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });

      if (!root) return;

      root.querySelectorAll(".manager-period-tabs button").forEach((button) => {
        const label = clean(
          button.querySelector("span")?.textContent || button.textContent,
        );
        const key = periodKeys.get(label);
        if (key) button.dataset.managerPeriod = key;
      });

      root.querySelectorAll(".manager-summary-card").forEach((card) => {
        const label = clean(card.querySelector("div > small")?.textContent);
        const key = summaryIcons.get(label);
        if (key) card.dataset.managerIcon = key;
      });

      root.querySelectorAll(".manager-card").forEach((card) => {
        const title = clean(card.querySelector("header h2")?.textContent);
        const key = sectionIcons.get(title);
        if (key) card.dataset.managerSection = key;
      });

      root.querySelectorAll(".manager-ranking").forEach((card) => {
        const title = clean(card.querySelector("h2")?.textContent);
        card.dataset.rankingKind = title.includes("Subkategori")
          ? "subcategory"
          : title.includes("Produk")
            ? "product"
            : "category";
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(decorate);
    };

    decorate();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.body.classList.remove("manager-dashboard-polished");
      document
        .querySelector("header.top")
        ?.classList.remove("manager-role-header");
    };
  }, []);

  return null;
}
