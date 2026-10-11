"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

const NAV_ICONS = {
  kitchen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h16a8 8 0 0 1-16 0Z"/><path d="M7 11c-1-1.3 1-2.2 0-3.5M12 11c-1-1.3 1-2.2 0-3.5M17 11c-1-1.3 1-2.2 0-3.5"/></svg>`,
  stock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`,
  notification: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>`,
};

const normalize = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function kitchenNavKey(label) {
  if (label.startsWith("STOK MAKANAN")) return "stock";
  if (label.startsWith("PRINTER")) return "printer";
  if (label.startsWith("NOTIFIKASI")) return "notification";
  if (label.startsWith("KELUAR")) return "logout";
  if (label.startsWith("DAPUR")) return "kitchen";
  return null;
}

function isKitchenHeader() {
  const nav = document.querySelector("header.top nav");
  if (!nav) return false;
  const labels = Array.from(nav.querySelectorAll("button")).map((button) =>
    normalize(button.textContent),
  );
  return (
    labels.some((label) => label.startsWith("DAPUR")) &&
    labels.some((label) => label.startsWith("STOK MAKANAN")) &&
    labels.some((label) => label.startsWith("PRINTER")) &&
    labels.some((label) => label.startsWith("NOTIFIKASI")) &&
    labels.some((label) => label.startsWith("KELUAR"))
  );
}

function activeKitchenNavKey() {
  const heading = normalize(
    document.querySelector("main .heading h1")?.textContent || "",
  );
  if (
    document.body.classList.contains("admin-printer-stable-view") ||
    document.getElementById("admin-printer-center-v1")
  )
    return "printer";
  if (heading === "STOK MAKANAN") return "stock";
  if (heading === "NOTIFIKASI") return "notification";
  if (
    heading === "ANTREAN MAKANAN" ||
    document.body.classList.contains("kitchen-dashboard-active")
  )
    return "kitchen";
  return "kitchen";
}

function decorateKitchenNavigation() {
  const nav = document.querySelector("header.top nav");
  if (!nav || !isKitchenHeader()) {
    document.body.classList.remove("kitchen-shell-active");
    return;
  }

  document.body.classList.add("kitchen-shell-active");
  const activeKey = activeKitchenNavKey();

  nav.querySelectorAll("button").forEach((button) => {
    const key = kitchenNavKey(normalize(button.textContent));
    if (!key) return;
    button.dataset.kitchenNav = key;
    button.classList.toggle("kitchen-nav-active", key === activeKey);
    if (!button.querySelector(":scope > .kitchen-nav-symbol")) {
      const symbol = document.createElement("span");
      symbol.className = "kitchen-nav-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.innerHTML = NAV_ICONS[key];
      button.prepend(symbol);
    }
  });
}

function detectKitchenStockView() {
  const main = document.querySelector("main");
  const heading = normalize(main?.querySelector(".heading h1")?.textContent || "");
  return {
    main,
    visible: Boolean(main && isKitchenHeader() && heading === "STOK MAKANAN"),
  };
}

