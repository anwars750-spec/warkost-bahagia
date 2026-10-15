"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");

function formatDate(value, withTime = false) {
  if (!value) return "Belum ada";
  const parsed = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function initials(name) {
  return (
    String(name || "Pelanggan")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "P"
  );
}

async function request(url, options) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Data pelanggan tidak dapat dimuat");
  return data;
}

function navLabel(button) {
  if (!button) return "";
  if (button.dataset.ownerNavKey) return button.dataset.ownerNavKey;
  return String(button.textContent || "").replace(/\s+/g, " ").trim();
}

function ownerCustomerViewPresent() {
  const activeNav = document.querySelector(
    "header.top nav button[data-owner-nav-key='Pelanggan'].owner-nav-active, header.top nav button[data-owner-nav-key='Pelanggan'][aria-current='page']",
  );
  const heading = document.querySelector("main .heading h1");
  const stored = sessionStorage.getItem("warkost-owner-nav-active");
  return Boolean(activeNav) || heading?.textContent?.trim() === "Kelola pelanggan" || stored === "Pelanggan";
}

function setLegacyVisibility(hidden) {
  const main = document.querySelector("body main");
  const footer = document.querySelector("body footer");
  if (main) {
    if (hidden) {
      if (!main.dataset.ownerCustomersPreviousDisplay)
        main.dataset.ownerCustomersPreviousDisplay = main.style.display || "";
      main.style.setProperty("display", "none", "important");
      main.dataset.ownerCustomersHidden = "true";
    } else if (main.dataset.ownerCustomersHidden === "true") {
      const previous = main.dataset.ownerCustomersPreviousDisplay || "";
      main.style.removeProperty("display");
      if (previous) main.style.display = previous;
      delete main.dataset.ownerCustomersHidden;
      delete main.dataset.ownerCustomersPreviousDisplay;
    }
  }
  if (footer) {
    if (hidden) {
      if (!footer.dataset.ownerCustomersPreviousDisplay)
        footer.dataset.ownerCustomersPreviousDisplay = footer.style.display || "";
      footer.style.setProperty("display", "none", "important");
      footer.dataset.ownerCustomersHidden = "true";
    } else if (footer.dataset.ownerCustomersHidden === "true") {
      const previous = footer.dataset.ownerCustomersPreviousDisplay || "";
      footer.style.removeProperty("display");
      if (previous) footer.style.display = previous;
      delete footer.dataset.ownerCustomersHidden;
      delete footer.dataset.ownerCustomersPreviousDisplay;
    }
  }
}

