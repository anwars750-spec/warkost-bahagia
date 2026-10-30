"use client";
import { useEffect, useState } from "react";
import { AdminIcon } from "./AdminPresentation";
const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const stockQuantity = (value, unit) =>
  String(unit || "PCS").toUpperCase() === "GRAM"
    ? Number(value || 0) >= 1000
      ? `${(Number(value || 0) / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kg`
      : `${Number(value || 0).toLocaleString("id-ID")} g`
    : `${Number(value || 0).toLocaleString("id-ID")} pcs`;

const drinkCategory = (name) =>
  /minum|drink|beverage|kopi|coffee|teh|tea|jus|juice/i.test(
    String(name || ""),
  );

const itemPromoPrice = (product) => {
  const candidates = [
    product?.promo_price,
    product?.discount_price,
    product?.sale_price,
    product?.special_price,
  ];
  const value = candidates
    .map(Number)
    .find((number) => Number.isFinite(number) && number > 0);
  return value && value < Number(product?.price || 0) ? value : null;
};

const stockTone = (quantity) => {
  if (!Number.isFinite(quantity)) return "unknown";
  if (quantity <= 0) return "empty";
  if (quantity <= 5) return "low";
  return "safe";
};

const stockLabel = (quantity) => {
  const tone = stockTone(quantity);
  if (tone === "empty") return "Habis";
  if (tone === "low") return "Menipis";
  if (tone === "safe") return "Aman";
  return "Belum tersambung";
};
const productStockTone = (product) => {
  if (product?.stock_status === "OUT") return "empty";
  if (product?.stock_status === "LOW") return "low";
  if (product?.stock_status === "OK") return "safe";
  return stockTone(Number(product?.available_quantity));
};

const fallbackImage = (name) =>
  String(name || "")
    .toLowerCase()
    .includes("biji kopi")
    ? "/demo/bahan-baku-kopi.svg"
    : String(name || "")
          .toLowerCase()
          .includes("kopi susu")
      ? "/demo/kopi-susu-rumah.webp"
      : "/demo/promo-warkost.webp";
