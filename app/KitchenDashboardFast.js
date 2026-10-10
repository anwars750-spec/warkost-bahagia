"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

async function request(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Gagal memuat data (${response.status})`);
  }
  return data;
}

const KITCHEN_PHASES = new Set(["QUEUED", "PREPARING", "READY"]);
const OVERDUE_MINUTES = 15;

function parseOrderDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function elapsedMinutes(value, now) {
  const date = parseOrderDate(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((now - date.getTime()) / 60000));
}

function formatTime(value) {
  const date = parseOrderDate(value);
  if (!date) return "-";
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function byInvoiceAscending(a, b) {
  return Number(a?.id || 0) - Number(b?.id || 0);
}

function KitchenIcon({ name }) {
  const paths = {
    waiting: (
      <>
        <path d="M7 3h10M7 21h10M8 3c0 4 1.5 6 4 9-2.5 3-4 5-4 9M16 3c0 4-1.5 6-4 9 2.5 3 4 5 4 9" />
      </>
    ),
    cooking: (
      <>
        <path d="M4 14h16a8 8 0 0 1-16 0Z" />
        <path d="M7 11c-1-1.3 1-2.2 0-3.5M12 11c-1-1.3 1-2.2 0-3.5M17 11c-1-1.3 1-2.2 0-3.5" />
      </>
    ),
    ready: (
      <>
        <path d="M4 17h16M6 17a6 6 0 0 1 12 0M12 8v2" />
        <circle cx="12" cy="6" r="1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17" />
      </>
    ),
    queue: (
      <>
        <path d="M5 7h14M5 12h14M5 17h9" />
        <path d="m17 15 2 2-2 2" />
      </>
    ),
    note: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    food: (
      <>
        <path d="M4 12h16M6 12a6 6 0 0 1 12 0M12 4v2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.food}
    </svg>
  );
}

function itemNote(item) {
  return (
    item.note ||
    item.notes ||
    item.item_note ||
    item.special_instructions ||
    ""
  );
}

function kitchenItems(details) {
  const items = details?.items || [];
  const stationAware = items.some((item) => item.prep_station);
  return stationAware
    ? items.filter((item) => item.prep_station === "KITCHEN")
    : items;
}

function KitchenOrderCard({ order, details, now, busy, onAction }) {
  const minutes = elapsedMinutes(order.created_at, now);
  const overdue = order.kitchen_status !== "READY" && minutes >= OVERDUE_MINUTES;
  const items = kitchenItems(details);
  const isReady = order.kitchen_status === "READY";
  const nextStatus =
    order.kitchen_status === "QUEUED"
      ? "PREPARING"
      : order.kitchen_status === "PREPARING"
        ? "READY"
        : null;

  return (
    <article
      className={`kitchen-order-card phase-${String(
        order.kitchen_status || "",
      ).toLowerCase()}${overdue ? " is-overdue" : ""}${
        isReady ? " is-compact-ready" : ""
      }`}
    >
      <div className="kitchen-order-topline">
        <div>
          <strong>WB{String(order.id).padStart(6, "0")}</strong>
          <small>Masuk {formatTime(order.created_at)}</small>
        </div>
        <div className="kitchen-order-badges">
          <span className={`kitchen-time-chip${overdue ? " urgent" : ""}`}>
            <KitchenIcon name="clock" /> {minutes} menit
          </span>
        </div>
      </div>

      <div className="kitchen-order-meta">
        <span>Delivery</span>
      </div>

      <div className="kitchen-item-list">
        {items.length ? (
          items.map((item, index) => {
            const note = itemNote(item);
            return (
              <div className="kitchen-item" key={`${item.name}-${index}`}>
                <div className="kitchen-item-line">
                  <span>
                    <i />
                    {item.name}
                  </span>
                  <strong>x{item.quantity}</strong>
                </div>
                {note && (
                  <div className="kitchen-item-note">
                    <KitchenIcon name="note" />
                    <span>Catatan: {note}</span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="kitchen-detail-loading">Detail menu sedang dimuat...</div>
        )}
      </div>

      {nextStatus ? (
        <button
          className={`kitchen-action ${
            order.kitchen_status === "PREPARING" ? "ready-action" : ""
          }`}
          disabled={busy}
          onClick={() => onAction(order.id, nextStatus)}
        >
          <KitchenIcon
            name={order.kitchen_status === "PREPARING" ? "check" : "cooking"}
          />
          {busy
            ? "Memproses..."
            : order.kitchen_status === "QUEUED"
              ? "Mulai Masak"
              : "Tandai Ready"}
        </button>
      ) : (
        <div className="kitchen-ready-state">
          <KitchenIcon name="check" />
          <span>Menunggu proses berikutnya</span>
        </div>
      )}
    </article>
  );
}

function KitchenColumn({ title, subtitle, icon, tone, orders, details, now, busyId, onAction }) {
  return (
    <section className={`kitchen-column tone-${tone}`}>
      <header className="kitchen-column-header">
        <span className="kitchen-column-icon">
          <KitchenIcon name={icon} />
        </span>
        <div>
          <div className="kitchen-column-title">
            <h2>{title}</h2>
            <b>{orders.length}</b>
          </div>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="kitchen-column-body">
        {orders.length ? (
          orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              details={details[order.id]}
              now={now}
              busy={busyId === order.id}
              onAction={onAction}
            />
          ))
        ) : (
          <div className="kitchen-empty-column">
            <KitchenIcon name={icon} />
            <span>Tidak ada pesanan</span>
          </div>
        )}
      </div>
    </section>
  );
}

function detectKitchenView() {
  const main = document.querySelector("main");
  const heading = main
    ?.querySelector(".heading h1")
    ?.textContent?.trim()
    .toLowerCase();
  const visible = Boolean(main?.querySelector(".order-list")) && heading === "antrean makanan";
  return { main, visible };
}

export default function KitchenDashboardFast() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [orders, setOrders] = useState([]);
  const [details, setDetails] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  const syncView = useCallback(() => {
    const { main, visible } = detectKitchenView();
    setPortalTarget((current) => (current === (main || null) ? current : main || null));
    setShowDashboard((current) => (current === visible ? current : visible));
    document.body.classList.toggle("kitchen-dashboard-active", visible);
  }, []);

  const loadKitchen = useCallback(async () => {
    if (!detectKitchenView().visible) return;
    setLoading(true);
    try {
      const result = await request("orders");
      const active = (result.orders || [])
        .filter((order) => KITCHEN_PHASES.has(order.kitchen_status))
        .sort(byInvoiceAscending);

      setOrders(active);
      setError("");
      setLoading(false);

      const pairs = await Promise.all(
        active.map(async (order) => {
          try {
            return [order.id, await request(`order-items?id=${order.id}`)];
          } catch {
            return [order.id, null];
          }
        }),
      );
      setDetails(Object.fromEntries(pairs));
    } catch (loadError) {
      setLoading(false);
      setError(loadError.message);
    }
  }, []);

  useLayoutEffect(() => {
    syncView();
    const main = document.querySelector("main");
    if (!main) return;

    let frame = 0;
    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncView);
    };

    // Observe only direct view replacements. The previous subtree observer also
    // watched this dashboard's own portal mutations and could create a very
    // expensive feedback loop during Kitchen login/rendering.
    const observer = new MutationObserver(scheduleSync);
    observer.observe(main, { childList: true });

    const onNavClick = (event) => {
      if (!event.target.closest?.("header.top nav button")) return;
      scheduleSync();
    };
    document.addEventListener("click", onNavClick, true);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("click", onNavClick, true);
      document.body.classList.remove("kitchen-dashboard-active");
    };
  }, [syncView]);

  useEffect(() => {
    if (!showDashboard) return;
    loadKitchen();
    const poll = setInterval(loadKitchen, 15000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    const onFocus = () => loadKitchen();
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadKitchen();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [showDashboard, loadKitchen]);

  const onAction = useCallback(
    async (orderId, status) => {
      setBusyId(orderId);
      setError("");
      try {
        await request("station-status", { orderId, status });
        await loadKitchen();
      } catch (actionError) {
        setError(actionError.message);
      } finally {
        setBusyId(null);
      }
    },
    [loadKitchen],
  );

  const stats = useMemo(() => {
    const waiting = orders
      .filter((order) => order.kitchen_status === "QUEUED")
      .sort(byInvoiceAscending);
    const cooking = orders
      .filter((order) => order.kitchen_status === "PREPARING")
      .sort(byInvoiceAscending);
    const ready = orders
      .filter((order) => order.kitchen_status === "READY")
      .sort(byInvoiceAscending);
    const active = [...waiting, ...cooking];
    const avg = active.length
      ? Math.round(
          active.reduce(
            (sum, order) => sum + elapsedMinutes(order.created_at, now),
            0,
          ) / active.length,
        )
      : 0;
    return { waiting, cooking, ready, avg };
  }, [orders, now]);

  const filteredOrders = useMemo(() => {
    if (filter === "ready") {
      return orders.filter((order) => order.kitchen_status === "READY");
    }
    return orders;
  }, [filter, orders]);

  const waiting = filteredOrders
    .filter((order) => order.kitchen_status === "QUEUED")
    .sort(byInvoiceAscending);
  const cooking = filteredOrders
    .filter((order) => order.kitchen_status === "PREPARING")
    .sort(byInvoiceAscending);
  const ready = filteredOrders
    .filter((order) => order.kitchen_status === "READY")
    .sort(byInvoiceAscending);
  const nextQueue = [...stats.waiting, ...stats.cooking].sort(byInvoiceAscending)[0];

  if (!portalTarget || !showDashboard) return null;

  return createPortal(
    <section className="kitchen-dashboard-shell" aria-label="Kitchen Dashboard">
      <div className="kitchen-dashboard-head">
        <div className="kitchen-title-block">
          <span className="kitchen-eyebrow">DAPUR</span>
          <h1>Kitchen Dashboard</h1>
          <p>Pantau pesanan makanan yang harus diproses sesuai urutan invoice.</p>
        </div>
        <div className="kitchen-head-actions">
          <div className="kitchen-filter-tabs" aria-label="Filter kitchen">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              Semua ({orders.length})
            </button>
            <button
              className={filter === "ready" ? "active" : ""}
              onClick={() => setFilter("ready")}
            >
              <KitchenIcon name="check" /> Siap ({stats.ready.length})
            </button>
          </div>
          <button
            className={`kitchen-refresh${loading ? " is-loading" : ""}`}
            onClick={loadKitchen}
            aria-label="Perbarui pesanan"
            title="Perbarui pesanan"
          >
            <KitchenIcon name="refresh" />
            <span>Perbarui</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="kitchen-alert" role="alert">
          {error}
        </div>
      )}

      <div className="kitchen-kpis">
        <div className="kitchen-kpi waiting">
          <span><KitchenIcon name="waiting" /></span>
          <div><small>Menunggu</small><strong>{stats.waiting.length}</strong><em>pesanan</em></div>
        </div>
        <div className="kitchen-kpi cooking">
          <span><KitchenIcon name="cooking" /></span>
          <div><small>Sedang dimasak</small><strong>{stats.cooking.length}</strong><em>pesanan</em></div>
        </div>
        <div className="kitchen-kpi ready">
          <span><KitchenIcon name="ready" /></span>
          <div><small>Siap diambil</small><strong>{stats.ready.length}</strong><em>pesanan</em></div>
        </div>
        <div className="kitchen-kpi time">
          <span><KitchenIcon name="clock" /></span>
          <div><small>Rata-rata antre</small><strong>{stats.avg} menit</strong><em>order aktif</em></div>
        </div>
      </div>

      <div className="kitchen-workspace-grid">
        <div className="kitchen-board">
          <KitchenColumn
            title="Menunggu"
            subtitle="Pesanan baru, diproses dari invoice terkecil"
            icon="waiting"
            tone="waiting"
            orders={waiting}
            details={details}
            now={now}
            busyId={busyId}
            onAction={onAction}
          />
          <KitchenColumn
            title="Sedang dimasak"
            subtitle="Pesanan dalam proses pembuatan"
            icon="cooking"
            tone="cooking"
            orders={cooking}
            details={details}
            now={now}
            busyId={busyId}
            onAction={onAction}
          />
          <KitchenColumn
            title="Siap diambil"
            subtitle="Pesanan sudah selesai dimasak"
            icon="ready"
            tone="ready"
            orders={ready}
            details={details}
            now={now}
            busyId={busyId}
            onAction={onAction}
          />
        </div>

        <aside className="kitchen-side">
          <section className="kitchen-side-card">
            <div className="kitchen-side-title">
              <KitchenIcon name="queue" />
              <div><small>ANTRIAN BERIKUTNYA</small><h2>Urutan invoice</h2></div>
            </div>
            {nextQueue ? (
              <div className="kitchen-focus-order">
                <strong>WB{String(nextQueue.id).padStart(6, "0")}</strong>
                <span>
                  {nextQueue.kitchen_status === "QUEUED"
                    ? "Belum mulai dimasak"
                    : "Sedang dimasak"}
                </span>
                <small>{elapsedMinutes(nextQueue.created_at, now)} menit sejak masuk</small>
              </div>
            ) : (
              <p className="kitchen-side-empty">Tidak ada antrean aktif.</p>
            )}
          </section>

          <section className="kitchen-side-card">
            <div className="kitchen-side-title">
              <KitchenIcon name="food" />
              <div><small>ATURAN STASIUN</small><h2>Alur Kitchen</h2></div>
            </div>
            <div className="kitchen-rule-list">
              <div><b>1</b><span><strong>Makanan saja</strong><small>Kitchen tidak menangani minuman.</small></span></div>
              <div><b>2</b><span><strong>Sesuai invoice</strong><small>Kerjakan pesanan berdasarkan urutan invoice.</small></span></div>
              <div><b>3</b><span><strong>Tandai Ready</strong><small>Setelah selesai dimasak, lanjutkan ke proses berikutnya.</small></span></div>
            </div>
          </section>
        </aside>
      </div>
    </section>,
    portalTarget,
  );
}
