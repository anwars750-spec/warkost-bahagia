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

const ICONS = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
  cup: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h11l-1 12H7L6 7Z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3c0 1 1 1.5 1 2.5M12 3c0 1 1 1.5 1 2.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
};

const drinkCategory = (name) =>
  /minum|drink|beverage|kopi|coffee|teh|tea|jus|juice/i.test(String(name || ""));

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

export default function AdminBeverageStockEnhancerV2() {
  useEffect(() => {
    let portal = null;
    let root = null;
    let loading = false;
    let menuProducts = [];
    let categories = [];
    let stockProducts = [];
    let stockAvailable = false;
    let dataError = "";
    let query = "";
    let filter = "all";

    const ensurePortal = () => {
      portal = document.getElementById("admin-ui-portal-root");
      return portal;
    };

    const categoryName = (product) =>
      categories.find((item) => String(item.id) === String(product.category_id))
        ?.name || "Minuman";

    const stockMap = () =>
      new Map(stockProducts.map((item) => [String(item.id), item]));

    const beverages = () => {
      const byStock = stockMap();
      return menuProducts
        .filter((product) => {
          const stockItem = byStock.get(String(product.id));
          if (stockItem) return stockItem.prep_station === "CASHIER";
          return drinkCategory(categoryName(product));
        })
        .map((product) => {
          const stockItem = byStock.get(String(product.id));
          const stockQuantity = stockItem
            ? Number(stockItem.stock_quantity)
            : Number.NaN;
          return {
            ...product,
            category_name: stockItem?.category_name || categoryName(product),
            stock_quantity: stockQuantity,
            promo_price: itemPromoPrice(product),
          };
        });
    };

    const filteredProducts = () => {
      const needle = query.trim().toLowerCase();
      return beverages().filter((product) => {
        const tone = stockTone(product.stock_quantity);
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
        return searchMatch && filterMatch;
      });
    };

    const stats = () => {
      const products = beverages();
      return {
        total: products.length,
        safe: products.filter((item) => stockTone(item.stock_quantity) === "safe")
          .length,
        low: products.filter((item) => stockTone(item.stock_quantity) === "low")
          .length,
        empty: products.filter((item) => stockTone(item.stock_quantity) === "empty")
          .length,
      };
    };

    const cardMarkup = (product) => {
      const quantity = product.stock_quantity;
      const tone = stockTone(quantity);
      const promo = product.promo_price;
      return `
        <article class="admin-beverage-stock-card">
          <div class="admin-beverage-stock-card-head">
            <span class="admin-beverage-stock-cup">${ICONS.cup}</span>
            <div>
              <small>${esc(product.category_name || "Minuman")}</small>
              <h3>${esc(product.name)}</h3>
            </div>
            <span class="admin-beverage-stock-status ${tone}">${esc(
              stockLabel(quantity),
            )}</span>
          </div>
          <div class="admin-beverage-stock-quantity ${tone}">
            <span>Stok tersedia</span>
            <strong>${Number.isFinite(quantity) ? esc(quantity) : "—"}</strong>
            <small>${
              Number.isFinite(quantity) ? "unit" : "menunggu data stok"
            }</small>
          </div>
          <div class="admin-beverage-stock-meta">
            <div>
              <small>Harga</small>
              <strong class="${promo ? "has-promo" : ""}">${esc(
                money(product.price),
              )}</strong>
            </div>
            <div>
              <small>Promo item</small>
              ${
                promo
                  ? `<strong class="promo-price">${esc(money(promo))}</strong>`
                  : `<strong class="no-promo">Tidak ada</strong>`
              }
            </div>
          </div>
        </article>`;
    };

    const render = () => {
      if (!root) return;
      const summary = stats();
      const products = filteredProducts();
      root.innerHTML = `
        <section class="admin-beverage-stock-shell">
          <header class="admin-beverage-stock-hero">
            <div>
              <small>PUSAT STOK ADMIN</small>
              <h1>Stok Minuman</h1>
              <p>Pantau stok minuman yang disiapkan Admin tanpa mengubah data produk.</p>
            </div>
            <span class="admin-beverage-readonly">${ICONS.lock}<span>Read only</span></span>
          </header>
          <section class="admin-beverage-stock-stats">
            <article><span class="total">${ICONS.cup}</span><small>Total minuman</small><strong>${summary.total}</strong></article>
            <article><span class="safe">${ICONS.check}</span><small>Stok aman</small><strong>${
              stockAvailable ? summary.safe : "—"
            }</strong></article>
            <article><span class="low">${ICONS.alert}</span><small>Menipis</small><strong>${
              stockAvailable ? summary.low : "—"
            }</strong></article>
            <article><span class="empty">${ICONS.empty}</span><small>Habis</small><strong>${
              stockAvailable ? summary.empty : "—"
            }</strong></article>
          </section>
          ${
            !stockAvailable
              ? `<aside class="admin-beverage-stock-notice">
                  <span>${ICONS.lock}</span>
                  <div><strong>Jumlah stok belum tersambung</strong><p>Daftar minuman dan harga tetap bisa dilihat. Kuantitas stok akan tampil setelah akses baca khusus Admin diaktifkan.</p></div>
                </aside>`
              : ""
          }
          ${
            dataError
              ? `<div class="admin-beverage-stock-error">${esc(dataError)}</div>`
              : ""
          }
          <section class="admin-beverage-stock-toolbar">
            <label><span>${ICONS.search}</span><input type="search" value="${esc(
              query,
            )}" placeholder="Cari minuman..." aria-label="Cari minuman" /></label>
            <div class="admin-beverage-stock-filters" role="group" aria-label="Filter stok minuman">
              ${[
                ["all", "Semua"],
                ["safe", "Aman"],
                ["low", "Menipis"],
                ["empty", "Habis"],
                ["promo", "Promo"],
              ]
                .map(
                  ([key, label]) =>
                    `<button type="button" data-stock-filter="${key}" class="${
                      filter === key ? "active" : ""
                    }">${label}</button>`,
                )
                .join("")}
            </div>
          </section>
          <div class="admin-beverage-stock-list">
            ${
              loading
                ? `<div class="admin-beverage-stock-state"><span class="spinner"></span><strong>Memuat stok minuman...</strong></div>`
                : products.length
                  ? products.map(cardMarkup).join("")
                  : `<div class="admin-beverage-stock-state"><span>${ICONS.cup}</span><strong>Minuman tidak ditemukan</strong><p>Coba ubah pencarian atau filter.</p></div>`
            }
          </div>
        </section>`;

      const input = root.querySelector("input[type='search']");
      input?.addEventListener("input", (event) => {
        query = event.target.value;
        render();
        requestAnimationFrame(() => {
          const next = root?.querySelector("input[type='search']");
          next?.focus();
          next?.setSelectionRange(query.length, query.length);
        });
      });
      root.querySelectorAll("[data-stock-filter]").forEach((item) =>
        item.addEventListener("click", () => {
          filter = item.dataset.stockFilter;
          render();
        }),
      );
    };

    const load = async () => {
      if (loading) return;
      loading = true;
      dataError = "";
      render();
      try {
        const menuResponse = await fetch("/api/menu", { cache: "no-store" });
        const menuData = await menuResponse.json();
        if (!menuResponse.ok)
          throw new Error(menuData.error || "Gagal memuat daftar minuman");
        menuProducts = Array.isArray(menuData.products) ? menuData.products : [];
        categories = Array.isArray(menuData.categories) ? menuData.categories : [];

        try {
          const stockResponse = await fetch("/api/admin-beverage-stock", {
            cache: "no-store",
          });
          const stockData = await stockResponse.json().catch(() => ({}));
          if (stockResponse.ok) {
            stockProducts = Array.isArray(stockData.products)
              ? stockData.products
              : [];
            stockAvailable = true;
          } else {
            stockProducts = [];
            stockAvailable = false;
          }
        } catch {
          stockProducts = [];
          stockAvailable = false;
        }
      } catch (error) {
        dataError = error.message || "Data minuman belum dapat dimuat";
      } finally {
        loading = false;
        render();
      }
    };

    const ensureRoot = () => {
      const host = ensurePortal();
      if (!host) return null;
      document
        .querySelectorAll("main #admin-beverage-stock-v1")
        .forEach((legacy) => legacy.remove());
      if (!root || !root.isConnected) {
        root = document.createElement("div");
        root.id = "admin-beverage-stock-v1";
        host.appendChild(root);
      }
      return root;
    };

    const mount = () => {
      document.body.classList.add("admin-beverage-stock-view");
      ensureRoot();
      render();
      load();
    };

    mount();

    return () => {
      document.body.classList.remove("admin-beverage-stock-view");
      root?.remove();
    };
  }, []);

  return null;
}