async function loadStock(signal) {
  const response = await fetch("/api/stock", {
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal memuat stok makanan");
  return data;
}

function quantity(value, unit = "PCS") {
  const number = Number(value || 0);
  if (String(unit).toUpperCase() === "GRAM") {
    if (Math.abs(number) >= 1000)
      return `${(number / 1000).toLocaleString("id-ID", {
        maximumFractionDigits: 1,
      })} kg`;
    return `${number.toLocaleString("id-ID")} g`;
  }
  return `${number.toLocaleString("id-ID")} pcs`;
}

function stockTone(product) {
  const status = String(product?.stock_status || "").toUpperCase();
  if (["OUT", "EMPTY", "HABIS"].includes(status)) return "empty";
  if (["LOW", "MENIPIS"].includes(status)) return "low";
  if (["OK", "SAFE", "AMAN"].includes(status)) return "safe";
  const available = Number(product?.available_quantity || 0);
  if (available <= 0) return "empty";
  if (available <= 5) return "low";
  return "safe";
}

function stockLabel(product) {
  const tone = stockTone(product);
  if (tone === "empty") return "Habis";
  if (tone === "low") return "Menipis";
  return "Aman";
}

function KitchenStockIcon({ name }) {
  const paths = {
    total: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
        <path d="M12 11v10" />
      </>
    ),
    safe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    low: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    empty: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    food: (
      <>
        <path d="M4 14h16a8 8 0 0 1-16 0Z" />
        <path d="M7 11c-1-1.3 1-2.2 0-3.5M12 11c-1-1.3 1-2.2 0-3.5M17 11c-1-1.3 1-2.2 0-3.5" />
      </>
    ),
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

export default function KitchenStockCenter() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [visible, setVisible] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const syncView = useCallback(() => {
    decorateKitchenNavigation();
    const state = detectKitchenStockView();
    setPortalTarget((current) =>
      current === (state.main || null) ? current : state.main || null,
    );
    setVisible((current) => (current === state.visible ? current : state.visible));
    document.body.classList.toggle("kitchen-stock-modern-active", state.visible);
  }, []);

  useLayoutEffect(() => {
    syncView();
    const main = document.querySelector("main");
    const nav = document.querySelector("header.top nav");
    let frame = 0;
    let delay = 0;
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      if (delay) clearTimeout(delay);
      frame = requestAnimationFrame(syncView);
      delay = window.setTimeout(syncView, 90);
    };

    const mainObserver = main ? new MutationObserver(schedule) : null;
    mainObserver?.observe(main, { childList: true });
    const navObserver = nav ? new MutationObserver(schedule) : null;
    navObserver?.observe(nav, { childList: true, subtree: true });
    const bodyObserver = new MutationObserver(schedule);
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("click", schedule, true);

    return () => {
      mainObserver?.disconnect();
      navObserver?.disconnect();
      bodyObserver.disconnect();
      document.removeEventListener("click", schedule, true);
      if (frame) cancelAnimationFrame(frame);
      if (delay) clearTimeout(delay);
      document.body.classList.remove(
        "kitchen-shell-active",
        "kitchen-stock-modern-active",
      );
    };
  }, [syncView]);

  const refreshStock = useCallback(async () => {
    if (!detectKitchenStockView().visible) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    try {
      const data = await loadStock(controller.signal);
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (loadError) {
      if (loadError.name !== "AbortError")
        setError(loadError.message || "Gagal memuat stok makanan");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshStock();
    const onFocus = () => refreshStock();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [visible, refreshStock]);

  const kitchenProducts = useMemo(() => {
    const food = products.filter(
      (product) =>
        String(product.category_name || "").toLowerCase() === "makanan" ||
        String(product.prep_station || "").toUpperCase() === "KITCHEN",
    );
    return food.length ? food : products;
  }, [products]);

  const summary = useMemo(
    () => ({
      total: kitchenProducts.length,
      safe: kitchenProducts.filter((product) => stockTone(product) === "safe")
        .length,
      low: kitchenProducts.filter((product) => stockTone(product) === "low")
        .length,
      empty: kitchenProducts.filter((product) => stockTone(product) === "empty")
        .length,
    }),
    [kitchenProducts],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return kitchenProducts.filter((product) => {
      const matchesQuery =
        !needle ||
        `${product.name || ""} ${product.category_name || ""} ${
          product.subcategory_name || ""
        }`
          .toLowerCase()
          .includes(needle);
      const matchesFilter = filter === "all" || stockTone(product) === filter;
      return matchesQuery && matchesFilter;
    });
  }, [kitchenProducts, query, filter]);

  if (!portalTarget || !visible) return null;

  return createPortal(
    <section className="kitchen-stock-center" aria-label="Stok Makanan Kitchen">
      <header className="kitchen-stock-hero">
        <div className="kitchen-stock-hero-copy">
          <span className="kitchen-stock-eyebrow">STASIUN DAPUR</span>
          <h1>Stok Makanan</h1>
          <p>
            Pantau ketersediaan menu dapur dari satu tampilan. Data mengikuti
            ledger stok dan bersifat read-only untuk Kitchen.
          </p>
        </div>
        <div className="kitchen-stock-hero-actions">
          <span className="kitchen-stock-readonly">
            <KitchenStockIcon name="lock" />
            Read only
          </span>
          <button
            type="button"
            className="kitchen-stock-refresh"
            onClick={refreshStock}
            disabled={loading}
          >
            <KitchenStockIcon name="refresh" />
            {loading ? "Memuat…" : "Perbarui"}
          </button>
        </div>
      </header>

      <section className="kitchen-stock-summary" aria-label="Ringkasan stok">
        <article>
          <span className="total">
            <KitchenStockIcon name="total" />
          </span>
          <div>
            <small>Total Item</small>
            <strong>{summary.total}</strong>
            <p>menu dapur terpantau</p>
          </div>
        </article>
        <article>
          <span className="safe">
            <KitchenStockIcon name="safe" />
          </span>
          <div>
            <small>Stok Aman</small>
            <strong>{summary.safe}</strong>
            <p>siap diproses</p>
          </div>
        </article>
        <article>
          <span className="low">
            <KitchenStockIcon name="low" />
          </span>
          <div>
            <small>Menipis</small>
            <strong>{summary.low}</strong>
            <p>perlu diperhatikan</p>
          </div>
        </article>
        <article>
          <span className="empty">
            <KitchenStockIcon name="empty" />
          </span>
          <div>
            <small>Habis</small>
            <strong>{summary.empty}</strong>
            <p>tidak tersedia</p>
          </div>
        </article>
      </section>

      <section className="kitchen-stock-toolbar">
        <label className="kitchen-stock-search">
          <KitchenStockIcon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari makanan atau subkategori..."
            aria-label="Cari stok makanan"
          />
        </label>
        <div className="kitchen-stock-filters" role="group" aria-label="Filter stok">
          {[
            ["all", "Semua"],
            ["safe", "Aman"],
            ["low", "Menipis"],
            ["empty", "Habis"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="kitchen-stock-error" role="alert">
          <KitchenStockIcon name="low" />
          <span>{error}</span>
        </div>
      )}

      <section className="kitchen-stock-list" aria-label="Daftar stok makanan">
        <div className="kitchen-stock-list-head" aria-hidden="true">
          <span>Produk</span>
          <span>Current</span>
          <span>Reserved</span>
          <span>Available</span>
          <span>Status</span>
        </div>

        {loading && !kitchenProducts.length ? (
          <div className="kitchen-stock-state">
            <span className="kitchen-stock-loader" />
            <strong>Memuat stok makanan…</strong>
            <p>Menyinkronkan data ledger dapur.</p>
          </div>
        ) : filtered.length ? (
          filtered.map((product) => {
            const tone = stockTone(product);
            return (
              <article className="kitchen-stock-row" key={product.id}>
                <div className="kitchen-stock-product">
                  <span className="kitchen-stock-product-icon">
                    <KitchenStockIcon name="food" />
                  </span>
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {product.category_name || "Makanan"} ·{" "}
                      {product.subcategory_name || "Umum"}
                    </small>
                    <span
                      className={`kitchen-stock-availability ${
                        product.active ? "active" : "inactive"
                      }`}
                    >
                      {product.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>

                <div className="kitchen-stock-metric">
                  <small>Current</small>
                  <strong>
                    {quantity(product.stock_quantity, product.stock_unit)}
                  </strong>
                </div>
                <div className="kitchen-stock-metric">
                  <small>Reserved</small>
                  <strong>
                    {quantity(product.reserved_quantity, product.stock_unit)}
                  </strong>
                </div>
                <div className="kitchen-stock-metric available">
                  <small>Available</small>
                  <strong>
                    {quantity(product.available_quantity, product.stock_unit)}
                  </strong>
                </div>
                <div className="kitchen-stock-status-wrap">
                  <span className={`kitchen-stock-status ${tone}`}>
                    {stockLabel(product)}
                  </span>
                </div>
              </article>
            );
          })
        ) : (
          <div className="kitchen-stock-state">
            <span className="kitchen-stock-empty-icon">
              <KitchenStockIcon name="food" />
            </span>
            <strong>Stok makanan tidak ditemukan</strong>
            <p>Coba ubah pencarian atau filter status.</p>
          </div>
        )}
      </section>
    </section>,
    portalTarget,
  );
}
