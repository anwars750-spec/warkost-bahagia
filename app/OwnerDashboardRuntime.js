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

const displayDate = (value) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));

const shiftDate = (value, amount) => {
  const date = new Date(`${value}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + amount);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
    (item) => item.textContent.trim().toLowerCase() === wanted,
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
    warning: "M12 4 3 20h18L12 4Zm0 5v5m0 3h.01",
    box: "M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10",
    printer: "M6 9V4h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v6H6z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    refresh: "M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5m-5 4a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5",
    calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
    previous: "m15 18-6-6 6-6",
    next: "m9 18 6-6-6-6",
    report: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
    audit: "M9 11l2 2 4-4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    staff: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    activity: "M3 12h4l2-6 4 12 2-6h6",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[name] || paths.orders} />
    </svg>
  );
};

export default function OwnerDashboardRuntime() {
  const [host, setHost] = useState(null);
  const [owner, setOwner] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(jakartaDate);
  const [payload, setPayload] = useState({
    dashboard: null,
    stock: [],
    alerts: { notifications: [], unread: 0 },
    printJobs: [],
  });

  useEffect(() => {
    const sync = () => {
      const main = document.querySelector("main");
      const heading = main?.querySelector(".heading h1");
      const onDashboard = heading?.textContent?.trim() === "Ringkasan usaha";
      setVisible(Boolean(onDashboard));

      if (!onDashboard || !main) {
        document.body.classList.remove("owner-dashboard-v1-active");
        document.getElementById("owner-dashboard-v1-host")?.remove();
        setHost(null);
        return;
      }

      let target = document.getElementById("owner-dashboard-v1-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-dashboard-v1-host";
        main.querySelector(".heading")?.insertAdjacentElement("afterend", target);
      }
      document.body.classList.add("owner-dashboard-v1-active");
      setHost(target);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.body.classList.remove("owner-dashboard-v1-active");
      document.getElementById("owner-dashboard-v1-host")?.remove();
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

  async function load() {
    if (!visible || !owner) return;
    setLoading(true);
    setError("");
    try {
      const [dashboard, stock, alerts, printJobs] = await Promise.all([
        request(`owner-dashboard-v2?date=${encodeURIComponent(selectedDate)}`),
        request("stock"),
        request("notifications"),
        request("print-jobs"),
      ]);
      setPayload({
        dashboard,
        stock: stock.products || [],
        alerts,
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
  }, [visible, owner?.id, selectedDate]);

  const metrics = useMemo(() => {
    const dashboard = payload.dashboard;
    const statuses = dashboard?.statuses || [];
    const revenue = Number(dashboard?.today?.revenue || 0);
    const orderCount = Number(dashboard?.today?.orders || 0);
    const activeOrders = countStatus(statuses, [
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "ASSIGNED",
      "PICKED_UP",
      "ON_DELIVERY",
    ]);
    const pendingPayments = Number(
      dashboard?.paymentStatuses?.find((item) => item.status === "PENDING")
        ?.count || 0,
    );
    const outOfStock = payload.stock.filter(
      (product) => Number(product.available_quantity || 0) <= 0,
    ).length;
    const failedPrints = payload.printJobs.filter(
      (job) => job.status === "FAILED",
    ).length;

    return {
      revenue,
      orderCount,
      aov: orderCount ? revenue / orderCount : 0,
      activeOrders,
      pendingPayments,
      codOutstandingCount: Number(dashboard?.codOutstanding?.count || 0),
      codOutstandingAmount: Number(dashboard?.codOutstanding?.amount || 0),
      outOfStock,
      failedPrints,
      drivers: Number(dashboard?.drivers || 0),
    };
  }, [payload]);

  if (!owner || !visible || !host) return null;

  const attention = (payload.alerts.notifications || [])
    .filter((item) => !item.read_at)
    .slice(0, 4);
  const today = jakartaDate();
  const selectedDateLabel = displayDate(selectedDate);
  const isToday = selectedDate === today;

  const quickAccess = [
    {
      label: "Setoran Kas",
      helper: "Verifikasi kas Manager",
      icon: "cash",
      action: openOwnerCashSettlement,
    },
    {
      label: "Laporan",
      helper: "Buka laporan operasional",
      icon: "report",
      action: () => goToOwnerView("Laporan"),
    },
    {
      label: "Audit log",
      helper: "Telusuri aktivitas sistem",
      icon: "audit",
      action: () => goToOwnerView("Audit log"),
    },
    {
      label: "Staf",
      helper: "Kelola akses tim",
      icon: "staff",
      action: () => goToOwnerView("Staf"),
    },
  ];

  return createPortal(
    <section className="owner-dashboard-v1 owner-dashboard-v2" aria-label="Owner Control Center">
      <div className="owner-dashboard-hero">
        <div>
          <span className="owner-dashboard-kicker">OWNER CONTROL CENTER</span>
          <h2>Selamat datang, {owner.name || "Owner"}</h2>
          <p>Ringkasan bisnis dan perhatian utama dalam satu kontrol.</p>
        </div>
        <div className="owner-dashboard-hero-actions">
          <div className="owner-date-control" aria-label="Filter tanggal dashboard Owner">
            <button
              type="button"
              onClick={() => setSelectedDate((current) => shiftDate(current, -1))}
              aria-label="Tanggal sebelumnya"
            >
              <Icon name="previous" />
            </button>
            <label>
              <Icon name="calendar" />
              <span>
                <small>TANGGAL TERPILIH</small>
                <strong>{selectedDateLabel}</strong>
              </span>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) =>
                  event.target.value && setSelectedDate(event.target.value)
                }
                aria-label="Pilih tanggal dashboard"
              />
            </label>
            <button
              type="button"
              onClick={() => setSelectedDate((current) => shiftDate(current, 1))}
              disabled={isToday}
              aria-label="Tanggal berikutnya"
            >
              <Icon name="next" />
            </button>
          </div>
          <button
            className="owner-today-button"
            type="button"
            onClick={() => setSelectedDate(today)}
            disabled={isToday}
          >
            Hari Ini
          </button>
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
      </div>

      {error && <div className="owner-dashboard-error">{error}</div>}

      <div className="owner-dashboard-kpis">
        <article>
          <span className="owner-dashboard-icon"><Icon name="sales" /></span>
          <small>Penjualan</small>
          <strong>{money(metrics.revenue)}</strong>
          <em>Revenue terverifikasi · {selectedDateLabel}</em>
        </article>
        <article>
          <span className="owner-dashboard-icon"><Icon name="orders" /></span>
          <small>Order</small>
          <strong>{metrics.orderCount}</strong>
          <em>{metrics.activeOrders} masih aktif · {selectedDateLabel}</em>
        </article>
        <article>
          <span className="owner-dashboard-icon"><Icon name="aov" /></span>
          <small>Average Order Value</small>
          <strong>{money(metrics.aov)}</strong>
          <em>Rata-rata transaksi · {selectedDateLabel}</em>
        </article>
        <article className={metrics.codOutstandingCount ? "needs-attention" : ""}>
          <span className="owner-dashboard-icon"><Icon name="cash" /></span>
          <small>COD Belum Final</small>
          <strong>{money(metrics.codOutstandingAmount)}</strong>
          <em>{metrics.codOutstandingCount} transaksi · {selectedDateLabel}</em>
        </article>
      </div>

      <div className="owner-dashboard-grid">
        <section className="owner-dashboard-panel owner-health-panel">
          <div className="owner-dashboard-panel-head">
            <div>
              <span>OPERATIONAL HEALTH</span>
              <h3>Yang perlu diperhatikan</h3>
            </div>
          </div>
          <div className="owner-health-grid">
            <button type="button" onClick={() => goToOwnerView("Laporan")}>
              <span><Icon name="activity" /></span>
              <div><strong>{metrics.activeOrders}</strong><small>Order aktif pada tanggal ini</small></div>
              <Icon name="arrow" />
            </button>
            <button type="button" onClick={() => goToOwnerView("Laporan")}>
              <span><Icon name="warning" /></span>
              <div><strong>{metrics.pendingPayments}</strong><small>Pembayaran masih pending</small></div>
              <Icon name="arrow" />
            </button>
            <button type="button" onClick={() => goToOwnerView("Stok")}>
              <span><Icon name="box" /></span>
              <div><strong>{metrics.outOfStock}</strong><small>Produk stok habis saat ini</small></div>
              <Icon name="arrow" />
            </button>
            <button type="button" onClick={() => goToOwnerView("Printer")}>
              <span><Icon name="printer" /></span>
              <div><strong>{metrics.failedPrints}</strong><small>Print job perlu ditangani</small></div>
              <Icon name="arrow" />
            </button>
          </div>
          <div className="owner-health-foot">
            <span>{metrics.drivers} driver terdaftar</span>
            <span>{payload.alerts.unread || 0} notifikasi belum dibaca</span>
          </div>
        </section>

        <section className="owner-dashboard-panel owner-alert-panel">
          <div className="owner-dashboard-panel-head">
            <div>
              <span>INBOX OWNER</span>
              <h3>Perhatian terbaru</h3>
            </div>
            <button type="button" onClick={() => goToOwnerView("Notifikasi")}>Lihat semua</button>
          </div>
          <div className="owner-alert-list">
            {attention.map((item) => (
              <article key={item.id}>
                <span className="owner-alert-dot" />
                <div>
                  <strong>{item.message}</strong>
                  <small>{item.created_at}</small>
                </div>
              </article>
            ))}
            {!attention.length && (
              <div className="owner-dashboard-empty">
                <Icon name="bell" />
                <strong>Tidak ada perhatian baru</strong>
                <small>Notifikasi penting akan tampil di sini.</small>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="owner-dashboard-panel owner-shortcuts-panel">
        <div className="owner-dashboard-panel-head">
          <div>
            <span>AKSES CEPAT</span>
            <h3>Kontrol usaha</h3>
          </div>
        </div>
        <div className="owner-shortcuts">
          {quickAccess.map(({ label, helper, icon, action }) => (
            <button key={label} type="button" onClick={action}>
              <span className="owner-shortcut-icon"><Icon name={icon} /></span>
              <span>
                <strong>{label}</strong>
                <small>{helper}</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>

      <div className="owner-dashboard-orders-intro">
        <div>
          <span>OPERASIONAL LANGSUNG</span>
          <h3>Pesanan terbaru</h3>
        </div>
        <small>Daftar order di bawah tetap menggunakan data operasional yang sama.</small>
      </div>
    </section>,
    host,
  );
}
