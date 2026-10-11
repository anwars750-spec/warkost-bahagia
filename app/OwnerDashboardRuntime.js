"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const jakartaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const displayDate = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
};

const displayPeriod = (period) => {
  if (!period?.fromDate) return "—";
  if (period.fromDate === period.toDate) return displayDate(period.fromDate);
  return `${displayDate(period.fromDate)} – ${displayDate(period.toDate)}`;
};

async function request(route) {
  const response = await fetch(`/api/${route}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Gagal memuat dashboard Owner");
  return data;
}

function countStatus(statuses, wanted) {
  return (statuses || [])
    .filter((item) => wanted.includes(item.status))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function goToOwnerView(label) {
  const wanted = String(label || "")
    .trim()
    .toLowerCase();
  const button = [...document.querySelectorAll("header.top nav button")].find(
    (item) =>
      item.textContent
        .trim()
        .replace(/^Rp\s*/i, "")
        .toLowerCase() === wanted,
  );
  button?.click();
}

function openOwnerCashSettlement() {
  document.querySelector('[data-owner-cash-settlement-nav="true"]')?.click();
}

const Icon = ({ name }) => {
  const paths = {
    sales: "M4 19V9m5 10V5m5 14v-7m5 7V3",
    orders: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
    aov: "M12 3v18M8 7.5c0-1.4 1.8-2.5 4-2.5s4 1.1 4 2.5-1.3 2.2-4 2.7-4 1.3-4 3 1.8 2.8 4 2.8 4-1.2 4-2.8",
    cash: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
    digital: "M4 7h16v10H4zM8 12h8M8 15h4",
    warning: "M12 4 3 20h18L12 4Zm0 5v5m0 3h.01",
    box: "M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10",
    printer:
      "M6 9V4h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v6H6z",
    refresh:
      "M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5m-5 4a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5",
    report: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
    audit: "M9 11l2 2 4-4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    staff:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    activity: "M3 12h4l2-6 4 12 2-6h6",
    promo: "M20 13 13 20 4 11V4h7l9 9ZM8.5 8.5h.01",
    loyalty:
      "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
    operator:
      "M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3ZM9 12l2 2 4-4",
    settings:
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    close: "M6 6l12 12M18 6 6 18",
    arrow: "M5 12h14m-5-5 5 5-5 5",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[name] || paths.orders} />
    </svg>
  );
};

const STATUS_LABELS = {
  PENDING: "Menunggu",
  CONFIRMED: "Dikonfirmasi",
  PREPARING: "Disiapkan",
  READY: "Siap antar",
  ASSIGNED: "Driver ditugaskan",
  PICKED_UP: "Diambil driver",
  ON_DELIVERY: "Dalam pengantaran",
  DELIVERED: "Selesai",
};

export default function OwnerDashboardRuntime() {
  const today = jakartaDate();
  const [host, setHost] = useState(null);
  const [owner, setOwner] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [popup, setPopup] = useState(null);
  const [payload, setPayload] = useState({
    dashboard: null,
    stock: [],
    printJobs: [],
  });

  useEffect(() => {
    const sync = () => {
      const main = document.querySelector("main");
      const heading = main?.querySelector(".heading h1");
      const onDashboard = heading?.textContent?.trim() === "Ringkasan usaha";
      setVisible(Boolean(onDashboard));

      if (!onDashboard || !main) {
        document.body.classList.remove("owner-dashboard-v3-active");
        document.getElementById("owner-dashboard-v3-host")?.remove();
        setHost(null);
        return;
      }

      let target = document.getElementById("owner-dashboard-v3-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-dashboard-v3-host";
        main
          .querySelector(".heading")
          ?.insertAdjacentElement("afterend", target);
      }
      document.body.classList.add("owner-dashboard-v3-active");
      setHost(target);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.body.classList.remove("owner-dashboard-v3-active");
      document.getElementById("owner-dashboard-v3-host")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setOwner(null);
      return;
    }
    let active = true;
    request("me")
      .then((result) => {
        if (active)
          setOwner(result.user?.role === "OWNER" ? result.user : null);
      })
      .catch(() => active && setOwner(null));
    return () => {
      active = false;
    };
  }, [visible]);

  const dashboardQuery = useMemo(() => {
    const params = new URLSearchParams({ preset });
    if (preset === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    return params.toString();
  }, [preset, customFrom, customTo]);

  async function load() {
    if (!visible || !owner) return;
    if (
      preset === "custom" &&
      (!customFrom || !customTo || customFrom > customTo)
    ) {
      setError("Rentang tanggal custom belum valid.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [dashboard, stock, printJobs] = await Promise.all([
        request(`owner-dashboard-v2?${dashboardQuery}`),
        request("stock"),
        request("print-jobs"),
      ]);
      setPayload({
        dashboard,
        stock: stock.products || [],
        printJobs: printJobs.jobs || [],
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !owner) return;
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [visible, owner?.id, dashboardQuery]);

  useEffect(() => {
    if (!popup) return;
    const previous = document.body.style.overflow;
    const close = (event) => event.key === "Escape" && setPopup(null);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [popup]);

  const metrics = useMemo(() => {
    const dashboard = payload.dashboard;
    const statuses = dashboard?.statuses || [];
    const revenue = Number(dashboard?.today?.revenue || 0);
    const orderCount = Number(dashboard?.today?.orders || 0);
    const activeStatuses = [
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "ASSIGNED",
      "PICKED_UP",
      "ON_DELIVERY",
    ];
    const activeOrders = countStatus(statuses, activeStatuses);
    const pendingPayments = Number(
      dashboard?.paymentStatuses?.find((item) => item.status === "PENDING")
        ?.count || 0,
    );
    const outOfStockProducts = payload.stock.filter(
      (product) => Number(product.available_quantity || 0) <= 0,
    );
    const failedPrintJobs = payload.printJobs.filter(
      (job) => job.status === "FAILED",
    );

    return {
      revenue,
      orderCount,
      aov: orderCount ? revenue / orderCount : 0,
      activeOrders,
      activeStatuses,
      pendingPayments,
      codOutstandingCount: Number(dashboard?.codOutstanding?.count || 0),
      codOutstandingAmount: Number(dashboard?.codOutstanding?.amount || 0),
      digitalCount: Number(dashboard?.digitalPayments?.count || 0),
      digitalAmount: Number(dashboard?.digitalPayments?.amount || 0),
      outOfStockProducts,
      failedPrintJobs,
      statuses,
    };
  }, [payload]);

  if (!owner || !visible || !host) return null;

  const periodLabel = displayPeriod(payload.dashboard?.period);

  const openActionPopup = ({
    title,
    icon,
    eyebrow,
    value,
    description,
    details,
    actionLabel,
    action,
  }) => {
    setPopup({
      title,
      icon,
      eyebrow,
      value,
      description,
      details,
      actionLabel,
      action,
    });
  };

  const healthItems = [
    {
      title: "Orderan Aktif",
      icon: "activity",
      value: metrics.activeOrders,
      description: `Order aktif pada periode ${periodLabel}.`,
      details: metrics.statuses
        .filter(
          (item) =>
            metrics.activeStatuses.includes(item.status) &&
            Number(item.count || 0) > 0,
        )
        .map(
          (item) =>
            `${STATUS_LABELS[item.status] || item.status}: ${item.count}`,
        ),
      actionLabel: "Buka Laporan",
      action: () => goToOwnerView("Laporan"),
    },
    {
      title: "Produk Stock Habis",
      icon: "box",
      value: metrics.outOfStockProducts.length,
      description:
        "Produk yang tidak memiliki stok tersedia dan perlu perhatian.",
      details: metrics.outOfStockProducts
        .slice(0, 8)
        .map((item) => item.name || `Produk #${item.id}`),
      actionLabel: "Buka Stok",
      action: () => goToOwnerView("Stok"),
    },
    {
      title: "Pembayaran Pending",
      icon: "warning",
      value: metrics.pendingPayments,
      description: `Pembayaran yang masih berstatus pending pada periode ${periodLabel}.`,
      details: metrics.pendingPayments
        ? [`${metrics.pendingPayments} pembayaran belum final.`]
        : [],
      actionLabel: "Buka Laporan",
      action: () => goToOwnerView("Laporan"),
    },
    {
      title: "Printer",
      icon: "printer",
      value: metrics.failedPrintJobs.length,
      description: "Print job gagal yang perlu dicek atau dicetak ulang.",
      details: metrics.failedPrintJobs
        .slice(0, 8)
        .map(
          (job) =>
            `Job #${job.id}${job.order_id ? ` · Order #${job.order_id}` : ""}`,
        ),
      actionLabel: "Buka Printer",
      action: () => goToOwnerView("Printer"),
    },
  ];

  const controlItems = [
    [
      "Setoran Kas",
      "cash",
      "Pantau dan verifikasi setoran kas dari Manager.",
      openOwnerCashSettlement,
    ],
    [
      "Laporan",
      "report",
      "Lihat laporan operasional dan penjualan lebih lengkap.",
      () => goToOwnerView("Laporan"),
    ],
    [
      "Promo",
      "promo",
      "Pantau program promo yang sedang berjalan.",
      () => goToOwnerView("Promo"),
    ],
    [
      "Audit Log",
      "audit",
      "Telusuri jejak perubahan dan aktivitas sistem.",
      () => goToOwnerView("Audit log"),
    ],
    [
      "Staf",
      "staff",
      "Kelola akun, akses, dan peran staf.",
      () => goToOwnerView("Staf"),
    ],
    [
      "Loyalty",
      "loyalty",
      "Pantau aturan dan reward loyalty pelanggan.",
      () => goToOwnerView("Loyalty"),
    ],
    [
      "Operator Admin",
      "operator",
      "Kelola operator Admin dan akses operasionalnya.",
      () => goToOwnerView("Operator Admin"),
    ],
    [
      "Pengaturan",
      "settings",
      "Atur konfigurasi operasional Warkost Bahagia.",
      () => goToOwnerView("Pengaturan"),
    ],
  ];

  return createPortal(
    <>
      <section className="owner-dashboard-v3" aria-label="Owner Control Center">
        <div className="owner-dashboard-hero owner-dashboard-hero-v3">
          <div>
            <span className="owner-dashboard-greeting">
              Selamat datang, <strong>{owner.name || "Owner"}!</strong>
            </span>
            <h2>Owner Control Center</h2>
            <p>Anda bisa memantau bisnis dari satu layar.</p>
          </div>
        </div>

        {error && <div className="owner-dashboard-error">{error}</div>}

        <section className="owner-dashboard-panel owner-sales-panel">
          <div className="owner-dashboard-panel-head owner-sales-head">
            <div>
              <span>RINGKASAN SALES</span>
              <h3>{periodLabel}</h3>
            </div>
            <button
              className="owner-refresh-button"
              type="button"
              onClick={load}
              disabled={loading}
            >
              <Icon name="refresh" />
              {loading ? "Memuat..." : "Perbarui"}
            </button>
          </div>

          <div
            className="owner-period-filter"
            aria-label="Filter periode penjualan"
          >
            {[
              ["today", "Hari Ini"],
              ["month", "Bulan Ini"],
              ["last_month", "Bulan Lalu"],
              ["custom", "Custom"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={preset === key ? "active" : ""}
                onClick={() => setPreset(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="owner-custom-range">
              <label>
                <span>Dari</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || today}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label>
                <span>Sampai</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </div>
          )}

          <div className="owner-dashboard-kpis owner-dashboard-kpis-v3">
            <article>
              <span className="owner-dashboard-icon">
                <Icon name="sales" />
              </span>
              <small>Penjualan</small>
              <strong>{money(metrics.revenue)}</strong>
              <em>Revenue terverifikasi</em>
            </article>
            <article>
              <span className="owner-dashboard-icon">
                <Icon name="orders" />
              </span>
              <small>Order</small>
              <strong>{metrics.orderCount}</strong>
              <em>Total order periode</em>
            </article>
            <article>
              <span className="owner-dashboard-icon">
                <Icon name="aov" />
              </span>
              <small>AOV</small>
              <strong>{money(metrics.aov)}</strong>
              <em>Rata-rata transaksi</em>
            </article>
            <article
              className={metrics.codOutstandingCount ? "needs-attention" : ""}
            >
              <span className="owner-dashboard-icon">
                <Icon name="cash" />
              </span>
              <small>COD Belum Final</small>
              <strong>{money(metrics.codOutstandingAmount)}</strong>
              <em>{metrics.codOutstandingCount} transaksi</em>
            </article>
            <article>
              <span className="owner-dashboard-icon">
                <Icon name="digital" />
              </span>
              <small>QRIS & Transfer</small>
              <strong>{money(metrics.digitalAmount)}</strong>
              <em>{metrics.digitalCount} transaksi paid</em>
            </article>
          </div>
        </section>

        <section className="owner-dashboard-panel owner-health-panel-v3">
          <div className="owner-dashboard-panel-head">
            <div>
              <span>OPERATIONAL HEALTH</span>
              <h3>Kondisi yang perlu diperhatikan</h3>
            </div>
          </div>
          <div className="owner-health-grid owner-health-grid-v3">
            {healthItems.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() =>
                  openActionPopup({ ...item, eyebrow: "OPERATIONAL HEALTH" })
                }
              >
                <span>
                  <Icon name={item.icon} />
                </span>
                <div>
                  <strong>{item.value}</strong>
                  <small>{item.title}</small>
                </div>
                <em>Lihat detail</em>
              </button>
            ))}
          </div>
        </section>

        <section className="owner-dashboard-panel owner-control-panel-v3">
          <div className="owner-dashboard-panel-head">
            <div>
              <span>KONTROL USAHA</span>
              <h3>Akses pengelolaan Owner</h3>
            </div>
          </div>
          <div className="owner-control-grid-v3">
            {controlItems.map(([title, icon, description, action]) => (
              <button
                key={title}
                type="button"
                onClick={() =>
                  openActionPopup({
                    title,
                    icon,
                    eyebrow: "KONTROL USAHA",
                    description,
                    details: [],
                    actionLabel: `Buka ${title}`,
                    action,
                  })
                }
              >
                <span>
                  <Icon name={icon} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </div>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        </section>
      </section>

      {popup && (
        <div
          className="owner-popup-backdrop"
          role="presentation"
          onMouseDown={() => setPopup(null)}
        >
          <section
            className="owner-popup-card"
            role="dialog"
            aria-modal="true"
            aria-label={popup.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="owner-popup-close"
              type="button"
              onClick={() => setPopup(null)}
              aria-label="Tutup popup"
            >
              <Icon name="close" />
            </button>
            <span className="owner-popup-icon">
              <Icon name={popup.icon} />
            </span>
            <small className="owner-popup-eyebrow">{popup.eyebrow}</small>
            <h3>{popup.title}</h3>
            {popup.value !== undefined && (
              <strong className="owner-popup-value">{popup.value}</strong>
            )}
            <p>{popup.description}</p>
            <div className="owner-popup-details">
              {(popup.details || []).length ? (
                popup.details.map((detail, index) => (
                  <div key={`${detail}-${index}`}>{detail}</div>
                ))
              ) : (
                <div>
                  Tidak ada detail tambahan yang perlu ditindaklanjuti saat ini.
                </div>
              )}
            </div>
            {popup.action && (
              <button
                className="owner-popup-action"
                type="button"
                onClick={() => {
                  const action = popup.action;
                  setPopup(null);
                  window.setTimeout(action, 0);
                }}
              >
                {popup.actionLabel || "Buka"}
                <Icon name="arrow" />
              </button>
            )}
          </section>
        </div>
      )}
    </>,
    host,
  );
}
