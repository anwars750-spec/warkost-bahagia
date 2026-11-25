"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AdminIcon } from "./AdminPresentation";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const initials = (name) =>
  String(name || "P")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
const dateLabel = (value, time = false) => {
  if (!value) return "—";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
};
export default function AdminCustomersEnhancer() {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const fetchJson = async (url) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat data");
      return data;
    };
    const load = async () => {
      setLoading(true);
      try {
        const [customerData, orderData, dashboardData] = await Promise.all([
          fetchJson(`/api/customers?q=${encodeURIComponent(query.trim())}`),
          fetchJson("/api/orders"),
          fetchJson("/api/dashboard"),
        ]);
        if (controller.signal.aborted) return;
        setCustomers(customerData.customers || []);
        setOrders(orderData.orders || []);
        setDashboard(dashboardData);
        setError("");
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    // Debounce data requests only; the final workspace is already rendered.
    const timer = window.setTimeout(load, query ? 280 : 0);
    window.addEventListener("warkost:realtime-recovered", load);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      window.removeEventListener("warkost:realtime-recovered", load);
    };
  }, [query]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("warkost:admin-customers-rendered"));
  }, []);
  useEffect(() => {
    if (!selected) return;
    document.body.classList.add("admin-customer-modal-open");
    const onKey = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("admin-customer-modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);
  const openCustomerService = (customer = null) =>
    window.dispatchEvent(
      new CustomEvent("warkost:open-admin-customer-service", {
        detail: {
          customerId: customer ? Number(customer.id) : null,
          customerName: customer?.name || "",
        },
      }),
    );
  const filtered = customers.filter((customer) =>
    activeFilter === "active"
      ? Number(customer.active) === 1
      : activeFilter === "orders"
        ? Number(customer.order_count) > 0
        : activeFilter === "points"
          ? Number(customer.points) > 0
          : true,
  );
  const recent = selected
    ? orders
        .filter((order) => Number(order.customer_id) === Number(selected.id))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, 5)
    : [];
  return (
    <div id="admin-customers-v1" data-admin-ui-owner="react">
      <nav className="admin-customers-tabs" aria-label="Menu pelanggan">
        <button type="button" data-customer-tab="data" className="active">
          <AdminIcon name="customer" />
          <div>
            <strong>Data Pelanggan</strong>
            <small>Cari &amp; lihat profil</small>
          </div>
        </button>
        <button
          type="button"
          data-customer-tab="service"
          onClick={() => openCustomerService(selected)}
        >
          <AdminIcon name="chat" />
          <div>
            <strong>Customer Service</strong>
            <small>Pusat chat customer</small>
          </div>
        </button>
      </nav>
      <div className="admin-customers-content">
        <div className="admin-customer-summary-grid">
          {[
            [
              "Total pelanggan",
              dashboard?.customers ?? customers.length,
              "Terdaftar",
            ],
            [
              "Aktif terlihat",
              customers.filter((item) => Number(item.active) === 1).length,
              "Dari data dimuat",
            ],
            [
              "Punya pesanan",
              customers.filter((item) => Number(item.order_count) > 0).length,
              "Pernah bertransaksi",
            ],
            [
              "Total poin terlihat",
              customers
                .reduce((sum, item) => sum + Number(item.points || 0), 0)
                .toLocaleString("id-ID"),
              "Saldo loyalty",
            ],
          ].map(([label, value, hint]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{hint}</small>
            </article>
          ))}
        </div>
        <section className="admin-customer-toolbar">
          <label className="admin-customer-search">
            <AdminIcon name="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama atau email pelanggan..."
              aria-label="Cari pelanggan"
            />
          </label>
          <div className="admin-customer-filters" aria-label="Filter pelanggan">
            {[
              ["all", "Semua"],
              ["active", "Aktif"],
              ["orders", "Punya Pesanan"],
              ["points", "Ada Poin"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                data-customer-filter={key}
                className={activeFilter === key ? "active" : ""}
                onClick={() => setActiveFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <div className="admin-customer-grid">
          {loading ? (
            <div className="admin-customer-empty">
              <span className="admin-customer-spinner" />
              <strong>Memuat pelanggan...</strong>
            </div>
          ) : error ? (
            <div className="admin-customer-empty error" role="alert">
              <strong>Data pelanggan belum dapat dimuat.</strong>
              <span>{error}</span>
            </div>
          ) : filtered.length ? (
            filtered.map((customer) => (
              <article
                className="admin-customer-card"
                data-customer-id={customer.id}
                key={customer.id}
              >
                <div className="admin-customer-card-head">
                  <div className="admin-customer-avatar">
                    {initials(customer.name)}
                  </div>
                  <div className="admin-customer-identity">
                    <strong>{customer.name || "Pelanggan"}</strong>
                    <span>{customer.email || "Email belum tersedia"}</span>
                  </div>
                  <span
                    className={`admin-customer-status ${Number(customer.active) === 1 ? "active" : "inactive"}`}
                  >
                    {Number(customer.active) === 1 ? "AKTIF" : "NONAKTIF"}
                  </span>
                </div>
                <div className="admin-customer-mini-stats">
                  <div>
                    <span>Pesanan</span>
                    <strong>{Number(customer.order_count || 0)}</strong>
                  </div>
                  <div>
                    <span>Poin</span>
                    <strong>
                      {Number(customer.points || 0).toLocaleString("id-ID")}
                    </strong>
                  </div>
                  <div>
                    <span>Terdaftar</span>
                    <strong>{dateLabel(customer.created_at)}</strong>
                  </div>
                </div>
                <div className="admin-customer-card-actions">
                  <button
                    type="button"
                    data-customer-action="detail"
                    onClick={() => setSelected(customer)}
                  >
                    Lihat detail
                  </button>
                  <button
                    type="button"
                    data-customer-action="support"
                    onClick={() => openCustomerService(customer)}
                  >
                    Customer Service
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="admin-customer-empty">
              <strong>Pelanggan tidak ditemukan.</strong>
              <span>Coba ubah kata pencarian atau filter.</span>
            </div>
          )}
        </div>
      </div>
      {selected &&
        createPortal(
          <div
            className="admin-customer-modal-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelected(null);
            }}
          >
            <section
              className="admin-customer-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-customer-modal-title"
            >
              <header>
                <div className="admin-customer-modal-avatar">
                  {initials(selected.name)}
                </div>
                <div>
                  <small>PROFIL PELANGGAN</small>
                  <h3 id="admin-customer-modal-title">{selected.name}</h3>
                  <p>{selected.email}</p>
                </div>
                <button
                  type="button"
                  data-customer-modal-close
                  aria-label="Tutup"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </header>
              <div className="admin-customer-modal-body">
                <section className="admin-customer-profile-summary">
                  {[
                    [
                      "Status akun",
                      Number(selected.active) === 1 ? "AKTIF" : "NONAKTIF",
                    ],
                    ["Total pesanan", Number(selected.order_count || 0)],
                    [
                      "Loyalty point",
                      Number(selected.points || 0).toLocaleString("id-ID"),
                    ],
                    ["Terdaftar", dateLabel(selected.created_at)],
                  ].map(([label, value]) => (
                    <article key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </section>
                <section className="admin-customer-modal-panel">
                  <div className="admin-customer-modal-panel-head">
                    <div>
                      <small>AKTIVITAS</small>
                      <h4>Pesanan terbaru</h4>
                    </div>
                    <span>{recent.length} ditampilkan</span>
                  </div>
                  <div className="admin-customer-recent-orders">
                    {recent.length ? (
                      recent.map((order) => (
                        <div
                          className="admin-customer-order-row"
                          key={order.id}
                        >
                          <div>
                            <strong>
                              #WB{String(order.id).padStart(6, "0")}
                            </strong>
                            <span>{dateLabel(order.created_at, true)}</span>
                          </div>
                          <span className="admin-customer-order-status">
                            {String(order.status || "—").replaceAll("_", " ")}
                          </span>
                          <div className="admin-customer-order-total">
                            <strong>{money(order.total)}</strong>
                            <span>
                              {order.method || "—"} ·{" "}
                              {order.payment_status || "—"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="admin-customer-modal-empty">
                        Belum ada pesanan yang tersedia pada daftar order saat
                        ini.
                      </div>
                    )}
                  </div>
                </section>
                <section className="admin-customer-modal-footer-note">
                  <AdminIcon name="chat" />
                  <div>
                    <strong>Butuh menghubungi customer?</strong>
                    <p>Gunakan tab Customer Service.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      openCustomerService(selected);
                    }}
                  >
                    Buka Customer Service
                  </button>
                </section>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
