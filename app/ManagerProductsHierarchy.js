"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatStockQuantity,
  productPriceLabel,
} from "../lib/product-units.mjs";
import styles from "./ManagerProductsHierarchy.module.css";

const money = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");
const isActive = (row) => row?.active === true || Number(row?.active) === 1;

function ProductSummaryCard({ label, value, tone = "clay" }) {
  return (
    <article className={`manager-summary-card ${tone}`}>
      <span className="manager-summary-icon" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ProductForm({
  product,
  categories,
  subcategories,
  busy,
  onSave,
  onCancel,
}) {
  const [categoryId, setCategoryId] = useState(
    Number(product?.category_id || categories[0]?.id || 0),
  );
  const options = subcategories.filter(
    (row) =>
      Number(row.category_id) === categoryId &&
      (isActive(row) || Number(row.id) === Number(product?.subcategory_id)),
  );
  const category = categories.find((row) => Number(row.id) === categoryId);

  return (
    <form
      className="manager-product-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave(
          {
            ...(product ? { id: product.id } : {}),
            name: form.get("name"),
            description: form.get("description"),
            price: Number(form.get("price")),
            categoryId: Number(form.get("categoryId")),
            subcategoryId: form.get("subcategoryId")
              ? Number(form.get("subcategoryId"))
              : null,
            imageUrl: form.get("imageUrl"),
            stockUnit: form.get("stockUnit"),
            priceUnitQuantity: Number(form.get("priceUnitQuantity")),
            minimumOrderQuantity: Number(form.get("minimumOrderQuantity")),
            orderStepQuantity: Number(form.get("orderStepQuantity")),
            lowStockThreshold: Number(form.get("lowStockThreshold")),
            unlimitedStock: form.get("unlimitedStock") === "on",
            active: form.get("active") === "on",
          },
          form.get("image"),
        );
      }}
    >
      <header>
        <div>
          <h2>{product ? "Edit Produk" : "Tambah Produk"}</h2>
          <p>Lengkapi informasi produk pada satu Product Master.</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Tutup
          </button>
        )}
      </header>

      <div className="manager-form-grid">
        <label className="manager-image-field">
          Foto Produk
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
          />
          <small>PNG, JPG, WEBP atau AVIF · maks. 8 MB</small>
        </label>

        <label>
          Nama Produk
          <input
            name="name"
            required
            minLength="2"
            defaultValue={product?.name || ""}
          />
        </label>

        <label>
          Kategori
          <select
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value))}
          >
            {categories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Subkategori
          <select
            name="subcategoryId"
            defaultValue={product?.subcategory_id || ""}
          >
            <option value="">Tanpa subkategori</option>
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="wide">
          Deskripsi Produk
          <textarea
            name="description"
            maxLength="500"
            defaultValue={product?.description || ""}
          />
        </label>

        <label>
          Harga
          <input
            name="price"
            type="number"
            min="1"
            required
            defaultValue={product?.price || ""}
          />
        </label>

        <label>
          Satuan
          <select name="stockUnit" defaultValue={product?.stock_unit || "PCS"}>
            <option value="PCS">PCS</option>
            <option value="GRAM">GRAM</option>
          </select>
        </label>

        <label>
          Harga per kuantitas
          <input
            name="priceUnitQuantity"
            type="number"
            min="1"
            required
            defaultValue={product?.price_unit_quantity || 1}
          />
        </label>

        <label>
          Minimum order
          <input
            name="minimumOrderQuantity"
            type="number"
            min="1"
            required
            defaultValue={product?.minimum_order_quantity || 1}
          />
        </label>

        <label>
          Step order
          <input
            name="orderStepQuantity"
            type="number"
            min="1"
            required
            defaultValue={product?.order_step_quantity || 1}
          />
        </label>

        <label>
          Alert stok rendah
          <input
            name="lowStockThreshold"
            type="number"
            min="0"
            required
            defaultValue={product?.low_stock_threshold ?? 5}
          />
        </label>

        <label className="wide">
          URL gambar / media internal
          <input name="imageUrl" defaultValue={product?.image_url || ""} />
        </label>

        <label className="manager-switch">
          <input
            name="active"
            type="checkbox"
            defaultChecked={product ? Boolean(product.active) : true}
          />{" "}
          Produk aktif
        </label>

        <label className="manager-switch">
          <input
            name="unlimitedStock"
            type="checkbox"
            defaultChecked={Number(product?.unlimited_stock || 0) === 1}
          />{" "}
          Stok unlimited
        </label>
      </div>

      <p className="manager-routing-hint">
        Routing otomatis: Customer +{" "}
        {category?.name === "Makanan" ? "Kitchen" : "Admin"}.
      </p>
      <button className="manager-primary" disabled={busy}>
        {product ? "Simpan Produk" : "Tambah Produk"}
      </button>
    </form>
  );
}