export default function AdminBeverageStockEnhancerV2() {
  const [data, setData] = useState({
    menuProducts: [],
    categories: [],
    stockProducts: [],
    stockAvailable: false,
  });
  const { menuProducts, categories, stockProducts, stockAvailable } = data;
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const menuResponse = await fetch("/api/menu", {
          cache: "no-store",
          signal: controller.signal,
        });
        const menuData = await menuResponse.json();
        if (!menuResponse.ok)
          throw new Error(menuData.error || "Gagal memuat daftar stok");
        let stockData = {},
          stockAvailable = false;
        try {
          const response = await fetch("/api/admin-beverage-stock", {
            cache: "no-store",
            signal: controller.signal,
          });
          stockData = await response.json().catch(() => ({}));
          stockAvailable = response.ok;
        } catch (error) {
          if (controller.signal.aborted) return;
        }
        if (!controller.signal.aborted) {
          setData({
            menuProducts: menuData.products || [],
            categories: menuData.categories || [],
            stockProducts: stockAvailable ? stockData.products || [] : [],
            stockAvailable,
          });
          setDataError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setDataError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    window.addEventListener("warkost:realtime-recovered", load);
    return () => {
      controller.abort();
      window.removeEventListener("warkost:realtime-recovered", load);
    };
  }, []);
  const categoryName = (product) =>
    categories.find((item) => String(item.id) === String(product.category_id))
      ?.name || "Minuman";

  const stockMap = () =>
    new Map(stockProducts.map((item) => [String(item.id), item]));

  const beverages = () => {
    const byStock = stockMap();
    const byMenu = new Map(menuProducts.map((item) => [String(item.id), item]));
    if (stockProducts.length)
      return stockProducts.map((stockItem) => ({
        ...byMenu.get(String(stockItem.id)),
        ...stockItem,
        promo_price: itemPromoPrice(byMenu.get(String(stockItem.id))),
      }));
    return menuProducts
      .filter((product) => {
        const stockItem = byStock.get(String(product.id));
        if (stockItem) return stockItem.prep_station === "CASHIER";
        return drinkCategory(categoryName(product));
      })
      .map((product) => {
        const stockItem = byStock.get(String(product.id));
        const availableQuantity = stockItem
          ? Number(stockItem.available_quantity)
          : Number.NaN;
        return {
          ...product,
          category_name: stockItem?.category_name || categoryName(product),
          ...stockItem,
          stock_quantity: stockItem
            ? Number(stockItem.stock_quantity)
            : Number.NaN,
          available_quantity: availableQuantity,
          promo_price: itemPromoPrice(product),
        };
      });
  };

  const filteredProducts = () => {
    const needle = query.trim().toLowerCase();
    return beverages().filter((product) => {
      const tone = productStockTone(product);
      const searchMatch =
        !needle ||
        `${product.name} ${product.category_name}`
          .toLowerCase()
          .includes(needle);
      const filterMatch =
        filter === "all" ||
        (filter === "promo" && Boolean(product.promo_price)) ||
        (filter === "safe" && tone === "safe") ||
        (filter === "low" && tone === "low") ||
        (filter === "empty" && tone === "empty");
      const categoryMatch =
        categoryFilter === "all" || product.category_name === categoryFilter;
      return searchMatch && filterMatch && categoryMatch;
    });
  };

  const stats = () => {
    const products = beverages();
    return {
      total: products.length,
      safe: products.filter((item) => productStockTone(item) === "safe").length,
      low: products.filter((item) => productStockTone(item) === "low").length,
      empty: products.filter((item) => productStockTone(item) === "empty")
        .length,
    };
  };

  const summary = stats();
  const products = filteredProducts();
  return (
    <div id="admin-beverage-stock-v1" data-admin-ui-owner="react">
      <section className="admin-beverage-stock-shell">
        <header className="admin-beverage-stock-hero admin-beverage-stock-hero-polished">
          <div>
            <small>PUSAT STOK ADMIN</small>
            <h1>Stok Minuman &amp; Bahan Baku</h1>
            <p>
              Pantau stok minuman dan bahan baku yang ditangani Admin tanpa
              mengubah data.
            </p>
          </div>
          <span
            className="admin-beverage-readonly"
            title="Admin hanya dapat melihat stok minuman"
          >
            <span className="admin-beverage-readonly-dot" aria-hidden="true" />
            <span>Read only</span>
          </span>
        </header>
        <section className="admin-beverage-stock-stats">
          {[
            ["total", "Total item", summary.total, "cup"],
            ["safe", "Stok aman", stockAvailable ? summary.safe : "—", "check"],
            ["low", "Menipis", stockAvailable ? summary.low : "—", "alert"],
            ["empty", "Habis", stockAvailable ? summary.empty : "—", "empty"],
          ].map(([tone, label, value, icon]) => (
            <article key={tone}>
              <span className={tone}>
                <AdminIcon name={icon} />
              </span>
              <small>{label}</small>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        {!loading && !stockAvailable && (
          <aside className="admin-beverage-stock-notice">
            <AdminIcon name="lock" />
            <div>
              <strong>Jumlah stok belum tersambung</strong>
              <p>
                Daftar minuman dan harga tetap bisa dilihat. Kuantitas stok akan
                tampil setelah akses baca khusus Admin diaktifkan.
              </p>
            </div>
          </aside>
        )}
        {dataError && (
          <div className="admin-beverage-stock-error" role="alert">
            {dataError}
          </div>
        )}
        <section className="admin-beverage-stock-toolbar">
          <label>
            <AdminIcon name="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari minuman atau bahan baku..."
              aria-label="Cari stok Admin"
            />
          </label>
          <div
            className="admin-beverage-stock-filters"
            role="group"
            aria-label="Filter stok minuman"
          >
            {[
              ["all", "Semua kategori"],
              ["Minuman", "Minuman"],
              ["Bahan Baku", "Bahan Baku"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-category-filter={key}
                className={categoryFilter === key ? "active" : ""}
                onClick={() => setCategoryFilter(key)}
              >
                {label}
              </button>
            ))}
            {[
              ["all", "Semua"],
              ["safe", "Aman"],
              ["low", "Menipis"],
              ["empty", "Habis"],
              ["promo", "Promo"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-stock-filter={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <div className="admin-beverage-stock-list">
          {loading ? (
            <div className="admin-beverage-stock-state">
              <span className="spinner" />
              <strong>Memuat stok minuman...</strong>
            </div>
          ) : products.length ? (
            products.map((product) => {
              const tone = productStockTone(product),
                quantity = product.available_quantity,
                promo = product.promo_price;
              return (
                <article
                  key={product.id}
                  className="admin-beverage-stock-card"
                  data-product-id={product.id}
                  data-synced-image="true"
                >
                  <div className="admin-beverage-stock-card-head">
                    <div className="admin-beverage-stock-product-media">
                      <img
                        src={
                          product.image_url ||
                          product.imageUrl ||
                          fallbackImage(product.name)
                        }
                        alt={product.name || "Foto minuman"}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          const fallback = fallbackImage(product.name);
                          if (!event.currentTarget.src.endsWith(fallback))
                            event.currentTarget.src = fallback;
                        }}
                      />
                    </div>
                    <span className="admin-beverage-stock-cup">
                      <AdminIcon name="cup" />
                    </span>
                    <div>
                      <small>{product.category_name || "Minuman"}</small>
                      <h3>{product.name}</h3>
                    </div>
                    <span className={`admin-beverage-stock-status ${tone}`}>
                      {stockLabel(quantity)}
                    </span>
                  </div>
                  <div className={`admin-beverage-stock-quantity ${tone}`}>
                    <span>Stok tersedia</span>
                    <strong>
                      {Number.isFinite(quantity)
                        ? stockQuantity(quantity, product.stock_unit)
                        : "—"}
                    </strong>
                    <small>
                      {Number.isFinite(quantity)
                        ? `Total ${stockQuantity(product.stock_quantity, product.stock_unit)} · reservasi ${stockQuantity(product.reserved_quantity, product.stock_unit)}`
                        : "menunggu data stok"}
                    </small>
                  </div>
                  <div className="admin-beverage-stock-meta">
                    <div>
                      <small>Harga</small>
                      <strong className={promo ? "has-promo" : ""}>
                        {money(product.price)}
                      </strong>
                    </div>
                    <div>
                      <small>Promo item</small>
                      {promo ? (
                        <strong className="promo-price">{money(promo)}</strong>
                      ) : (
                        <strong className="no-promo">Tidak ada</strong>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="admin-beverage-stock-state">
              <AdminIcon name="cup" />
              <strong>Minuman tidak ditemukan</strong>
              <p>Coba ubah pencarian atau filter.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
