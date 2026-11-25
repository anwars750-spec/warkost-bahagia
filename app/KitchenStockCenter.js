"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export default function KitchenStockCenter({ menuProducts = [] }) {
  const pendingRequest = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const refreshStock = useCallback(async () => {
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await loadStock(controller.signal);
      if (!controller.signal.aborted)
        setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (loadError) {
      if (loadError.name !== "AbortError")
        setError(loadError.message || "Gagal memuat stok makanan");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStock();
    const onFocus = () => refreshStock();
    window.addEventListener("focus", onFocus);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshStock();
    };
    const onRealtime = (event) => {
      if (
        ["STOCK_CHANGED", "PRODUCT_LOW_STOCK", "PRODUCT_OUT_OF_STOCK"].includes(
          event.detail?.type,
        )
      )
        void refreshStock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("warkost:realtime", onRealtime);
    window.addEventListener("warkost:realtime-recovered", refreshStock);
    return () => {
      pendingRequest.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("warkost:realtime", onRealtime);
      window.removeEventListener("warkost:realtime-recovered", refreshStock);
    };
  }, [refreshStock]);

  const kitchenProducts = useMemo(() => {
    const food = products.filter(
      (product) =>
        String(product.category_name || "").toLowerCase() === "makanan" ||
        String(product.prep_station || "").toUpperCase() === "KITCHEN",
    );
    return food;
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

  const imageFor = (product) => {
    const menuProduct = menuProducts.find(
      (item) =>
        String(item.id) === String(product.id) ||
        String(item.name).trim().toLowerCase() ===
          String(product.name).trim().toLowerCase(),
    );
    const name = String(product.name || "").toLowerCase();
    return (
      product.image_url ||
      menuProduct?.image_url ||
      (name.includes("nasi goreng")
        ? "/demo/nasi-goreng-warkost.webp"
        : name.includes("mie ayam")
          ? "/demo/mie-ayam-bahagia.webp"
          : "")
    );
  };
  return (
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
        <div
          className="kitchen-stock-filters"
          role="group"
          aria-label="Filter stok"
        >
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
                  <span
                    className="kitchen-stock-product-icon"
                    data-synced-image={imageFor(product) ? "true" : undefined}
                    style={
                      imageFor(product)
                        ? {
                            backgroundImage: `url(${JSON.stringify(imageFor(product))})`,
                          }
                        : undefined
                    }
                    aria-label={
                      imageFor(product) ? `Gambar ${product.name}` : undefined
                    }
                  >
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
    </section>
  );
}