export default function ManagerProductsHierarchy({
  inventory,
  stock,
  busy,
  saveProduct,
  mutate,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [subcategory, setSubcategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [collapsedSubcategories, setCollapsedSubcategories] = useState(
    () => new Set(),
  );

  const stockById = useMemo(
    () => new Map((stock.products || []).map((row) => [Number(row.id), row])),
    [stock.products],
  );

  const rows = inventory.products.filter((row) => {
    const text =
      `${row.name} ${row.category_name} ${row.subcategory_name || ""}`.toLowerCase();
    return (
      text.includes(search.toLowerCase()) &&
      (category === "all" || String(row.category_id) === category) &&
      (subcategory === "all" || String(row.subcategory_id) === subcategory) &&
      (status === "all" || (status === "active") === Boolean(row.active))
    );
  });

  const subcategoryById = useMemo(
    () =>
      new Map(
        (inventory.subcategories || []).map((row) => [Number(row.id), row]),
      ),
    [inventory.subcategories],
  );

  const groupedRows = useMemo(() => {
    const groups = inventory.categories
      .map((categoryRow) => {
        const categoryRows = rows.filter(
          (row) => Number(row.category_id) === Number(categoryRow.id),
        );

        const subgroups = (inventory.subcategories || [])
          .filter(
            (subRow) =>
              Number(subRow.category_id) === Number(categoryRow.id) &&
              categoryRows.some(
                (row) => Number(row.subcategory_id) === Number(subRow.id),
              ),
          )
          .slice()
          .sort(
            (a, b) =>
              Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
              Number(a.id) - Number(b.id),
          )
          .map((subRow) => ({
            key: `subcategory-${subRow.id}`,
            id: Number(subRow.id),
            name: subRow.name,
            active: isActive(subRow),
            subcategory: subRow,
            rows: categoryRows.filter(
              (row) => Number(row.subcategory_id) === Number(subRow.id),
            ),
          }));

        const generalRows = categoryRows.filter(
          (row) =>
            !row.subcategory_id ||
            !subcategoryById.has(Number(row.subcategory_id)),
        );
        if (generalRows.length) {
          subgroups.push({
            key: `general-${categoryRow.id}`,
            id: null,
            name: "Umum",
            active: true,
            subcategory: null,
            rows: generalRows,
          });
        }

        return {
          id: Number(categoryRow.id),
          name: categoryRow.name,
          rows: categoryRows,
          subgroups,
        };
      })
      .filter((group) => group.rows.length > 0);

    const orphanRows = rows.filter(
      (row) =>
        !inventory.categories.some(
          (categoryRow) => Number(categoryRow.id) === Number(row.category_id),
        ),
    );
    if (orphanRows.length) {
      groups.push({
        id: 0,
        name: "Tanpa Kategori",
        rows: orphanRows,
        subgroups: [
          {
            key: "orphan-general",
            id: null,
            name: "Umum",
            active: true,
            subcategory: null,
            rows: orphanRows,
          },
        ],
      });
    }

    return groups;
  }, [inventory.categories, inventory.subcategories, rows, subcategoryById]);

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

  const low = inventory.products.filter(
    (row) =>
      Number(row.unlimited_stock) !== 1 &&
      Number(
        stockById.get(Number(row.id))?.available_quantity ?? row.stock_quantity,
      ) <= Number(row.low_stock_threshold || 0),
  ).length;

  return (
    <div className="manager-products-page">
      <div className="manager-page-title">
        <div>
          <span>PUSAT PENGELOLAAN</span>
          <h1>Produk &amp; Menu</h1>
          <p>
            Kategori menjadi judul utama. Produk dikelompokkan per subkategori,
            dan visibilitas Customer dikontrol pada level subkategori.
          </p>
        </div>
        <div className="manager-sync-note">
          <strong>⇄ Sinkronisasi real-time</strong>
          <small>
            Perubahan subkategori langsung mengikuti Product Master terbaru.
          </small>
        </div>
      </div>

      <div className="manager-product-tools">
        <input
          aria-label="Cari produk"
          placeholder="Cari nama produk, kategori, atau subkategori…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter kategori"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">Semua kategori</option>
          {inventory.categories.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter subkategori"
          value={subcategory}
          onChange={(event) => setSubcategory(event.target.value)}
        >
          <option value="all">Semua subkategori</option>
          {(inventory.subcategories || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter status produk"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">Semua status produk</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <button className="manager-primary" onClick={() => setEditing("new")}>
          ＋ Tambah Produk
        </button>
      </div>

      <div className="manager-product-kpis">
        <ProductSummaryCard
          label="Total Produk"
          value={inventory.products.length}
        />
        <ProductSummaryCard
          label="Produk Aktif"
          value={inventory.products.filter((row) => row.active).length}
          tone="green"
        />
        <ProductSummaryCard
          label="Produk Nonaktif"
          value={inventory.products.filter((row) => !row.active).length}
        />
        <ProductSummaryCard label="Stok Rendah" value={low} tone="amber" />
      </div>

      <div className="manager-product-layout">
        <section className={`manager-card manager-product-list ${styles.list}`}>
          <header>
            <div>
              <h2>Daftar Produk</h2>
              <p>{rows.length} produk sesuai filter.</p>
            </div>
          </header>

          <div className={styles.categories}>
            {groupedRows.map((group) => (
              <section className={styles.category} key={group.id}>
                <header className={styles.categoryHeading}>
                  <div>
                    <span>KATEGORI</span>
                    <h3>{group.name}</h3>
                  </div>
                  <div className={styles.categoryMeta}>
                    <strong>{group.rows.length}</strong>
                    <small>
                      produk · {group.subgroups.length} subkategori
                    </small>
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
                            <div className={styles.subgroupTitle}>
                              <span>SUBKATEGORI</span>
                              <h4>{subgroup.name}</h4>
                            </div>
                            <div className={styles.subgroupMeta}>
                              <strong>{subgroup.rows.length}</strong>
                              <small>
                                produk · {subgroup.active ? "Tampil" : "Disembunyikan"}
                              </small>
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
                              onClick={() =>
                                toggleSubcategoryVisibility(subgroup)
                              }
                            />
                          )}
                        </div>

                        {!collapsed && (
                          <div className={styles.tableWrap}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Produk</th>
                                  <th>Harga</th>
                                  <th>Stok</th>
                                  <th>Status</th>
                                  <th>Routing</th>
                                  <th>Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subgroup.rows.map((row) => {
                                  const currentStock = stockById.get(
                                    Number(row.id),
                                  );
                                  return (
                                    <tr key={row.id}>
                                      <td>
                                        <img
                                          className="manager-product-thumb"
                                          src={
                                            row.image_url ||
                                            "/demo/promo-warkost.webp"
                                          }
                                          alt=""
                                        />
                                        <span>
                                          <strong>{row.name}</strong>
                                          <small>
                                            #{String(row.id).padStart(4, "0")}
                                          </small>
                                        </span>
                                      </td>
                                      <td>{productPriceLabel(row, money)}</td>
                                      <td>
                                        {Number(row.unlimited_stock) === 1
                                          ? "Unlimited"
                                          : formatStockQuantity(
                                              currentStock?.available_quantity ??
                                                row.stock_quantity,
                                              row.stock_unit,
                                            )}
                                      </td>
                                      <td>
                                        <span
                                          className={`manager-status ${
                                            row.active ? "active" : "inactive"
                                          }`}
                                        >
                                          {row.active ? "Aktif" : "Nonaktif"}
                                        </span>
                                      </td>
                                      <td>
                                        Customer +{" "}
                                        {row.category_name === "Makanan"
                                          ? "Kitchen"
                                          : "Admin"}
                                      </td>
                                      <td>
                                        <button
                                          type="button"
                                          className={styles.editButton}
                                          onClick={() => setEditing(row)}
                                        >
                                          Edit
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
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
            <div className="manager-empty">Tidak ada produk yang cocok.</div>
          )}
        </section>

        {editing && (
          <ProductForm
            key={editing === "new" ? "new" : editing.id}
            product={editing === "new" ? null : editing}
            categories={inventory.categories}
            subcategories={inventory.subcategories || []}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(body, file) =>
              saveProduct(body, file).then?.(() => setEditing(null))
            }
          />
        )}
      </div>
    </div>
  );
}
