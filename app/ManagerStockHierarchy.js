"use client";

import { useEffect, useMemo, useState } from "react";
import { formatStockQuantity } from "../lib/product-units.mjs";
import styles from "./ManagerStockHierarchy.module.css";

const isActive = (row) => row?.active === true || Number(row?.active) === 1;

function rowMatchesCategory(row, category) {
  if (row?.category_id != null && category?.id != null) {
    return Number(row.category_id) === Number(category.id);
  }
  return String(row?.category_name || "") === String(category?.name || "");
}

function rowMatchesSubcategory(row, subcategory) {
  if (row?.subcategory_id != null && subcategory?.id != null) {
    return Number(row.subcategory_id) === Number(subcategory.id);
  }
  return (
    String(row?.subcategory_name || "") === String(subcategory?.name || "") &&
    String(row?.category_name || "") === String(subcategory?.category_name || "")
  );
}

function StockSummary({ label, value, tone = "default" }) {
  return (
    <article className={`${styles.summaryCard} ${styles[tone] || ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

export default function ManagerStockHierarchy({
  inventory,
  stock,
  busy,
  mutate,
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [productStatus, setProductStatus] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [collapsedSubcategories, setCollapsedSubcategories] = useState(
    () => new Set(),
  );

  const selectedProduct = (stock.products || []).find(
    (row) => Number(row.id) === Number(selectedProductId),
  );

  const healthLabel = (status) =>
    status === "UNLIMITED"
      ? "Unlimited"
      : status === "OUT"
        ? "Habis"
        : status === "LOW"
          ? "Rendah"
          : "Aman";

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (stock.products || []).filter((row) => {
      const text = `${row.name || ""} ${row.category_name || ""} ${row.subcategory_name || ""}`.toLowerCase();
      const active = isActive(row);
      return (
        (!needle || text.includes(needle)) &&
        (categoryFilter === "all" || String(row.category_id ?? row.category_name) === categoryFilter) &&
        (subcategoryFilter === "all" || String(row.subcategory_id ?? row.subcategory_name) === subcategoryFilter) &&
        (productStatus === "all" ||
          (productStatus === "active" ? active : !active)) &&
        (healthFilter === "all" || row.stock_status === healthFilter)
      );
    });
  }, [stock.products, search, categoryFilter, subcategoryFilter, productStatus, healthFilter]);

  const groupedRows = useMemo(() => {
    const categories = (inventory.categories || [])
      .map((category) => {
        const categoryRows = rows.filter((row) => rowMatchesCategory(row, category));
        const subgroups = (inventory.subcategories || [])
          .filter(
            (subcategory) =>
              Number(subcategory.category_id) === Number(category.id) &&
              categoryRows.some((row) => rowMatchesSubcategory(row, subcategory)),
          )
          .slice()
          .sort(
            (a, b) =>
              Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
              Number(a.id) - Number(b.id),
          )
          .map((subcategory) => ({
            key: `subcategory-${subcategory.id}`,
            id: Number(subcategory.id),
            name: subcategory.name,
            active: isActive(subcategory),
            subcategory,
            rows: categoryRows.filter((row) =>
              rowMatchesSubcategory(row, subcategory),
            ),
          }));

        const assigned = new Set(
          subgroups.flatMap((group) => group.rows.map((row) => Number(row.id))),
        );
        const generalRows = categoryRows.filter(
          (row) => !assigned.has(Number(row.id)),
        );
        if (generalRows.length) {
          subgroups.push({
            key: `general-${category.id}`,
            id: null,
            name: "Umum",
            active: true,
            subcategory: null,
            rows: generalRows,
          });
        }

        return {
          id: Number(category.id),
          name: category.name,
          rows: categoryRows,
          subgroups,
        };
      })
      .filter((group) => group.rows.length > 0);

    const groupedIds = new Set(
      categories.flatMap((group) => group.rows.map((row) => Number(row.id))),
    );
    const orphanRows = rows.filter((row) => !groupedIds.has(Number(row.id)));
    if (orphanRows.length) {
      const byCategory = new Map();
      orphanRows.forEach((row) => {
        const key = String(row.category_name || "Tanpa Kategori");
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(row);
      });
      byCategory.forEach((categoryRows, name) => {
        categories.push({
          id: `orphan-${name}`,
          name,
          rows: categoryRows,
          subgroups: [
            {
              key: `orphan-${name}`,
              id: null,
              name: categoryRows[0]?.subcategory_name || "Umum",
              active: true,
              subcategory: null,
              rows: categoryRows,
            },
          ],
        });
      });
    }

    return categories;
  }, [inventory.categories, inventory.subcategories, rows]);

  const summary = useMemo(() => {
    const all = stock.products || [];
    return {
      total: all.length,
      safe: all.filter((row) => row.stock_status === "OK" || row.stock_status === "UNLIMITED").length,
      low: all.filter((row) => row.stock_status === "LOW").length,
      out: all.filter((row) => row.stock_status === "OUT").length,
    };
  }, [stock.products]);

  const toggleSubcategory = (key) => {
    setCollapsedSubcategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSubcategoryVisibility = async (group) => {
    const row = group.subcategory;
    if (!row) return;
    await mutate("subcategory", {
      id: Number(row.id),
      categoryId: Number(row.category_id),
      name: row.name,
      sortOrder: Number(row.sort_order || 0),
      active: !isActive(row),
    });
  };

  useEffect(() => {
    if (!selectedProduct) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedProductId(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedProduct]);

  async function submitAdjustment(event) {
    event.preventDefault();
    if (!selectedProduct) return;
    const form = new FormData(event.currentTarget);
    const succeeded = await mutate("stock", {
      productId: selectedProduct.id,
      quantity: Number(form.get("quantity")),
      reason: form.get("reason"),
    });
    if (succeeded) setSelectedProductId(null);
  }

  return (
    <div className={styles.page}>
      <div className="manager-page-title">
        <div>
          <span>PUSAT PENGELOLAAN</span>
          <h1>Kontrol Stok</h1>
          <p>
            Stok dikelompokkan mengikuti Produk &amp; Menu. Visibilitas Customer
            dikontrol per subkategori tanpa menghapus data inventori internal.
          </p>
        </div>
        <div className="manager-sync-note">
          <strong>⇄ Sinkronisasi real-time</strong>
          <small>Perubahan visibilitas memakai Product Master yang sama.</small>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <StockSummary label="Total Produk" value={summary.total} />
        <StockSummary label="Stok Aman" value={summary.safe} tone="safe" />
        <StockSummary label="Stok Rendah" value={summary.low} tone="low" />
        <StockSummary label="Stok Habis" value={summary.out} tone="out" />
      </div>

      <div className={styles.toolbar}>
        <input
          aria-label="Cari stok produk"
          placeholder="Cari produk, kategori, atau subkategori…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter kategori stok"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">Semua kategori</option>
          {(inventory.categories || []).map((row) => (
            <option key={row.id} value={String(row.id)}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter subkategori stok"
          value={subcategoryFilter}
          onChange={(event) => setSubcategoryFilter(event.target.value)}
        >
          <option value="all">Semua subkategori</option>
          {(inventory.subcategories || []).map((row) => (
            <option key={row.id} value={String(row.id)}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter status produk stok"
          value={productStatus}
          onChange={(event) => setProductStatus(event.target.value)}
        >
          <option value="all">Semua status produk</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <select
          aria-label="Filter kondisi stok"
          value={healthFilter}
          onChange={(event) => setHealthFilter(event.target.value)}
        >
          <option value="all">Semua kondisi stok</option>
          <option value="OK">Aman</option>
          <option value="LOW">Rendah</option>
          <option value="OUT">Habis</option>
          <option value="UNLIMITED">Unlimited</option>
        </select>
      </div>

      <section className={`manager-card ${styles.list}`}>
        <header className={styles.listHeading}>
          <div>
            <h2>Daftar Stok</h2>
            <p>{rows.length} produk sesuai filter.</p>
          </div>
        </header>

        <div className={styles.categories}>
          {groupedRows.map((group) => (
            <section className={styles.category} key={group.id}>
              <header className={styles.categoryHeading}>
                <h3>{group.name}</h3>
                <div className={styles.categoryMeta}>
                  <strong>{group.rows.length}</strong>
                  <small>produk · {group.subgroups.length} subkategori</small>
                </div>
              </header>

              <div className={styles.subgroups}>
                {group.subgroups.map((subgroup) => {
                  const collapsed = collapsedSubcategories.has(subgroup.key);
                  return (
                    <section
                      className={`${styles.subgroup} ${
                        subgroup.active ? "" : styles.subgroupHidden
                      }`}
                      key={subgroup.key}
                    >
                      <div className={styles.subgroupHeader}>
                        <button
                          type="button"
                          className={styles.subgroupToggle}
                          aria-expanded={!collapsed}
                          onClick={() => toggleSubcategory(subgroup.key)}
                        >
                          <h4>{subgroup.name}</h4>
                          <div className={styles.subgroupMeta}>
                            <strong>{subgroup.rows.length}</strong>
                            <span>produk</span>
                            <i
                              className={`${styles.chevron} ${
                                collapsed ? styles.chevronCollapsed : ""
                              }`}
                              aria-hidden="true"
                            />
                          </div>
                        </button>

                        {subgroup.subcategory && (
                          <button
                            type="button"
                            className={
                              subgroup.active
                                ? styles.visibilityHide
                                : styles.visibilityShow
                            }
                            aria-label={
                              subgroup.active
                                ? `Sembunyikan subkategori ${subgroup.name}`
                                : `Tampilkan subkategori ${subgroup.name}`
                            }
                            title={
                              subgroup.active
                                ? `Sembunyikan ${subgroup.name}`
                                : `Tampilkan ${subgroup.name}`
                            }
                            disabled={busy}
                            onClick={() => toggleSubcategoryVisibility(subgroup)}
                          />
                        )}
                      </div>

                      {!collapsed && (
                        <div className={styles.tableWrap}>
                          <table>
                            <thead>
                              <tr>
                                <th>Produk</th>
                                <th>Current</th>
                                <th>Reserved</th>
                                <th>Available</th>
                                <th>Kondisi</th>
                                <th>Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subgroup.rows.map((row) => (
                                <tr
                                  key={row.id}
                                  className={isActive(row) ? "" : styles.productInactive}
                                >
                                  <td>
                                    <img
                                      src={row.image_url || "/demo/promo-warkost.webp"}
                                      alt=""
                                    />
                                    <span>
                                      <strong>{row.name}</strong>
                                      <small>
                                        #{String(row.id).padStart(4, "0")} ·{" "}
                                        {isActive(row) ? "Aktif" : "Nonaktif"}
                                      </small>
                                    </span>
                                  </td>
                                  <td>
                                    {Number(row.unlimited_stock) === 1
                                      ? "∞"
                                      : formatStockQuantity(
                                          row.stock_quantity,
                                          row.stock_unit,
                                        )}
                                  </td>
                                  <td>
                                    {Number(row.unlimited_stock) === 1
                                      ? "—"
                                      : formatStockQuantity(
                                          row.reserved_quantity,
                                          row.stock_unit,
                                        )}
                                  </td>
                                  <td>
                                    {Number(row.unlimited_stock) === 1
                                      ? "∞"
                                      : formatStockQuantity(
                                          row.available_quantity,
                                          row.stock_unit,
                                        )}
                                  </td>
                                  <td>
                                    <span
                                      className={`${styles.stockState} ${
                                        row.stock_status === "LOW"
                                          ? styles.stateLow
                                          : row.stock_status === "OUT"
                                            ? styles.stateOut
                                            : row.stock_status === "UNLIMITED"
                                              ? styles.stateUnlimited
                                              : styles.stateSafe
                                      }`}
                                    >
                                      {healthLabel(row.stock_status)}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.stockAction}
                                      disabled={Number(row.unlimited_stock) === 1}
                                      onClick={() => setSelectedProductId(row.id)}
                                    >
                                      {Number(row.unlimited_stock) === 1
                                        ? "Unlimited"
                                        : "Atur Stok"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {!rows.length && (
          <div className="manager-empty">Tidak ada stok sesuai filter.</div>
        )}
      </section>

      {selectedProduct && (
        <div
          className="manager-stock-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedProductId(null);
          }}
        >
          <section
            className="manager-stock-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-stock-drawer-title"
          >
            <header>
              <div>
                <span>PENYESUAIAN INVENTORI</span>
                <h2 id="manager-stock-drawer-title">Atur Stok</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup pengaturan stok"
                onClick={() => setSelectedProductId(null)}
              >
                ×
              </button>
            </header>

            <div
              className={`manager-stock-drawer-product ${
                isActive(selectedProduct) ? "" : "inactive"
              }`}
            >
              <img
                src={selectedProduct.image_url || "/demo/promo-warkost.webp"}
                alt=""
              />
              <div>
                <strong>{selectedProduct.name}</strong>
                <small>
                  {selectedProduct.category_name} ·{" "}
                  {selectedProduct.subcategory_name || "Umum"}
                </small>
                <span
                  className={`manager-status ${
                    isActive(selectedProduct) ? "active" : "inactive"
                  }`}
                >
                  {isActive(selectedProduct) ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>

            {!isActive(selectedProduct) && (
              <p className="manager-stock-inactive-note">
                Produk ini nonaktif untuk penjualan. Penyesuaian hanya mengubah
                inventori fisik dan tidak mengaktifkan produk.
              </p>
            )}

            <dl className="manager-stock-drawer-metrics">
              {[
                ["Current", selectedProduct.stock_quantity],
                ["Reserved", selectedProduct.reserved_quantity],
                ["Available", selectedProduct.available_quantity],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatStockQuantity(value, selectedProduct.stock_unit)}</dd>
                </div>
              ))}
            </dl>

            <form onSubmit={submitAdjustment}>
              <label>
                Penyesuaian ({selectedProduct.stock_unit || "PCS"})
                <input
                  name="quantity"
                  type="number"
                  step="1"
                  inputMode="numeric"
                  placeholder="Contoh: +10 atau -5"
                  required
                />
              </label>
              <label>
                Alasan
                <textarea
                  name="reason"
                  minLength="3"
                  maxLength="240"
                  placeholder="Contoh: Restock supplier"
                  required
                />
              </label>
              <div className="manager-stock-drawer-actions">
                <button type="button" onClick={() => setSelectedProductId(null)}>
                  Batal
                </button>
                <button className="manager-primary" disabled={busy}>
                  Simpan Penyesuaian
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
