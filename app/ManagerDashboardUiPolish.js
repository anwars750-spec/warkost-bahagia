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
  ["Notifikasi", "notifications"],
  ["Keluar", "logout"],
];

function activeNavFromHeading(heading) {
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

      if (!root) {
        document.body.classList.remove("manager-dashboard-polished");
        header?.classList.remove("manager-role-header");
        return;
      }

      document.body.classList.add("manager-dashboard-polished");
      header?.classList.add("manager-role-header");

      const heading = clean(root.querySelector(".manager-page-title h1")?.textContent);
      const activeNav = activeNavFromHeading(heading);

      header?.querySelectorAll("nav button").forEach((button) => {
        const text = clean(button.textContent);
        const match = navKeys.find(([label]) => text === label);
        if (!match) return;
        const [, key] = match;
        button.classList.add("manager-role-nav-item");
        button.dataset.managerNav = key;
        button.classList.toggle("manager-role-nav-active", key === activeNav);
        if (key === activeNav) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });

      root.querySelectorAll(".manager-period-tabs button").forEach((button) => {
        const label = clean(button.querySelector("span")?.textContent || button.textContent);
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
      document.querySelector("header.top")?.classList.remove("manager-role-header");
    };
  }, []);

  return null;
}
