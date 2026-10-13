"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function quantity(value, unit = "PCS") {
  const number = Number(value || 0);
  if (String(unit).toUpperCase() === "GRAM") {
    if (Math.abs(number) >= 1000) {
      return `${(number / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kg`;
    }
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

function installStyles() {
  if (document.getElementById("owner-stock-overview-style")) return;
  const style = document.createElement("style");
  style.id = "owner-stock-overview-style";
  style.textContent = `
    .ooh-stock-open{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;margin-top:2px;padding:0 13px;border:0;border-radius:11px;background:#73391f;color:#fff;font-weight:850;cursor:pointer}.ooh-stock-open:hover{background:#864526}.ooh-stock-open::after{content:"→";font-size:18px}
    .oso-backdrop{position:fixed;inset:0;z-index:1320;display:grid;place-items:center;padding:18px;background:rgba(44,27,18,.5);backdrop-filter:blur(6px)}
    .oso-modal{position:relative;display:flex;flex-direction:column;width:min(1180px,100%);max-height:min(90dvh,860px);overflow:hidden;border:1px solid #e2cdbb;border-radius:24px;background:#fffaf6;box-shadow:0 34px 100px rgba(55,31,17,.3);color:#3d281c}
    .oso-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px 18px;border-bottom:1px solid #eadfd5;background:#fffaf5}.oso-head small{display:block;color:#a15e3b;font-size:9px;font-weight:900;letter-spacing:.13em}.oso-head h2{margin:5px 0 0;color:#382319;font-size:24px}.oso-head p{margin:5px 0 0;color:#806f65;font-size:11px}.oso-head-actions{display:flex;align-items:center;gap:9px}.oso-readonly{padding:7px 10px;border-radius:999px;background:#f0ebe6;color:#765e50;font-size:9px;font-weight:900}.oso-refresh{min-height:40px;padding:0 13px;border:1px solid #dfcdbf;border-radius:11px;background:#fff;color:#6b3c24;font-weight:850;cursor:pointer}.oso-close{position:relative;display:block;width:42px;height:42px;padding:0;border:1px solid #dfcdbf;border-radius:13px;background:#fff;cursor:pointer}.oso-close::before,.oso-close::after{position:absolute;top:50%;left:50%;width:16px;height:2px;border-radius:999px;background:#603722;content:""}.oso-close::before{transform:translate(-50%,-50%) rotate(45deg)}.oso-close::after{transform:translate(-50%,-50%) rotate(-45deg)}
    .oso-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 18px}.oso-summary article{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;border:1px solid #eadfd4;border-radius:14px;background:#fff}.oso-summary small{display:block;color:#8b776b;font-size:9px}.oso-summary strong{display:block;margin-top:4px;color:#402719;font-size:21px}.oso-summary span{padding:5px 7px;border-radius:999px;font-size:8px;font-weight:900}.oso-summary .safe span{background:#eaf5ed;color:#367248}.oso-summary .low span{background:#fbecd6;color:#8e5c26}.oso-summary .empty span{background:#f8e1d9;color:#9b4030}.oso-summary .total span{background:#efe8e2;color:#735947}
    .oso-toolbar{display:flex;align-items:center;gap:10px;padding:0 18px 14px}.oso-search{flex:1}.oso-search input{width:100%;min-height:42px;padding:0 13px;border:1px solid #e3d2c3;border-radius:11px;background:#fff;color:#412c20;font:inherit}.oso-filters{display:flex;gap:7px;flex-wrap:wrap}.oso-filters button{min-height:38px;padding:0 12px;border:1px solid #e1cfbf;border-radius:10px;background:#fff;color:#73513d;font-weight:800;cursor:pointer}.oso-filters button.active{border-color:#73391f;background:#73391f;color:#fff}
    .oso-error{margin:0 18px 12px;padding:10px 12px;border:1px solid #efc9c0;border-radius:10px;background:#fff1ed;color:#9f4032;font-size:10px}.oso-list{margin:0 18px 18px;overflow:auto;border:1px solid #eadfd5;border-radius:14px;background:#fff}.oso-list-head,.oso-row{display:grid;grid-template-columns:minmax(240px,1.8fr) repeat(3,minmax(110px,.7fr)) minmax(100px,.65fr);gap:12px;align-items:center}.oso-list-head{position:sticky;top:0;z-index:2;padding:11px 14px;background:#f7f2ee;color:#7b6253;font-size:8px;font-weight:900;letter-spacing:.08em}.oso-row{padding:12px 14px;border-top:1px solid #efe5dd}.oso-row:first-of-type{border-top:0}.oso-product strong{display:block;color:#3f291d;font-size:11px}.oso-product small{display:block;margin-top:4px;color:#8b786d;font-size:9px}.oso-product em{display:inline-block;margin-top:6px;padding:4px 6px;border-radius:999px;background:#f1ece8;color:#776357;font-size:8px;font-style:normal;font-weight:800}.oso-metric small{display:none}.oso-metric strong{color:#4a3428;font-size:11px}.oso-status{display:inline-flex;justify-content:center;min-width:72px;padding:6px 8px;border-radius:999px;font-size:8px;font-weight:900}.oso-status.safe{background:#eaf5ed;color:#367248}.oso-status.low{background:#fbecd6;color:#8e5c26}.oso-status.empty{background:#f8e1d9;color:#9b4030}.oso-empty{padding:42px 18px;text-align:center;color:#8a776b;font-size:11px}
    @media(max-width:760px){.oso-backdrop{padding:0}.oso-modal{width:100%;height:100dvh;max-height:none;border:0;border-radius:0}.oso-head{padding:15px}.oso-head h2{font-size:19px}.oso-head p{font-size:9px}.oso-readonly{display:none}.oso-refresh{min-height:38px;padding:0 10px;font-size:9px}.oso-close{width:38px;height:38px}.oso-summary{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}.oso-toolbar{align-items:stretch;flex-direction:column;padding:0 10px 10px}.oso-filters{display:grid;grid-template-columns:repeat(4,1fr)}.oso-filters button{padding:0 5px;font-size:8px}.oso-list{margin:0 10px 10px;border-radius:12px}.oso-list-head{display:none}.oso-row{grid-template-columns:1fr 1fr;gap:10px;padding:12px}.oso-product{grid-column:1/-1}.oso-metric{padding:8px;border-radius:9px;background:#faf7f4}.oso-metric small{display:block;margin-bottom:3px;color:#917b6e;font-size:8px}.oso-status-wrap{display:flex;align-items:center;justify-content:flex-end}.oso-summary article{padding:10px}.oso-summary strong{font-size:18px}}
  `;
  document.head.appendChild(style);
}

export default function OwnerStockOverview() {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal memuat stok");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (loadError) {
      setError(loadError.message || "Gagal memuat stok");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    installStyles();
    const enhance = () => {
      const modal = document.querySelector(".ooh-modal");
      const title = modal?.querySelector(".ooh-modal-head h3")?.textContent?.trim();
      if (!modal || title !== "Produk Stok Habis") return;
      const body = modal.querySelector(".ooh-modal-body");
      if (!body || body.querySelector(".ooh-stock-open")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ooh-stock-open";
      button.textContent = "Lihat Semua Stok";
      button.addEventListener("click", () => {
        modal.querySelector(".ooh-close")?.click();
        setOpen(true);
      });
      body.appendChild(button);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const previous = document.body.style.overflow;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  const summary = useMemo(() => ({
    total: products.length,
    safe: products.filter((product) => stockTone(product) === "safe").length,
    low: products.filter((product) => stockTone(product) === "low").length,
    empty: products.filter((product) => stockTone(product) === "empty").length,
  }), [products]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !needle || `${product.name || ""} ${product.category_name || ""} ${product.subcategory_name || ""}`.toLowerCase().includes(needle);
      const matchesFilter = filter === "all" || stockTone(product) === filter;
      return matchesQuery && matchesFilter;
    });
  }, [products, query, filter]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="oso-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="oso-modal" role="dialog" aria-modal="true" aria-label="Semua stok Warkost" onMouseDown={(event) => event.stopPropagation()}>
        <header className="oso-head">
          <div>
            <small>OWNER STOCK OVERVIEW</small>
            <h2>Semua Stok</h2>
            <p>Pantau stok seluruh produk. Tampilan ini read-only untuk Owner.</p>
          </div>
          <div className="oso-head-actions">
            <span className="oso-readonly">READ ONLY</span>
            <button type="button" className="oso-refresh" onClick={load} disabled={loading}>{loading ? "Memuat..." : "Perbarui"}</button>
            <button type="button" className="oso-close" aria-label="Tutup" onClick={() => setOpen(false)} />
          </div>
        </header>

        <section className="oso-summary" aria-label="Ringkasan stok">
          <article className="total"><div><small>Total Produk</small><strong>{summary.total}</strong></div><span>Semua</span></article>
          <article className="safe"><div><small>Stok Aman</small><strong>{summary.safe}</strong></div><span>Aman</span></article>
          <article className="low"><div><small>Menipis</small><strong>{summary.low}</strong></div><span>Perlu cek</span></article>
          <article className="empty"><div><small>Habis</small><strong>{summary.empty}</strong></div><span>Restock</span></article>
        </section>

        <section className="oso-toolbar">
          <label className="oso-search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk, kategori, atau subkategori..." /></label>
          <div className="oso-filters" role="group" aria-label="Filter stok">
            {[["all","Semua"],["safe","Aman"],["low","Menipis"],["empty","Habis"]].map(([key,label]) => (
              <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </section>

        {error && <div className="oso-error">{error}</div>}

        <section className="oso-list" aria-label="Daftar semua stok">
          <div className="oso-list-head" aria-hidden="true"><span>Produk</span><span>Current</span><span>Reserved</span><span>Available</span><span>Status</span></div>
          {loading && !products.length ? (
            <div className="oso-empty">Memuat data stok...</div>
          ) : filtered.length ? filtered.map((product) => {
            const tone = stockTone(product);
            return (
              <article className="oso-row" key={product.id}>
                <div className="oso-product">
                  <strong>{product.name || `Produk #${product.id}`}</strong>
                  <small>{product.category_name || "Tanpa kategori"} · {product.subcategory_name || "Umum"}</small>
                  <em>{product.active ? "Aktif" : "Nonaktif"}</em>
                </div>
                <div className="oso-metric"><small>Current</small><strong>{quantity(product.stock_quantity, product.stock_unit)}</strong></div>
                <div className="oso-metric"><small>Reserved</small><strong>{quantity(product.reserved_quantity, product.stock_unit)}</strong></div>
                <div className="oso-metric"><small>Available</small><strong>{quantity(product.available_quantity, product.stock_unit)}</strong></div>
                <div className="oso-status-wrap"><span className={`oso-status ${tone}`}>{stockLabel(product)}</span></div>
              </article>
            );
          }) : <div className="oso-empty">Stok tidak ditemukan. Coba ubah pencarian atau filter.</div>}
        </section>
      </section>
    </div>,
    document.body,
  );
}
