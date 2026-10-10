"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatStockQuantity,
  productPriceLabel,
} from "../lib/product-units.mjs";
import ManagerPromotionCenter from "./ManagerPromotionCenter";

const money = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");
function Delta({ value, suffix = "dari periode sebelumnya" }) {
  const amount = Number(value || 0);
  return (
    <small
      className={
        amount >= 0 ? "manager-delta positive" : "manager-delta negative"
      }
    >
      {amount >= 0 ? "↑" : "↓"} {amount >= 0 ? "+" : ""}
      {amount}% <span>{suffix}</span>
    </small>
  );
}

function SummaryCard({ label, value, delta, tone = "clay" }) {
  return (
    <article className={`manager-summary-card ${tone}`}>
      <span className="manager-summary-icon" aria-hidden="true">
        {label.slice(0, 1)}
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {delta !== undefined && <Delta value={delta} />}
      </div>
    </article>
  );
}

function PeriodControls({ period, setPeriod }) {
  const presets = [
    ["today", "Hari ini"],
    ["yesterday", "Kemarin"],
    ["7d", "7 hari"],
    ["month", "Bulan ini"],
    ["custom", "Custom"],
  ];
  return (
    <div className="manager-period-block">
      <div className="manager-period-tabs" aria-label="Periode dashboard">
        {presets.map(([key, label]) => (
          <button
            key={key}
            className={period.preset === key ? "active" : ""}
            onClick={() =>
              setPeriod((current) => ({ ...current, preset: key }))
            }
          >
            ▣ <span>{label}</span>
          </button>
        ))}
      </div>
      {period.preset === "custom" && (
        <div className="manager-date-range">
          <input
            aria-label="Tanggal mulai"
            type="date"
            value={period.from}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, from: event.target.value }))
            }
          />
          <span>–</span>
          <input
            aria-label="Tanggal akhir"
            type="date"
            value={period.to}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, to: event.target.value }))
            }
          />
        </div>
      )}
    </div>
  );
}

function SalesTrend({ rows, empty }) {
  const maxOrders = Math.max(1, ...rows.map((row) => Number(row.orders)));
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.revenue)));
  const points = rows
    .map((row, index) => {
      const x = rows.length === 1 ? 50 : 5 + (index / (rows.length - 1)) * 90;
      const y = 90 - (Number(row.orders) / maxOrders) * 70;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <section className="manager-card manager-trend-card">
      <header>
        <div>
          <span className="manager-card-icon">▥</span>
          <div>
            <h2>Tren Penjualan</h2>
            <p>Jumlah pesanan dan revenue pada periode terpilih.</p>
          </div>
        </div>
        <div className="manager-chart-legend">
          <span>● Jumlah Pesanan</span>
          <span>● Revenue</span>
        </div>
      </header>
      {empty ? (
        <div className="manager-empty">
          Belum ada transaksi pada periode ini.
        </div>
      ) : (
        <div className="manager-trend-chart">
          <div className="manager-bars">
            {rows.map((row) => (
              <div className="manager-bar-slot" key={row.label}>
                <i
                  style={{
                    height: `${Math.max(4, (Number(row.revenue) / maxRevenue) * 84)}%`,
                  }}
                />
                <small>{row.label}</small>
              </div>
            ))}
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label="Garis jumlah pesanan"
          >
            <polyline points={points} />
          </svg>
        </div>
      )}
    </section>
  );
}

