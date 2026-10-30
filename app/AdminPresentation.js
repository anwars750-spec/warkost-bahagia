"use client";
import { useLayoutEffect } from "react";

const icons = {
  search: (
    <svg viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  ),
  cup: (
    <svg viewBox="0 0 24 24">
      <path d="M6 7h11l-1 12H7L6 7Z" />
      <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 3c0 1 1 1.5 1 2.5M12 3c0 1 1 1.5 1 2.5" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24">
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  ),
  empty: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  pulse: (
    <svg viewBox="0 0 24 24">
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  printer: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
      <path d="M18 12h.01" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h15a3 3 0 0 1 3 3v10H5a2 2 0 0 1-2-2V6Z" />
      <path d="M3 6l12-3v3" />
      <path d="M16 12h5" />
      <circle cx="16" cy="12" r="1" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  preparing: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h12" />
      <path d="M7 2c0 5 2 6 5 8-3 2-5 3-5 8" />
      <path d="M17 2c0 5-2 6-5 8 3 2 5 3 5 8" />
      <path d="M6 22h12" />
    </svg>
  ),
  scooter: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M9 18h6l2-7h-7l-2 4" />
      <path d="M15 7h3l2 4" />
      <path d="M5 15h2" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h11v10H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  ),
  customer: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  driver: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
      <path d="M8 13h8" />
      <path d="M9 4h6" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0 2 5" />
      <path d="M20 4v7h-7" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-9 8 9 9 0 0 1-4-1l-5 2 2-5a8 8 0 1 1 16-4Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
};
export function AdminIcon({ name, className = "admin-svg-icon" }) {
  return (
    <span className={className} aria-hidden="true">
      {icons[name] || icons.receipt}
    </span>
  );
}
export const adminStatusGroup = (status) => {
  if (["PENDING", "CONFIRMED"].includes(status)) return "waiting";
  if (status === "PREPARING") return "preparing";
  if (status === "READY") return "ready";
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(status))
    return "delivery";
  if (status === "DELIVERED") return "done";
  return "other";
};
export const ADMIN_KPI_ICONS = [
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
export const ADMIN_KPI_MOBILE_LABELS = [
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

// Compatibility signals for existing cash/shift/realtime integrations. Content,
// navigation and classes on React elements are already final at commit time.
export function AdminWorkspaceLifecycle({ view, orders }) {
  useLayoutEffect(() => {
    document.body.classList.add("admin-ui-mode");
    document.body.classList.toggle("admin-operations-view", view === "orders");
    document.body.classList.toggle(
      "admin-beverage-stock-view",
      view === "admin-stock",
    );
    document.body.classList.toggle(
      "admin-printer-react-view",
      view === "printing",
    );
    return () =>
      document.body.classList.remove(
        "admin-ui-mode",
        "admin-operations-view",
        "admin-beverage-stock-view",
        "admin-printer-react-view",
      );
  }, [view]);
  useLayoutEffect(() => {
    if (view === "orders")
      window.dispatchEvent(new CustomEvent("warkost:admin-orders-rendered"));
  }, [view, orders]);
  return null;
}

export function AdminDailySummary({ dashboard }) {
  const count = (status) =>
    dashboard?.statuses?.find((item) => item.status === status)?.count || 0;
  const money = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");
  const values = [
    ["orders", "Total pesanan", dashboard?.today?.orders || 0],
    ["revenue", "Revenue", money(dashboard?.today?.revenue)],
    [
      "paid",
      "PAID",
      dashboard?.paymentStatuses?.find((item) => item.status === "PAID")
        ?.count || 0,
    ],
    ["done", "Selesai", count("DELIVERED")],
    ["waiting", "Menunggu", count("PENDING")],
    ["preparing", "Disiapkan", count("PREPARING")],
    ["ready", "Siap antar", count("READY")],
    [
      "delivery",
      "Dalam pengantaran",
      ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].reduce(
        (sum, status) => sum + Number(count(status)),
        0,
      ),
    ],
  ];
  return (
    <section id="admin-daily-summary" className="admin-daily-summary">
      <div className="admin-summary-head">
        <AdminIcon name="calendar" className="admin-summary-icon" />
        <div>
          <small>RINGKASAN PENJUALAN</small>
          <strong>Hari ini</strong>
        </div>
        <span className="admin-summary-date">
          {new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date())}
        </span>
      </div>
      <div className="admin-summary-grid">
        {values.map(([key, label, value], index) => (
          <div
            key={key}
            className={index > 3 ? "admin-summary-secondary" : undefined}
          >
            <small>{label}</small>
            <strong data-summary-value={key}>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
