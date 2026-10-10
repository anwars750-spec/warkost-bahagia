"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const ICONS = {
  home: ["M3 11.5 12 4l9 7.5", "M5 10.5V20h14v-9.5", "M9 20v-6h6v6"],
  delivery: ["M3 7h11v10H3z", "M14 10h4l3 3v4h-7z", "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  wallet: ["M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z", "M16 11h5v4h-5a2 2 0 0 1 0-4Z"],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 7v5l3 2"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  map: ["M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z", "M9 3v15", "M15 6v15"],
  pin: ["M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  phone: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c1 .4 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"],
  chevron: ["m9 18 6-6-6-6"],
  refresh: ["M20 11a8 8 0 1 0 2 5.5", "M20 4v7h-7"],
  package: ["M21 8 12 13 3 8l9-5 9 5Z", "M3 8v8l9 5 9-5V8", "M12 13v8"],
  check: ["m5 12 4 4L19 6"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"],
};

function Icon({ name, size = 20 }) {
  return (
    <svg className="driver-v2-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {(ICONS[name] || ICONS.package).map((d, index) => (
        <path key={index} d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

async function request(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal memuat data Driver");
  return data;
}

const statusMeta = (status) => {
  const map = {
    READY: ["Siap diambil", "ready"],
    ASSIGNED: ["Ditugaskan", "assigned"],
    PICKED_UP: ["Sudah diambil", "picked"],
    ON_DELIVERY: ["Dalam perjalanan", "delivery"],
    DELIVERED: ["Selesai", "done"],
    CANCELLED: ["Dibatalkan", "cancelled"],
  };
  const [label, tone] = map[status] || [String(status || "Pesanan").replaceAll("_", " "), "neutral"];
  return { label, tone };
};

const actionMeta = (order) => {
  if (order.available_to_claim) return { label: "Ambil Pesanan", route: "claim-delivery", body: { orderId: order.id } };
  if (order.status === "ASSIGNED" && !order.accepted_at)
    return { label: "Terima Tugas", route: "accept", body: { orderId: order.id } };
  if (order.status === "ASSIGNED")
    return { label: "Sudah Diambil", route: "status", body: { orderId: order.id, status: "PICKED_UP" } };
  if (order.status === "PICKED_UP")
    return { label: "Mulai Pengantaran", route: "status", body: { orderId: order.id, status: "ON_DELIVERY" } };
  if (order.status === "ON_DELIVERY")
    return { label: "Pesanan Diterima", route: "status", body: { orderId: order.id, status: "DELIVERED" } };
  return null;
};

function NavigationLink({ active, icon, label, onClick }) {
  return (
    <button type="button" className={`driver-v2-nav-link ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} size={19} />
      <span>{label}</span>
    </button>
  );
}

function OrderCard({ order, busy, onAction, compact = false }) {
  const status = statusMeta(order.status);
  const action = actionMeta(order);
  const cod = String(order.method || "").toUpperCase() === "CASH";
  const mapsUrl = order.latitude != null && order.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${order.latitude},${order.longitude}`)}`
    : null;
  return (
    <article className={`driver-v2-order-card ${compact ? "compact" : ""}`}>
      <div className="driver-v2-order-top">
        <div>
          <span className={`driver-v2-status ${status.tone}`}>{status.label}</span>
          <h3>WB{String(order.id).padStart(6, "0")}</h3>
          <p>{order.customer_name || "Customer Warkost"}</p>
        </div>
        <div className="driver-v2-payment-chip">
          <small>{cod ? "COD" : String(order.method || "PAID").replaceAll("_", " ")}</small>
          <strong>{money(order.payment_amount ?? order.total)}</strong>
        </div>
      </div>
      <div className="driver-v2-address">
        <span><Icon name="pin" size={18} /></span>
        <div>
          <small>ALAMAT PENGANTARAN</small>
          <p>{order.address || "Alamat belum tersedia"}</p>
        </div>
      </div>
      {cod && order.status !== "DELIVERED" && (
        <div className="driver-v2-cod-alert">
          <span>TAGIH CUSTOMER</span>
          <strong>{money(order.payment_amount ?? order.total)}</strong>
        </div>
      )}
      <div className="driver-v2-order-actions">
        {mapsUrl && (
          <a className="driver-v2-secondary" href={mapsUrl} target="_blank" rel="noreferrer">
            <Icon name="map" size={18} /> Navigasi
          </a>
        )}
        {action && (
          <button className="driver-v2-primary" type="button" disabled={busy} onClick={() => onAction(action)}>
            {action.label} <Icon name="chevron" size={17} />
          </button>
        )}
      </div>
    </article>
  );
}

export default function DriverControlCenter() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState({ notifications: [], unread: 0 });
  const [cod, setCod] = useState(null);
  const [view, setView] = useState("home");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const notificationRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const me = await request("me");
      if (me.user?.role !== "DRIVER") {
        setUser(null);
        return;
      }
      setUser(me.user);
      const [orderData, alertData, codData] = await Promise.all([
        request("orders"),
        request("notifications"),
        request("cod-batch-driver").catch(() => null),
      ]);
      setOrders(orderData.orders || []);
      setNotifications(alertData || { notifications: [], unread: 0 });
      setCod(codData);
      setError("");
    } catch (err) {
      setError(err.message || "Gagal memuat Driver Center");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 10000);
    const onCod = () => load(true);
    window.addEventListener("warkost:cod-batch-updated", onCod);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("warkost:cod-batch-updated", onCod);
    };
  }, [load]);

  useEffect(() => {
    if (!user) return;
    document.body.classList.add("driver-v2-active");
    return () => document.body.classList.remove("driver-v2-active");
  }, [user]);

  useEffect(() => {
    if (!notificationOpen) return;
    const outside = (event) => {
      if (!notificationRef.current?.contains(event.target)) setNotificationOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [notificationOpen]);

  const active = useMemo(
    () => orders.filter((order) => ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(order.status)),
    [orders],
  );
  const available = useMemo(() => orders.filter((order) => Boolean(order.available_to_claim)), [orders]);
  const completed = useMemo(() => orders.filter((order) => ["DELIVERED", "CANCELLED"].includes(order.status)), [orders]);
  const todayCompleted = useMemo(() => completed.filter((order) => order.status === "DELIVERED").length, [completed]);
  const codAmount = Number(cod?.current_batch?.expected_amount ?? cod?.eligible_expected_amount ?? 0);
  const featured = active.find((order) => order.status === "ON_DELIVERY") || active[0] || available[0] || null;

  const performAction = async ({ route, body, label }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request(route, body);
      setToast(`${label} berhasil diperbarui`);
      await load(true);
      window.setTimeout(() => setToast(""), 2400);
    } catch (err) {
      setError(err.message || "Gagal memperbarui pengantaran");
    } finally {
      setBusy(false);
    }
  };

  const markNotification = async (item) => {
    try {
      if (!item.read_at) await request("notification-read", { id: item.id });
      await load(true);
    } catch {}
  };

  if (!user) return null;

  const navItems = [
    ["home", "home", "Beranda"],
    ["deliveries", "delivery", "Antar"],
    ["cod", "wallet", "COD"],
    ["history", "history", "Riwayat"],
    ["account", "user", "Akun"],
  ];

  return (
    <div className="driver-v2-root">
      <header className="driver-v2-header">
        <div className="driver-v2-brand">
          <img src="/logo-warkost.png" alt="Warkost Bahagia" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <div><strong>Warkost Bahagia</strong><small>Driver Center</small></div>
        </div>
        <nav className="driver-v2-desktop-nav">
          {navItems.map(([key, icon, label]) => (
            <NavigationLink key={key} active={view === key} icon={icon} label={label} onClick={() => setView(key)} />
          ))}
        </nav>
        <div className="driver-v2-header-actions" ref={notificationRef}>
          <button className="driver-v2-bell" type="button" onClick={() => setNotificationOpen((value) => !value)} aria-label="Notifikasi Driver">
            <Icon name="bell" size={20} />
            {notifications.unread > 0 && <span>{notifications.unread > 9 ? "9+" : notifications.unread}</span>}
          </button>
          <button type="button" className="driver-v2-logout">Keluar</button>
          {notificationOpen && (
            <div className="driver-v2-notification-popover">
              <div className="driver-v2-popover-head"><div><small>PUSAT NOTIFIKASI</small><strong>Notifikasi Driver</strong></div><span>{notifications.unread || 0} baru</span></div>
              <div className="driver-v2-notification-list">
                {(notifications.notifications || []).slice(0, 8).map((item) => (
                  <button type="button" key={item.id} className={item.read_at ? "" : "unread"} onClick={() => markNotification(item)}>
                    <span className="driver-v2-notification-dot" />
                    <div><strong>{item.message}</strong><small>{item.created_at || "Update operasional"}</small></div>
                  </button>
                ))}
                {!notifications.notifications?.length && <div className="driver-v2-empty-mini">Belum ada notifikasi.</div>}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="driver-v2-main">
        {error && <div className="driver-v2-feedback error">{error}</div>}
        {toast && <div className="driver-v2-toast"><Icon name="check" size={17} /> {toast}</div>}

        {loading ? (
          <div className="driver-v2-loading">Menyiapkan Driver Center…</div>
        ) : view === "home" ? (
          <>
            <section className="driver-v2-hero">
              <div>
                <span className="driver-v2-eyebrow">PUSAT PENGANTARAN</span>
                <h1>Halo, {user.name?.split(" ")[0] || "Driver"}</h1>
                <p>Kelola tugas pengantaran, COD, dan status pesanan dari satu layar.</p>
              </div>
              <div className="driver-v2-online"><span /> <div><small>STATUS OPERASIONAL</small><strong>Online</strong></div></div>
            </section>

            <section className="driver-v2-kpis">
              <article><span><Icon name="delivery" /></span><div><small>Tugas aktif</small><strong>{active.length}</strong><p>dari maksimal 5</p></div></article>
              <article><span><Icon name="package" /></span><div><small>Siap diambil</small><strong>{available.length}</strong><p>menunggu Driver</p></div></article>
              <article><span className="success"><Icon name="check" /></span><div><small>Selesai</small><strong>{todayCompleted}</strong><p>riwayat termuat</p></div></article>
              <article><span className="warning"><Icon name="wallet" /></span><div><small>COD belum setor</small><strong>{money(codAmount)}</strong><p>tunai ke Admin</p></div></article>
            </section>

            <div className="driver-v2-home-grid">
              <section className="driver-v2-section">
                <div className="driver-v2-section-head"><div><small>PENGANTARAN PRIORITAS</small><h2>{featured ? "Tugas yang perlu ditangani" : "Tidak ada tugas aktif"}</h2></div><button type="button" onClick={() => setView("deliveries")}>Lihat semua <Icon name="chevron" size={16} /></button></div>
                {featured ? <OrderCard order={featured} busy={busy} onAction={performAction} /> : <div className="driver-v2-empty"><span><Icon name="delivery" size={27} /></span><strong>Belum ada pengantaran</strong><p>Tugas baru akan muncul otomatis di sini.</p></div>}
              </section>
              <aside className="driver-v2-side-card">
                <div className="driver-v2-side-icon"><Icon name="wallet" size={22} /></div>
                <small>SETORAN COD</small>
                <h2>{money(codAmount)}</h2>
                <p>{cod?.eligible_orders?.length || cod?.current_batch?.orders?.length || 0} transaksi tunai siap direkap.</p>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("warkost:open-cod-batch"))}>Buka Setoran COD <Icon name="chevron" size={16} /></button>
              </aside>
            </div>
          </>
        ) : view === "deliveries" ? (
          <section>
            <div className="driver-v2-page-title"><div><span className="driver-v2-eyebrow">OPERASIONAL DRIVER</span><h1>Pengantaran</h1><p>Kerjakan tugas sesuai urutan status sampai pesanan diterima customer.</p></div><button type="button" onClick={() => load()}><Icon name="refresh" size={18} /> Refresh</button></div>
            {available.length > 0 && <><div className="driver-v2-list-title"><h2>Siap Diambil</h2><span>{available.length} pesanan</span></div><div className="driver-v2-order-grid">{available.map((order) => <OrderCard key={order.id} order={order} busy={busy} onAction={performAction} />)}</div></>}
            <div className="driver-v2-list-title"><h2>Pengantaran Aktif</h2><span>{active.length} tugas</span></div>
            <div className="driver-v2-order-grid">{active.map((order) => <OrderCard key={order.id} order={order} busy={busy} onAction={performAction} />)}{!active.length && <div className="driver-v2-empty wide"><span><Icon name="delivery" /></span><strong>Tidak ada pengantaran aktif</strong><p>Ambil pesanan yang sudah siap untuk memulai perjalanan.</p></div>}</div>
          </section>
        ) : view === "cod" ? (
          <section>
            <div className="driver-v2-page-title"><div><span className="driver-v2-eyebrow">KONTROL TUNAI</span><h1>Setoran COD</h1><p>Pastikan seluruh uang COD diserahkan dan diverifikasi Admin.</p></div></div>
            <div className="driver-v2-cod-hero"><div><small>TOTAL BELUM DISETOR</small><strong>{money(codAmount)}</strong><p>{cod?.eligible_orders?.length || 0} order COD siap diserahkan.</p></div><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("warkost:open-cod-batch"))}>Ajukan Setoran <Icon name="chevron" size={17} /></button></div>
            <div className="driver-v2-section">
              <div className="driver-v2-section-head"><div><small>RINCIAN COD</small><h2>Order yang masuk setoran</h2></div></div>
              <div className="driver-v2-cod-list">{(cod?.eligible_orders || cod?.current_batch?.orders || []).map((order) => <article key={order.order_id}><div><small>ORDER</small><strong>WB{String(order.order_id).padStart(6, "0")}</strong></div><div><strong>{order.customer || "Customer"}</strong><small>{order.address || "Alamat customer"}</small></div><strong>{money(order.expected_amount)}</strong></article>)}{!(cod?.eligible_orders?.length || cod?.current_batch?.orders?.length) && <div className="driver-v2-empty"><span><Icon name="wallet" /></span><strong>Belum ada COD yang perlu disetor</strong><p>Selesaikan order COD terlebih dahulu.</p></div>}</div>
            </div>
          </section>
        ) : view === "history" ? (
          <section>
            <div className="driver-v2-page-title"><div><span className="driver-v2-eyebrow">AKTIVITAS DRIVER</span><h1>Riwayat Pengantaran</h1><p>Lihat kembali pesanan yang sudah selesai atau dibatalkan.</p></div></div>
            <div className="driver-v2-history-list">{completed.map((order) => <OrderCard key={order.id} order={order} busy={false} onAction={() => {}} compact />)}{!completed.length && <div className="driver-v2-empty wide"><span><Icon name="history" /></span><strong>Belum ada riwayat</strong><p>Pengantaran yang selesai akan tersimpan di sini.</p></div>}</div>
          </section>
        ) : (
          <section>
            <div className="driver-v2-page-title"><div><span className="driver-v2-eyebrow">PROFIL DRIVER</span><h1>Akun Saya</h1><p>Informasi identitas akun operasional Driver Warkost.</p></div></div>
            <div className="driver-v2-account-grid">
              <article className="driver-v2-profile-card"><div className="driver-v2-avatar">{String(user.name || "D").slice(0, 1).toUpperCase()}</div><div><span className="driver-v2-status done">Online</span><h2>{user.name || "Driver Warkost"}</h2><p>{user.email || "Email belum tersedia"}</p></div></article>
              <article className="driver-v2-account-details"><div><small>NOMOR WHATSAPP</small><strong>{user.phone || "Belum diatur"}</strong></div><div><small>ROLE</small><strong>Driver</strong></div><div><small>STATUS AKUN</small><strong>{user.active ? "Aktif" : "Nonaktif"}</strong></div><div><small>PENGANTARAN TERMUAT</small><strong>{completed.filter((item) => item.status === "DELIVERED").length} selesai</strong></div></article>
              <article className="driver-v2-account-safety"><div><span><Icon name="wallet" /></span><div><small>SEBELUM KELUAR</small><strong>Pastikan COD dan status pengantaran sudah diperbarui.</strong></div></div><button type="button" className="driver-v2-account-logout"><Icon name="logout" size={18} /> Keluar</button></article>
            </div>
          </section>
        )}
      </main>

      <nav className="driver-v2-bottom-nav" aria-label="Navigasi Driver">
        {navItems.map(([key, icon, label]) => (
          <NavigationLink key={key} active={view === key} icon={icon} label={label} onClick={() => setView(key)} />
        ))}
      </nav>
    </div>
  );
}
