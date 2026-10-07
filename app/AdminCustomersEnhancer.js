"use client";

import { useEffect } from "react";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const dateTimeLabel = (value) => {
  if (!value) return "—";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const initials = (name) =>
  String(name || "P")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

const statusLabel = (status) => String(status || "—").replaceAll("_", " ");

const searchIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-4-4"></path>
  </svg>
`;

const customerIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4"></circle>
    <path d="M4 21a8 8 0 0 1 16 0"></path>
  </svg>
`;

const chatIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4.5A7 7 0 0 1 3 13V8a5 5 0 0 1 5-5h9a4 4 0 0 1 4 4v8Z"></path>
  </svg>
`;

export default function AdminCustomersEnhancer() {
  useEffect(() => {
    let root = null;
    let nativePanel = null;
    let modal = null;
    let mounted = false;
    let disposed = false;
    let activeTab = "data";
    let activeFilter = "all";
    let searchValue = "";
    let searchTimer = null;
    let customers = [];
    let orders = [];
    let dashboard = null;
    let loading = false;
    let error = "";
    let selectedCustomerId = null;

    const fetchJson = async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat data");
      return data;
    };

    const findNativePanel = () =>
      [...document.querySelectorAll("main .panel")].find((panel) =>
        panel.textContent.includes("Daftar pelanggan"),
      );

    const filteredCustomers = () =>
      customers.filter((customer) => {
        if (activeFilter === "active") return Number(customer.active) === 1;
        if (activeFilter === "orders") return Number(customer.order_count) > 0;
        if (activeFilter === "points") return Number(customer.points) > 0;
        return true;
      });

    const customerOrders = (customerId) =>
      orders
        .filter((order) => Number(order.customer_id) === Number(customerId))
        .sort((a, b) => Number(b.id) - Number(a.id));

    const selectedCustomer = () =>
      customers.find((customer) => Number(customer.id) === Number(selectedCustomerId));

    const renderSummary = () => {
      const visible = customers;
      const active = visible.filter((item) => Number(item.active) === 1).length;
      const withOrders = visible.filter((item) => Number(item.order_count) > 0).length;
      const points = visible.reduce((sum, item) => sum + Number(item.points || 0), 0);
      return `
        <div class="admin-customer-summary-grid">
          <article><span>Total pelanggan</span><strong>${esc(dashboard?.customers ?? visible.length)}</strong><small>Terdaftar</small></article>
          <article><span>Aktif terlihat</span><strong>${active}</strong><small>Dari data dimuat</small></article>
          <article><span>Punya pesanan</span><strong>${withOrders}</strong><small>Pernah bertransaksi</small></article>
          <article><span>Total poin terlihat</span><strong>${points.toLocaleString("id-ID")}</strong><small>Saldo loyalty</small></article>
        </div>
      `;
    };

    const renderCustomerCards = () => {
      if (loading)
        return '<div class="admin-customer-empty"><span class="admin-customer-spinner"></span><strong>Memuat pelanggan...</strong></div>';
      if (error)
        return `<div class="admin-customer-empty error"><strong>Data pelanggan belum dapat dimuat.</strong><span>${esc(error)}</span></div>`;
      const list = filteredCustomers();
      if (!list.length)
        return '<div class="admin-customer-empty"><strong>Pelanggan tidak ditemukan.</strong><span>Coba ubah kata pencarian atau filter.</span></div>';
      return list
        .map((customer) => {
          const isActive = Number(customer.active) === 1;
          return `
            <article class="admin-customer-card" data-customer-id="${customer.id}">
              <div class="admin-customer-card-head">
                <div class="admin-customer-avatar">${esc(initials(customer.name))}</div>
                <div class="admin-customer-identity">
                  <strong>${esc(customer.name || "Pelanggan")}</strong>
                  <span>${esc(customer.email || "Email belum tersedia")}</span>
                </div>
                <span class="admin-customer-status ${isActive ? "active" : "inactive"}">${isActive ? "AKTIF" : "NONAKTIF"}</span>
              </div>
              <div class="admin-customer-mini-stats">
                <div><span>Pesanan</span><strong>${Number(customer.order_count || 0)}</strong></div>
                <div><span>Poin</span><strong>${Number(customer.points || 0).toLocaleString("id-ID")}</strong></div>
                <div><span>Terdaftar</span><strong>${esc(dateLabel(customer.created_at))}</strong></div>
              </div>
              <div class="admin-customer-card-actions">
                <button type="button" data-customer-action="detail" data-id="${customer.id}">Lihat detail</button>
                <button type="button" data-customer-action="support" data-id="${customer.id}">Customer Service</button>
              </div>
            </article>
          `;
        })
        .join("");
    };

    const renderDataTab = () => `
      ${renderSummary()}
      <section class="admin-customer-toolbar">
        <label class="admin-customer-search">
          <span>${searchIcon}</span>
          <input type="search" value="${esc(searchValue)}" placeholder="Cari nama atau email pelanggan..." aria-label="Cari pelanggan" />
        </label>
        <div class="admin-customer-filters" aria-label="Filter pelanggan">
          ${[
            ["all", "Semua"],
            ["active", "Aktif"],
            ["orders", "Punya Pesanan"],
            ["points", "Ada Poin"],
          ]
            .map(
              ([key, label]) =>
                `<button type="button" data-customer-filter="${key}" class="${activeFilter === key ? "active" : ""}">${label}</button>`,
            )
            .join("")}
        </div>
      </section>
      <div class="admin-customer-grid">${renderCustomerCards()}</div>
    `;

    const renderSupportTab = () => {
      const customer = selectedCustomer();
      return `
        <section class="admin-service-shell">
          <aside class="admin-service-inbox">
            <div class="admin-service-panel-head">
              <div><small>INBOX</small><strong>Customer Service</strong></div>
              <span>0 baru</span>
            </div>
            <label class="admin-service-search">
              <span>${searchIcon}</span>
              <input type="search" placeholder="Cari percakapan..." disabled />
            </label>
            <div class="admin-service-filters">
              <button class="active" type="button">Semua</button>
              <button type="button">Belum dibaca</button>
              <button type="button">Aktif</button>
              <button type="button">Selesai</button>
            </div>
            <div class="admin-service-empty-inbox">
              <span class="admin-service-icon">${chatIcon}</span>
              <strong>Belum ada percakapan</strong>
              <p>Chat Customer ↔ Admin akan muncul di sini setelah backend komunikasi diaktifkan.</p>
            </div>
          </aside>

          <section class="admin-service-conversation">
            <header>
              <div class="admin-service-avatar">${customer ? esc(initials(customer.name)) : "CS"}</div>
              <div>
                <strong>${customer ? esc(customer.name) : "Pilih percakapan"}</strong>
                <span>${customer ? esc(customer.email) : "Customer Service Warkost"}</span>
              </div>
              <span class="admin-service-backend-badge">UI SIAP</span>
            </header>
            <div class="admin-service-conversation-empty">
              <span class="admin-service-icon large">${chatIcon}</span>
              <strong>${customer ? `Ruang bantuan ${esc(customer.name)}` : "Pusat percakapan customer"}</strong>
              <p>Semua chat customer dengan Admin akan ditangani dari halaman ini. Riwayat chat asli akan ditampilkan setelah backend selesai.</p>
            </div>
            <footer>
              <button type="button" disabled>＋</button>
              <textarea rows="1" disabled placeholder="Ketik balasan untuk customer..."></textarea>
              <button type="button" class="send" disabled>Kirim</button>
            </footer>
          </section>

          <aside class="admin-service-context">
            <div class="admin-service-panel-head">
              <div><small>KONTEKS</small><strong>Info pelanggan</strong></div>
            </div>
            ${
              customer
                ? `
                  <div class="admin-service-profile">
                    <div class="admin-customer-avatar big">${esc(initials(customer.name))}</div>
                    <strong>${esc(customer.name)}</strong>
                    <span>${esc(customer.email)}</span>
                    <div class="admin-service-profile-stats">
                      <div><span>Pesanan</span><strong>${Number(customer.order_count || 0)}</strong></div>
                      <div><span>Poin</span><strong>${Number(customer.points || 0).toLocaleString("id-ID")}</strong></div>
                    </div>
                    <button type="button" data-customer-action="detail" data-id="${customer.id}">Lihat profil pelanggan</button>
                  </div>
                `
                : `
                  <div class="admin-service-context-empty">
                    <span>${customerIcon}</span>
                    <strong>Belum ada customer dipilih</strong>
                    <p>Pilih customer dari Data Pelanggan atau pilih percakapan saat backend chat aktif.</p>
                  </div>
                `
            }
            <div class="admin-service-workflow-note">
              <small>ALUR CUSTOMER SERVICE</small>
              <strong>Baru → Ditangani → Selesai</strong>
              <p>Kita sengaja menjaga alur v1 tetap sederhana supaya Admin cepat merespons customer.</p>
            </div>
          </aside>
        </section>
      `;
    };

    const render = () => {
      if (!root) return;
      root.innerHTML = `
        <section class="admin-customers-hero">
          <div>
            <small>PUSAT PELANGGAN</small>
            <h2>Kelola pelanggan & layanan customer</h2>
            <p>Data pelanggan dipisahkan dari percakapan supaya Admin lebih cepat mencari informasi dan menangani bantuan.</p>
          </div>
          <div class="admin-customers-role-note"><strong>Admin</strong><span>Lihat data & support</span></div>
        </section>
        <nav class="admin-customers-tabs" aria-label="Menu pelanggan">
          <button type="button" data-customer-tab="data" class="${activeTab === "data" ? "active" : ""}">
            <span>${customerIcon}</span><div><strong>Data Pelanggan</strong><small>Cari & lihat profil</small></div>
          </button>
          <button type="button" data-customer-tab="service" class="${activeTab === "service" ? "active" : ""}">
            <span>${chatIcon}</span><div><strong>Customer Service</strong><small>Pusat chat customer</small></div><em>0</em>
          </button>
        </nav>
        <div class="admin-customers-content">
          ${activeTab === "data" ? renderDataTab() : renderSupportTab()}
        </div>
      `;
      bindEvents();
      window.dispatchEvent(new CustomEvent("warkost:admin-customers-rendered"));
    };

    const loadCustomers = async (query = "") => {
      loading = true;
      error = "";
      render();
      try {
        const data = await fetchJson(`/api/customers?q=${encodeURIComponent(query)}`);
        customers = data.customers || [];
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
        render();
      }
    };

    const openCustomerModal = (id) => {
      const customer = customers.find((item) => Number(item.id) === Number(id));
      if (!customer) return;
      selectedCustomerId = Number(id);
      const recentOrders = customerOrders(id).slice(0, 5);
      closeModal();
      modal = document.createElement("div");
      modal.className = "admin-customer-modal-overlay";
      modal.innerHTML = `
        <section class="admin-customer-modal" role="dialog" aria-modal="true" aria-labelledby="admin-customer-modal-title">
          <header>
            <div class="admin-customer-modal-avatar">${esc(initials(customer.name))}</div>
            <div><small>PROFIL PELANGGAN</small><h3 id="admin-customer-modal-title">${esc(customer.name)}</h3><p>${esc(customer.email)}</p></div>
            <button type="button" data-customer-modal-close aria-label="Tutup">×</button>
          </header>
          <div class="admin-customer-modal-body">
            <section class="admin-customer-profile-summary">
              <article><span>Status akun</span><strong class="${Number(customer.active) === 1 ? "good" : "bad"}">${Number(customer.active) === 1 ? "AKTIF" : "NONAKTIF"}</strong></article>
              <article><span>Total pesanan</span><strong>${Number(customer.order_count || 0)}</strong></article>
              <article><span>Loyalty point</span><strong>${Number(customer.points || 0).toLocaleString("id-ID")}</strong></article>
              <article><span>Terdaftar</span><strong>${esc(dateLabel(customer.created_at))}</strong></article>
            </section>
            <section class="admin-customer-modal-panel">
              <div class="admin-customer-modal-panel-head"><div><small>AKTIVITAS</small><h4>Pesanan terbaru</h4></div><span>${recentOrders.length} ditampilkan</span></div>
              <div class="admin-customer-recent-orders">
                ${
                  recentOrders.length
                    ? recentOrders
                        .map(
                          (order) => `
                            <div class="admin-customer-order-row">
                              <div><strong>#WB${String(order.id).padStart(6, "0")}</strong><span>${esc(dateTimeLabel(order.created_at))}</span></div>
                              <span class="admin-customer-order-status">${esc(statusLabel(order.status))}</span>
                              <div class="admin-customer-order-total"><strong>${esc(money(order.total))}</strong><span>${esc(order.method || "—")} · ${esc(order.payment_status || "—")}</span></div>
                            </div>
                          `,
                        )
                        .join("")
                    : '<div class="admin-customer-modal-empty">Belum ada pesanan yang tersedia pada daftar order saat ini.</div>'
                }
              </div>
            </section>
            <section class="admin-customer-modal-footer-note">
              <span>${chatIcon}</span><div><strong>Butuh menghubungi customer?</strong><p>Gunakan tab Customer Service. Backend chat akan disambungkan oleh Work tanpa mengubah desain ini.</p></div>
              <button type="button" data-customer-modal-support="${customer.id}">Buka Customer Service</button>
            </section>
          </div>
        </section>
      `;
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-customer-modal-close]")) closeModal();
        const support = event.target.closest("[data-customer-modal-support]");
        if (support) {
          selectedCustomerId = Number(support.dataset.customerModalSupport);
          closeModal();
          activeTab = "service";
          render();
        }
      });
      document.body.appendChild(modal);
      document.body.classList.add("admin-customer-modal-open");
    };

    const closeModal = () => {
      modal?.remove();
      modal = null;
      document.body.classList.remove("admin-customer-modal-open");
    };

    function bindEvents() {
      root?.querySelectorAll("[data-customer-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          activeTab = button.dataset.customerTab;
          render();
        });
      });
      root?.querySelectorAll("[data-customer-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          activeFilter = button.dataset.customerFilter;
          render();
        });
      });
      const search = root?.querySelector(".admin-customer-search input");
      if (search) {
        search.addEventListener("input", (event) => {
          searchValue = event.currentTarget.value;
          if (searchTimer) window.clearTimeout(searchTimer);
          searchTimer = window.setTimeout(() => loadCustomers(searchValue.trim()), 280);
        });
      }
      root?.querySelectorAll("[data-customer-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = Number(button.dataset.id);
          if (button.dataset.customerAction === "detail") openCustomerModal(id);
          if (button.dataset.customerAction === "support") {
            selectedCustomerId = id;
            activeTab = "service";
            render();
          }
        });
      });
    }

    const mount = async () => {
      if (mounted || disposed) return;
      const me = await fetchJson("/api/me").catch(() => ({ user: null }));
      if (disposed || me.user?.role !== "ADMIN") return;
      nativePanel = findNativePanel();
      if (disposed || !nativePanel) return;
      mounted = true;
      nativePanel.classList.add("admin-customers-native-hidden");
      root = document.createElement("div");
      root.id = "admin-customers-v1";
      nativePanel.before(root);
      render();
      try {
        const [customerData, orderData, dashboardData] = await Promise.all([
          fetchJson("/api/customers?q="),
          fetchJson("/api/orders"),
          fetchJson("/api/dashboard"),
        ]);
        customers = customerData.customers || [];
        orders = orderData.orders || [];
        dashboard = dashboardData;
      } catch (err) {
        error = err.message;
      }
      render();
    };

    const unmount = () => {
      if (!mounted) return;
      closeModal();
      root?.remove();
      root = null;
      nativePanel?.classList.remove("admin-customers-native-hidden");
      nativePanel = null;
      mounted = false;
      activeTab = "data";
      activeFilter = "all";
      searchValue = "";
      selectedCustomerId = null;
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && modal) closeModal();
    };

    mount();
    window.addEventListener("keydown", onKeyDown);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      if (searchTimer) window.clearTimeout(searchTimer);
      unmount();
    };
  }, []);

  return null;
}