function CategoryContribution({ rows, empty }) {
  const colors = ["#b43d20", "#ef9f5d", "#f4c45e"];
  let angle = 0;
  const slices = rows.slice(0, 3).map((row, index) => {
    const start = angle;
    angle += Number(row.contribution);
    return `${colors[index]} ${start}% ${angle}%`;
  });
  if (angle < 100) slices.push(`#d8dec8 ${angle}% 100%`);
  return (
    <section className="manager-card manager-category-card">
      <header>
        <div>
          <span className="manager-card-icon">◔</span>
          <div>
            <h2>Kontribusi Kategori</h2>
            <p>Persentase penjualan kategori utama.</p>
          </div>
        </div>
      </header>
      {empty ? (
        <div className="manager-empty">Belum ada data penjualan.</div>
      ) : (
        <div className="manager-donut-layout">
          <div
            className="manager-donut"
            style={{ background: `conic-gradient(${slices.join(",")})` }}
          >
            <span>
              <strong>
                {rows.reduce((sum, row) => sum + Number(row.quantity), 0)}
              </strong>
              Produk terjual
            </span>
          </div>
          <ol>
            {rows.slice(0, 3).map((row, index) => (
              <li key={row.name}>
                <i style={{ background: colors[index] }} />
                {row.name}
                <strong>{row.contribution}%</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Ranking({
  title,
  rows,
  kind = "category",
  rankingMode,
  setRankingMode,
}) {
  const shown = rows.slice(0, 6);
  return (
    <section className="manager-card manager-ranking">
      <header>
        <div>
          <span className="manager-card-icon">♜</span>
          <div>
            <h2>{title}</h2>
            <p>Berdasarkan periode yang dipilih.</p>
          </div>
        </div>
        {setRankingMode && (
          <select
            aria-label="Urutkan produk"
            value={rankingMode}
            onChange={(event) => setRankingMode(event.target.value)}
          >
            <option value="revenue">Revenue</option>
            <option value="quantity">Qty</option>
          </select>
        )}
      </header>
      {shown.length ? (
        <div className="manager-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>
                  {kind === "product"
                    ? "Produk"
                    : kind === "subcategory"
                      ? "Subkategori"
                      : "Kategori"}
                </th>
                {kind !== "category" && <th>Kategori</th>}
                <th>Qty</th>
                <th>Revenue</th>
                <th>Kontribusi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={`${row.id || row.name}:${row.category || ""}`}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  {kind !== "category" && <td>{row.category}</td>}
                  <td>
                    {row.quantity_label ||
                      Number(row.quantity).toLocaleString("id-ID")}
                  </td>
                  <td>{money(row.revenue)}</td>
                  <td>{row.contribution}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="manager-empty">Belum ada data penjualan.</div>
      )}
    </section>
  );
}

function Dashboard({ api, onAddProduct }) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [period, setPeriod] = useState({
    preset: "today",
    from: today,
    to: today,
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rankingMode, setRankingMode] = useState("revenue");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ preset: period.preset });
    if (period.preset === "custom") {
      query.set("from", period.from);
      query.set("to", period.to);
    }
    setLoading(true);
    setError("");
    api(`manager-dashboard?${query}`, undefined, controller.signal)
      .then(setData)
      .catch((caught) => {
        if (caught.name !== "AbortError") setError(caught.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [api, period]);
  const products =
    rankingMode === "quantity"
      ? data?.products_by_quantity || []
      : data?.products || [];
  return (
    <div className="manager-dashboard">
      <div className="manager-page-title">
        <div>
          <span>PUSAT PENGELOLAAN</span>
          <h1>Dashboard Manager</h1>
          <p>
            Pantau penjualan, performa produk, dan operasional bisnis secara
            real-time.
          </p>
        </div>
        <PeriodControls period={period} setPeriod={setPeriod} />
      </div>
      {error && (
        <div className="manager-error" role="alert">
          {error}
        </div>
      )}
      <section className="manager-card manager-sales-summary">
        <header>
          <div>
            <span className="manager-card-icon">▤</span>
            <div>
              <h2>Ringkasan Penjualan</h2>
              <p>Performa bisnis pada periode yang dipilih.</p>
            </div>
          </div>
          <small>
            {loading
              ? "Memuat…"
              : `Diperbarui ${new Date(data?.generated_at || Date.now()).toLocaleString("id-ID")}`}
          </small>
        </header>
        <div className="manager-summary-grid">
          <SummaryCard
            label="Total Pesanan"
            value={data?.summary?.total_orders || 0}
            delta={data?.summary?.comparison?.total_orders}
          />
          <SummaryCard
            label="Revenue"
            value={money(data?.summary?.revenue)}
            delta={data?.summary?.comparison?.revenue}
          />
          <SummaryCard
            label="Qty Terjual"
            value={data?.summary?.quantity || 0}
            delta={data?.summary?.comparison?.quantity}
          />
          <SummaryCard
            label="AOV (Rata-rata)"
            value={money(data?.summary?.aov)}
            delta={data?.summary?.comparison?.aov}
          />
          <SummaryCard
            tone="green"
            label="PAID"
            value={data?.summary?.status?.paid || 0}
          />
          <SummaryCard
            tone="green"
            label="Selesai"
            value={data?.summary?.status?.done || 0}
          />
          <SummaryCard
            tone="amber"
            label="Menunggu"
            value={data?.summary?.status?.waiting || 0}
          />
          <SummaryCard
            tone="amber"
            label="Disiapkan"
            value={data?.summary?.status?.preparing || 0}
          />
          <SummaryCard
            tone="amber"
            label="Siap Antar"
            value={data?.summary?.status?.ready || 0}
          />
          <SummaryCard
            tone="amber"
            label="Dalam Pengantaran"
            value={data?.summary?.status?.delivery || 0}
          />
        </div>
      </section>
      <div className="manager-analytics-grid">
        <SalesTrend rows={data?.trend || []} empty={data?.empty !== false} />
        <CategoryContribution
          rows={data?.categories || []}
          empty={data?.empty !== false}
        />
        <section className="manager-card manager-insights">
          <header>
            <div>
              <span className="manager-card-icon">♢</span>
              <div>
                <h2>Insight</h2>
                <p>Ringkasan deterministik dari data periode ini.</p>
              </div>
            </div>
          </header>
          {data?.insights?.length ? (
            data.insights.map((insight) => <p key={insight}>{insight}</p>)
          ) : (
            <div className="manager-empty">
              Belum cukup data untuk menghasilkan insight periode ini.
            </div>
          )}
        </section>
      </div>
      <div className="manager-rankings-grid">
        <Ranking title="Kategori Terlaris" rows={data?.categories || []} />
        <Ranking
          title="Subkategori Terbaik"
          kind="subcategory"
          rows={data?.subcategories || []}
        />
        <Ranking
          title="Produk Terlaris"
          kind="product"
          rows={products}
          rankingMode={rankingMode}
          setRankingMode={setRankingMode}
        />
      </div>
      <section className="manager-card manager-quick-action">
        <div>
          <h2>Aksi Cepat</h2>
          <p>
            Perubahan produk tersinkron ke Customer, Admin, dan Kitchen sesuai
            kategori.
          </p>
        </div>
        <button className="manager-primary" onClick={onAddProduct}>
          ＋ Tambah Produk
        </button>
      </section>
    </div>
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
      (row.active || Number(row.id) === Number(product?.subcategory_id)),
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

function Products({
  inventory,
  stock,
  busy,
  saveProduct,
  initialAdd,
  clearInitialAdd,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [subcategory, setSubcategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(initialAdd ? "new" : null);
  useEffect(() => {
    if (initialAdd) {
      setEditing("new");
      clearInitialAdd();
    }
  }, [initialAdd, clearInitialAdd]);
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
  const low = inventory.products.filter(
    (row) =>
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
            Kelola seluruh produk secara terpusat. Perubahan langsung digunakan
            Customer, Admin, dan Kitchen sesuai routing kategori.
          </p>
        </div>
        <div className="manager-sync-note">
          <strong>⇄ Sinkronisasi real-time</strong>
          <small>
            Permintaan API baru selalu membaca Product Master terbaru.
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
          {inventory.subcategories?.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <button className="manager-primary" onClick={() => setEditing("new")}>
          ＋ Tambah Produk
        </button>
      </div>
      <div className="manager-product-kpis">
        <SummaryCard label="Total Produk" value={inventory.products.length} />
        <SummaryCard
          label="Produk Aktif"
          value={inventory.products.filter((row) => row.active).length}
          tone="green"
        />
        <SummaryCard
          label="Produk Nonaktif"
          value={inventory.products.filter((row) => !row.active).length}
        />
        <SummaryCard label="Stok Rendah" value={low} tone="amber" />
      </div>
      <div className="manager-product-layout">
        <section className="manager-card manager-product-list">
          <header>
            <div>
              <h2>Daftar Produk</h2>
              <p>{rows.length} produk sesuai filter.</p>
            </div>
          </header>
          <div className="manager-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Kategori</th>
                  <th>Subkategori</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th>Routing</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const currentStock = stockById.get(Number(row.id));
                  return (
                    <tr key={row.id}>
                      <td>
                        <img
                          className="manager-product-thumb"
                          src={row.image_url || "/demo/promo-warkost.webp"}
                          alt=""
                        />
                        <span>
                          <strong>{row.name}</strong>
                          <small>#{String(row.id).padStart(4, "0")}</small>
                        </span>
                      </td>
                      <td>{row.category_name}</td>
                      <td>{row.subcategory_name || "Umum"}</td>
                      <td>{productPriceLabel(row, money)}</td>
                      <td>
                        {formatStockQuantity(
                          currentStock?.available_quantity ??
                            row.stock_quantity,
                          row.stock_unit,
                        )}
                      </td>
                      <td>
                        <span
                          className={`manager-status ${row.active ? "active" : "inactive"}`}
                        >
                          {row.active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td>
                        Customer +{" "}
                        {row.category_name === "Makanan" ? "Kitchen" : "Admin"}
                      </td>
                      <td>
                        <button onClick={() => setEditing(row)}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

function Subcategories({ inventory, busy, mutate }) {
  const [editing, setEditing] = useState(null);
  const submit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutate("subcategory", {
      ...(editing ? { id: editing.id } : {}),
      categoryId: Number(form.get("categoryId")),
      name: form.get("name"),
      sortOrder: Number(form.get("sortOrder")),
      active: editing ? Boolean(editing.active) : true,
    }).then(() => {
      setEditing(null);
      event.currentTarget?.reset?.();
    });
  };
  return (
    <div className="manager-subcategory-page">
      <div className="manager-page-title">
        <div>
          <span>PUSAT PENGELOLAAN</span>
          <h1>Subkategori</h1>
          <p>
            Atur struktur menu tanpa mencampurnya dengan kategori utama
            analytics.
          </p>
        </div>
      </div>
      <div className="manager-two-columns">
        <section className="manager-card">
          <h2>Daftar Subkategori</h2>
          {inventory.subcategories?.map((row) => (
            <div className="manager-subcategory-row" key={row.id}>
              <div>
                <strong>{row.name}</strong>
                <small>
                  {row.category_name} · urutan {row.sort_order} ·{" "}
                  {row.active ? "Aktif" : "Nonaktif"}
                </small>
              </div>
              <div>
                <button onClick={() => setEditing(row)}>Edit</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    mutate("subcategory", {
                      id: row.id,
                      categoryId: row.category_id,
                      name: row.name,
                      sortOrder: row.sort_order,
                      active: !row.active,
                    })
                  }
                >
                  {row.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </div>
          ))}
        </section>
        <form
          className="manager-card manager-subcategory-form"
          onSubmit={submit}
          key={editing?.id || "new"}
        >
          <h2>{editing ? "Edit" : "Tambah"} Subkategori</h2>
          <label>
            Kategori utama
            <select
              name="categoryId"
              defaultValue={editing?.category_id || inventory.categories[0]?.id}
            >
              {inventory.categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nama
            <input
              name="name"
              required
              minLength="2"
              defaultValue={editing?.name || ""}
            />
          </label>
          <label>
            Urutan
            <input
              name="sortOrder"
              type="number"
              min="0"
              max="9999"
              defaultValue={editing?.sort_order || 10}
            />
          </label>
          <button className="manager-primary" disabled={busy}>
            Simpan Subkategori
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Batal
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Stock({ stock, busy, mutate }) {
  const [filter, setFilter] = useState("all");
  const products = stock.products.filter(
    (row) => filter === "all" || row.category_name === filter,
  );
  return (
    <div className="manager-stock-page">
      <div className="manager-page-title">
        <div>
          <span>PUSAT PENGELOLAAN</span>
          <h1>Kontrol Stok</h1>
          <p>
            Gunakan ledger stok terpadu; setiap penyesuaian memerlukan alasan.
          </p>
        </div>
      </div>
      <div className="manager-stock-tabs">
        {["all", "Makanan", "Minuman", "Bahan Baku"].map((name) => (
          <button
            key={name}
            className={filter === name ? "active" : ""}
            onClick={() => setFilter(name)}
          >
            {name === "all" ? "Semua" : name}
          </button>
        ))}
      </div>
      <section className="manager-card manager-stock-list">
        {products.map((row) => (
          <form
            key={row.id}
            className="manager-stock-row"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              mutate("stock", {
                productId: row.id,
                quantity: Number(form.get("quantity")),
                reason: form.get("reason"),
              });
            }}
          >
            <div>
              <strong>{row.name}</strong>
              <small>
                {row.category_name} · {row.subcategory_name || "Umum"}
              </small>
            </div>
            <dl>
              <div>
                <dt>Current</dt>
                <dd>
                  {formatStockQuantity(row.stock_quantity, row.stock_unit)}
                </dd>
              </div>
              <div>
                <dt>Reserved</dt>
                <dd>
                  {formatStockQuantity(row.reserved_quantity, row.stock_unit)}
                </dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>
                  {formatStockQuantity(row.available_quantity, row.stock_unit)}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span
                    className={`manager-status ${row.stock_status === "OK" ? "active" : "warning"}`}
                  >
                    {row.stock_status}
                  </span>
                </dd>
              </div>
            </dl>
            <input
              name="quantity"
              type="number"
              step={row.order_step_quantity || 1}
              placeholder="+ / − qty"
              required
            />
            <input
              name="reason"
              minLength="3"
              maxLength="240"
              placeholder="Alasan penyesuaian"
              required
            />
            <button className="manager-primary" disabled={busy}>
              Simpan
            </button>
          </form>
        ))}
      </section>
    </div>
  );
}

export default function ManagerControlCenter({
  view,
  setView,
  api,
  inventory,
  stock,
  busy,
  run,
  saveProduct,
  promotions,
  refresh,
  logout,
}) {
  const [initialAdd, setInitialAdd] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mutate = (action, body) =>
    new Promise((resolve) =>
      run(async () => {
        await api(action, body);
        resolve();
      }),
    );
  return (
    <div className="manager-control-center">
      {view === "manager-dashboard" && (
        <Dashboard
          api={api}
          onAddProduct={() => {
            setInitialAdd(true);
            setView("products");
          }}
        />
      )}
      {view === "products" && (
        <Products
          inventory={inventory}
          stock={stock}
          busy={busy}
          saveProduct={saveProduct}
          initialAdd={initialAdd}
          clearInitialAdd={() => setInitialAdd(false)}
        />
      )}
      {view === "subcategories" && (
        <Subcategories inventory={inventory} busy={busy} mutate={mutate} />
      )}
      {view === "stock" && <Stock stock={stock} busy={busy} mutate={mutate} />}
      {view === "promotions" && (
        <ManagerPromotionCenter
          promotions={promotions}
          inventory={inventory}
          api={api}
          onChanged={refresh}
        />
      )}
      {moreOpen && (
        <div className="manager-more-menu">
          <button
            onClick={() => {
              setView("subcategories");
              setMoreOpen(false);
            }}
          >
            Subkategori
          </button>
          <button
            onClick={() => {
              setView("notifications");
              setMoreOpen(false);
            }}
          >
            Notifikasi
          </button>
          <button onClick={logout}>Keluar</button>
        </div>
      )}
      <nav className="manager-mobile-nav" aria-label="Navigasi Manager mobile">
        <button
          className={view === "manager-dashboard" ? "active" : ""}
          onClick={() => setView("manager-dashboard")}
        >
          ⌂<span>Dashboard</span>
        </button>
        <button
          className={view === "products" ? "active" : ""}
          onClick={() => setView("products")}
        >
          ♜<span>Produk &amp; Menu</span>
        </button>
        <button
          className={view === "stock" ? "active" : ""}
          onClick={() => setView("stock")}
        >
          ◇<span>Stok</span>
        </button>
        <button
          className={view === "promotions" ? "active" : ""}
          onClick={() => setView("promotions")}
        >
          ⌑<span>Promo</span>
        </button>
        <button
          className={
            ["subcategories", "notifications"].includes(view) ? "active" : ""
          }
          onClick={() => setMoreOpen((open) => !open)}
        >
          •••<span>Lainnya</span>
        </button>
      </nav>
    </div>
  );
}