export default function OwnerCustomersCenter() {
  const [portalRoot, setPortalRoot] = useState(null);
  const [active, setActive] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, points: 0 });
  const [cursor, setCursor] = useState(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState(null);
  const [confirmCustomer, setConfirmCustomer] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    let observer = null;
    let timer = null;
    let ownerVerified = false;

    const applyActive = (nextActive) => {
      if (disposed || !ownerVerified) return;
      document.body.classList.toggle("owner-customers-center-active", nextActive);
      setLegacyVisibility(nextActive);
      const root = document.getElementById("admin-ui-portal-root");
      if (root) setPortalRoot((current) => (current === root ? current : root));
      setActive((current) => (current === nextActive ? current : nextActive));
    };

    const sync = () => {
      if (!ownerVerified || disposed) return;
      applyActive(ownerCustomerViewPresent());
    };

    const onNavClick = (event) => {
      if (!ownerVerified || disposed) return;
      const button = event.target?.closest?.("header.top nav button");
      if (!button) return;
      const label = navLabel(button);
      if (!label) return;
      if (label === "Pelanggan") {
        sessionStorage.setItem("warkost-owner-nav-active", "Pelanggan");
        applyActive(true);
      } else if (["Dashboard", "Keluar"].includes(label)) {
        if (label === "Dashboard")
          sessionStorage.setItem("warkost-owner-nav-active", "Dashboard");
        applyActive(false);
      }
    };

    document.addEventListener("click", onNavClick, true);

    request("/api/me")
      .then((me) => {
        if (disposed || me?.user?.role !== "OWNER") return;
        ownerVerified = true;
        sync();
        observer = new MutationObserver(sync);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["class", "aria-current", "data-owner-nav-key"],
        });
        timer = window.setInterval(sync, 500);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      observer?.disconnect();
      if (timer) window.clearInterval(timer);
      document.removeEventListener("click", onNavClick, true);
      document.body.classList.remove("owner-customers-center-active");
      setLegacyVisibility(false);
    };
  }, []);

  async function load({ nextQuery = query, nextStatus = status, before = null, append = false } = {}) {
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: nextQuery, status: nextStatus });
      if (before) params.set("before", String(before));
      const data = await request(`/api/owner-customers?${params.toString()}`);
      setSummary(data.summary || { total: 0, active: 0, inactive: 0, points: 0 });
      setCustomers((current) =>
        append ? [...current, ...(data.customers || [])] : data.customers || [],
      );
      setCursor(data.nextCursor || null);
    } catch (loadError) {
      setError(loadError.message);
      if (!append) setCustomers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    setQuery("");
    setDraft("");
    setStatus("all");
    setNotice("");
    load({ nextQuery: "", nextStatus: "all" });
  }, [active]);

  useEffect(() => {
    if (!detail && !confirmCustomer) return;
    const previous = document.body.style.overflow;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (confirmCustomer) setConfirmCustomer(null);
      else setDetail(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [detail, confirmCustomer]);

  const shownLabel = useMemo(() => {
    if (status === "active") return "pelanggan aktif";
    if (status === "inactive") return "pelanggan nonaktif";
    return "pelanggan";
  }, [status]);

  if (!active || !portalRoot) return null;

  const applySearch = (event) => {
    event.preventDefault();
    const cleaned = draft.trim();
    setQuery(cleaned);
    load({ nextQuery: cleaned, nextStatus: status });
  };

  const applyStatus = (nextStatus) => {
    setStatus(nextStatus);
    load({ nextQuery: query, nextStatus });
  };

  const clearSearch = () => {
    setDraft("");
    setQuery("");
    load({ nextQuery: "", nextStatus: status });
  };

  const toggleCustomer = async () => {
    if (!confirmCustomer) return;
    setActionBusy(true);
    setError("");
    setNotice("");
    const nextActive = !Boolean(confirmCustomer.active);
    try {
      await request("/api/customer-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmCustomer.id, active: nextActive }),
      });
      setNotice(
        nextActive
          ? `${confirmCustomer.name} berhasil diaktifkan kembali.`
          : `${confirmCustomer.name} berhasil dinonaktifkan.`,
      );
      setConfirmCustomer(null);
      setDetail(null);
      await load({ nextQuery: query, nextStatus: status });
    } catch (actionError) {
      setError(actionError.message);
      setConfirmCustomer(null);
    } finally {
      setActionBusy(false);
    }
  };

  return createPortal(
    <>
      <style>{`
        .occ-owner-page-shell { width:min(1360px, calc(100% - 64px)); margin:28px auto 56px; }
        .occ-owner-page-heading { margin:0 0 20px; }
        .occ-owner-page-heading span { display:block; margin-bottom:8px; color:#9a5130; font-size:11px; font-weight:900; letter-spacing:.16em; }
        .occ-owner-page-heading h1 { margin:0; color:#2f211a; font-size:clamp(30px,3vw,46px); line-height:1.05; }
        .occ-owner-page-heading p { margin:10px 0 0; color:#8d7567; font-size:13px; }
        @media(max-width:760px){
          .occ-owner-page-shell{width:calc(100% - 24px);margin:18px auto 32px}
          .occ-owner-page-heading{margin-bottom:14px}
          .occ-owner-page-heading h1{font-size:30px}
          .occ-owner-page-heading p{font-size:11px}
        }
      `}</style>

      <div className="occ-owner-page-shell">
        <header className="occ-owner-page-heading">
          <span>KONTROL OWNER</span>
          <h1>Kelola pelanggan</h1>
          <p>Pantau aktivitas customer, loyalty, nilai transaksi, dan status akun dari satu layar.</p>
        </header>

        <section className="occ" aria-label="Owner Customer Center">
          <div className="occ-summary-grid">
            <article><span>Total pelanggan</span><strong>{Number(summary.total || 0).toLocaleString("id-ID")}</strong><small>Semua akun customer</small></article>
            <article className="active"><span>Pelanggan aktif</span><strong>{Number(summary.active || 0).toLocaleString("id-ID")}</strong><small>Dapat melakukan transaksi</small></article>
            <article className="inactive"><span>Nonaktif</span><strong>{Number(summary.inactive || 0).toLocaleString("id-ID")}</strong><small>Akses transaksi dihentikan</small></article>
            <article className="points"><span>Poin loyalty</span><strong>{Number(summary.points || 0).toLocaleString("id-ID")}</strong><small>Saldo poin seluruh pelanggan</small></article>
          </div>

          <div className="occ-main-card">
            <header className="occ-card-head">
              <div>
                <span className="occ-eyebrow">CUSTOMER MANAGEMENT</span>
                <h2>Daftar pelanggan</h2>
                <p>Cari pelanggan, lihat aktivitas, dan kelola status akun dari satu tempat.</p>
              </div>
              <div className="occ-count-pill">{customers.length} {shownLabel} ditampilkan</div>
            </header>

            <div className="occ-toolbar">
              <form className="occ-search" onSubmit={applySearch}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={80} placeholder="Cari nama atau email pelanggan" aria-label="Cari pelanggan" />
                {draft && <button type="button" className="occ-clear" onClick={clearSearch} aria-label="Hapus pencarian">×</button>}
                <button type="submit" className="occ-search-button" disabled={loading}>Cari</button>
              </form>
              <div className="occ-filters" aria-label="Filter status pelanggan">
                {[["all","Semua"],["active","Aktif"],["inactive","Nonaktif"]].map(([key,label]) => (
                  <button key={key} type="button" className={status === key ? "active" : ""} onClick={() => applyStatus(key)} disabled={loading}>{label}</button>
                ))}
              </div>
            </div>

            {notice && <div className="occ-notice success">{notice}</div>}
            {error && <div className="occ-notice error">{error}</div>}

            <div className="occ-list-head" aria-hidden="true"><span>Pelanggan</span><span>Status</span><span>Pesanan</span><span>Loyalty</span><span>Nilai belanja</span><span>Aktivitas</span><span>Aksi</span></div>
            <div className={`occ-list ${loading ? "loading" : ""}`}>
              {loading ? (
                <div className="occ-loading"><span />Memuat pelanggan...</div>
              ) : customers.length ? (
                customers.map((customer) => (
                  <article className="occ-row" key={customer.id}>
                    <button type="button" className="occ-customer-cell" onClick={() => setDetail(customer)}>
                      <span className="occ-avatar">{initials(customer.name)}</span>
                      <span className="occ-customer-copy"><strong>{customer.name || "Pelanggan"}</strong><small>{customer.email || "—"}</small>{customer.phone && <em>{customer.phone}</em>}</span>
                    </button>
                    <span className={`occ-status ${customer.active ? "active" : "inactive"}`}>{customer.active ? "Aktif" : "Nonaktif"}</span>
                    <span className="occ-metric"><strong>{Number(customer.order_count || 0).toLocaleString("id-ID")}</strong><small>order</small></span>
                    <span className="occ-metric"><strong>{Number(customer.points || 0).toLocaleString("id-ID")}</strong><small>poin</small></span>
                    <span className="occ-metric value"><strong>{money(customer.lifetime_value)}</strong><small>lifetime</small></span>
                    <span className="occ-activity"><strong>{formatDate(customer.last_order_at)}</strong><small>{customer.last_order_at ? "Order terakhir" : "Belum pernah order"}</small></span>
                    <div className="occ-actions">
                      <button type="button" className="occ-detail-button" onClick={() => setDetail(customer)}>Detail</button>
                      <button type="button" className={customer.active ? "occ-toggle danger" : "occ-toggle success"} onClick={() => setConfirmCustomer(customer)}>{customer.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="occ-empty"><strong>Tidak ada pelanggan yang cocok</strong><span>Coba ubah kata pencarian atau filter status.</span></div>
              )}
            </div>

            {cursor && <div className="occ-more-wrap"><button type="button" className="occ-more" disabled={loadingMore} onClick={() => load({ nextQuery: query, nextStatus: status, before: cursor, append: true })}>{loadingMore ? "Memuat..." : "Muat pelanggan lainnya"}</button></div>}
          </div>
        </section>
      </div>

      {detail && createPortal(
        <div className="occ-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}>
          <section className="occ-modal" role="dialog" aria-modal="true" aria-label="Detail pelanggan">
            <header className="occ-modal-head">
              <span className="occ-modal-avatar">{initials(detail.name)}</span>
              <div><small>DETAIL PELANGGAN</small><h3>{detail.name || "Pelanggan"}</h3><p>{detail.email || "—"}</p></div>
              <button type="button" className="occ-close" onClick={() => setDetail(null)} aria-label="Tutup detail">×</button>
            </header>
            <div className="occ-modal-body">
              <div className="occ-profile-status"><span className={`occ-status ${detail.active ? "active" : "inactive"}`}>{detail.active ? "Akun aktif" : "Akun nonaktif"}</span><small>Member sejak {formatDate(detail.created_at)}</small></div>
              <div className="occ-detail-grid">
                <div><span>Total pesanan</span><strong>{Number(detail.order_count || 0).toLocaleString("id-ID")}</strong></div>
                <div><span>Saldo loyalty</span><strong>{Number(detail.points || 0).toLocaleString("id-ID")} poin</strong></div>
                <div><span>Nilai belanja</span><strong>{money(detail.lifetime_value)}</strong></div>
                <div><span>Order terakhir</span><strong>{formatDate(detail.last_order_at, true)}</strong></div>
              </div>
              <div className="occ-contact-card"><span>Kontak pelanggan</span><strong>{detail.phone || "Nomor telepon belum tersedia"}</strong><small>{detail.email || "Email tidak tersedia"}</small></div>
              <div className="occ-rule-note"><strong>Kontrol akun Owner</strong><span>Pelanggan hanya dapat dinonaktifkan jika tidak memiliki pesanan aktif. Saat dinonaktifkan, sesi aktif pelanggan akan dicabut.</span></div>
              <button type="button" className={detail.active ? "occ-modal-action danger" : "occ-modal-action success"} onClick={() => setConfirmCustomer(detail)}>{detail.active ? "Nonaktifkan pelanggan" : "Aktifkan kembali pelanggan"}</button>
            </div>
          </section>
        </div>, document.body
      )}

      {confirmCustomer && createPortal(
        <div className="occ-backdrop confirm" onMouseDown={(event) => !actionBusy && event.target === event.currentTarget && setConfirmCustomer(null)}>
          <section className="occ-confirm" role="alertdialog" aria-modal="true" aria-label="Konfirmasi status pelanggan">
            <span className={`occ-confirm-icon ${confirmCustomer.active ? "danger" : "success"}`}>{confirmCustomer.active ? "!" : "✓"}</span>
            <h3>{confirmCustomer.active ? "Nonaktifkan pelanggan?" : "Aktifkan kembali pelanggan?"}</h3>
            <p>{confirmCustomer.active ? `Akun ${confirmCustomer.name} tidak akan dapat bertransaksi setelah dinonaktifkan. Sistem akan menolak tindakan ini jika masih ada pesanan aktif.` : `Akun ${confirmCustomer.name} akan kembali dapat login dan melakukan transaksi.`}</p>
            <div className="occ-confirm-actions">
              <button type="button" onClick={() => setConfirmCustomer(null)} disabled={actionBusy}>Batal</button>
              <button type="button" className={confirmCustomer.active ? "danger" : "success"} onClick={toggleCustomer} disabled={actionBusy}>{actionBusy ? "Memproses..." : confirmCustomer.active ? "Ya, nonaktifkan" : "Ya, aktifkan"}</button>
            </div>
          </section>
        </div>, document.body
      )}
    </>,
    portalRoot,
  );
}
