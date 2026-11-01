"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const number = (value) => Number(value || 0);
const pct = (value) => `${number(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

const statusLabel = (status) =>
  ({
    ACTIVE: "AKTIF",
    SCHEDULED: "TERJADWAL",
    EXPIRED: "BERAKHIR",
    INACTIVE: "NONAKTIF",
  })[status] || status;

const familyLabel = (value) =>
  ({
    PERCENT_ITEM: "Diskon Item",
    FIXED: "Potongan Harga",
    FREE_ITEM: "Gratis Item",
    FIRST_MEMBER: "Member Pertama",
    SCHEDULED: "Campaign Waktu",
    BIRTHDAY: "Ulang Tahun",
  })[value] || "Promo";

const dateLabel = (value) => {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const periodLabel = (period) => {
  if (!period?.from) return "—";
  return period.from === period.to
    ? dateLabel(period.from)
    : `${dateLabel(period.from)} – ${dateLabel(period.to)}`;
};

function ownerSignature() {
  return Boolean(
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ),
  );
}

function Insight({ item }) {
  return (
    <article className={`opr-insight ${item.type || "neutral"}`}>
      <span aria-hidden="true">
        {item.type === "positive" ? "✓" : item.type === "warning" ? "!" : "•"}
      </span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.text}</p>
      </div>
    </article>
  );
}

export default function OwnerPromotionReport() {
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [queryText, setQueryText] = useState("");

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[data-owner-promo-legacy="true"]')
        .forEach((node) => {
          node.hidden = false;
          delete node.dataset.ownerPromoLegacy;
        });
      document.getElementById("owner-promotion-report-host")?.remove();
      document.body.classList.remove("owner-promotion-report-active");
      setHost(null);
      setVisible(false);
    };

    const sync = () => {
      const legacy = document.querySelector(".manager-promo-center");
      if (!legacy || !ownerSignature()) {
        if (!legacy) cleanup();
        return;
      }

      legacy.dataset.ownerPromoLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-promotion-report-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-promotion-report-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      document.body.classList.add("owner-promotion-report-active");
      setHost(target);
      setVisible(true);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ preset });
    if (preset === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    return params.toString();
  }, [preset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!visible) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setError("Pilih rentang tanggal custom yang valid.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/owner-promotion-report?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Gagal memuat performa promo");
      setData(result);
      if (result.period?.from && !customFrom) setCustomFrom(result.period.from);
      if (result.period?.to && !customTo) setCustomTo(result.period.to);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [visible, preset, customFrom, customTo, query]);

  useEffect(() => {
    if (visible) load();
  }, [visible, query]);

  const rows = useMemo(() => {
    const source = data?.promotions || [];
    return source.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const haystack = `${row.title} ${row.description} ${familyLabel(row.promotion_family)}`.toLowerCase();
      return matchesStatus && haystack.includes(queryText.toLowerCase());
    });
  }, [data, statusFilter, queryText]);

  if (!host || !visible) return null;

  const summary = data?.summary || {};
  const content = (
    <section className="owner-promotion-report" aria-label="Performa promo Owner">
      <header className="opr-hero">
        <div>
          <span>OWNER COMMERCIAL OVERSIGHT</span>
          <h1>Promo Performance</h1>
          <p>Pantau apakah campaign benar-benar digunakan dan menghasilkan transaksi, tanpa mengubah rule yang dikelola Manager.</p>
        </div>
        <div className="opr-hero-actions">
          <span className="opr-readonly">READ ONLY · OWNER</span>
          <button type="button" onClick={load} disabled={loading}>↻ {loading ? "Memuat…" : "Perbarui"}</button>
        </div>
      </header>

      <div className="opr-filterbar">
        <div className="opr-presets">
          {[["today", "Hari Ini"], ["7d", "7 Hari"], ["month", "Bulan Ini"], ["custom", "Custom"]].map(([key, label]) => (
            <button key={key} type="button" className={preset === key ? "active" : ""} onClick={() => setPreset(key)}>{label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="opr-custom-range">
            <label>Dari <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
            <label>Sampai <input type="date" min={customFrom} value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          </div>
        )}
        <strong>{periodLabel(data?.period)}</strong>
      </div>

      {error && <div className="opr-feedback error">{error}</div>}
      {loading && !data && <div className="opr-feedback">Menyusun performa promo…</div>}

      {data && (
        <>
          <section className="opr-kpis">
            <article><span>Promo Aktif</span><strong>{number(summary.active)}</strong><small>{number(summary.ending_soon)} segera berakhir</small></article>
            <article><span>Order Pakai Promo</span><strong>{number(summary.paid_orders)}</strong><small>{number(summary.unique_customers)} customer unik</small></article>
            <article><span>Revenue Promo</span><strong>{money(summary.promo_revenue)}</strong><small>{pct(summary.promo_revenue_contribution)} dari paid revenue</small></article>
            <article><span>Nilai Diskon</span><strong>{money(summary.promo_discount)}</strong><small>{pct(summary.discount_to_promo_revenue)} dari revenue promo</small></article>
            <article><span>AOV Promo</span><strong>{money(summary.promo_aov)}</strong><small>rata-rata order promo</small></article>
            <article className={number(summary.active_unused) ? "attention" : ""}><span>Aktif Belum Dipakai</span><strong>{number(summary.active_unused)}</strong><small>perlu evaluasi exposure/offer</small></article>
          </section>

          <section className="opr-section">
            <div className="opr-section-head">
              <div><span>CAMPAIGN HEALTH</span><h2>Kondisi program promo</h2></div>
              <small>Manager tetap menjadi pemilik perubahan rule promo.</small>
            </div>
            <div className="opr-status-grid">
              <article><b>{number(summary.active)}</b><span>Aktif</span></article>
              <article><b>{number(summary.scheduled)}</b><span>Terjadwal</span></article>
              <article className={number(summary.ending_soon) ? "warn" : ""}><b>{number(summary.ending_soon)}</b><span>≤ 3 hari lagi</span></article>
              <article><b>{number(summary.inactive_or_expired)}</b><span>Nonaktif / berakhir</span></article>
            </div>
          </section>

          <section className="opr-section">
            <div className="opr-section-head">
              <div><span>TOP CAMPAIGN</span><h2>Promo yang paling menghasilkan</h2></div>
              <small>Revenue teratribusi ≠ laba bersih.</small>
            </div>
            <div className="opr-top-grid">
              {(data.top?.revenue || []).length ? data.top.revenue.map((row, index) => (
                <article key={row.id}>
                  <span>#{index + 1} · {statusLabel(row.status)}</span>
                  <strong>{row.title}</strong>
                  <b>{money(row.period_revenue)}</b>
                  <small>{row.period_paid_orders} order · diskon {money(row.period_discount)}</small>
                </article>
              )) : <div className="opr-empty">Belum ada transaksi promo pada periode ini.</div>}
            </div>
          </section>

          <section className="opr-section">
            <div className="opr-section-head">
              <div><span>CAMPAIGN DETAIL</span><h2>Performa setiap promo</h2></div>
              <small>Gunakan data ini untuk evaluasi bersama Manager.</small>
            </div>
            <div className="opr-toolbar">
              <input aria-label="Cari promo Owner" placeholder="Cari promo…" value={queryText} onChange={(event) => setQueryText(event.target.value)} />
              <select aria-label="Filter status promo Owner" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Semua status</option>
                <option value="ACTIVE">Aktif</option>
                <option value="SCHEDULED">Terjadwal</option>
                <option value="EXPIRED">Berakhir</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
            </div>
            <div className="opr-table-wrap">
              <table>
                <thead><tr><th>Promo</th><th>Status</th><th>Benefit</th><th>Order Paid</th><th>Revenue</th><th>Diskon</th><th>Customer</th><th>Kuota</th><th>Evaluasi</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.title}</strong><small>{familyLabel(row.promotion_family)} · {dateLabel(row.starts_at)}–{dateLabel(row.ends_at)}</small></td>
                      <td><span className={`opr-status ${row.status.toLowerCase()}`}>{row.ending_soon ? "SEGERA BERAKHIR" : statusLabel(row.status)}</span></td>
                      <td><strong>{row.benefit_label}</strong><small>min. {money(row.minimum_order)}</small></td>
                      <td>{row.period_paid_orders}</td>
                      <td><strong>{money(row.period_revenue)}</strong><small>AOV {money(row.period_aov)}</small></td>
                      <td><strong>{money(row.period_discount)}</strong><small>{pct(row.discount_to_revenue)} / revenue</small></td>
                      <td>{row.period_unique_customers}</td>
                      <td>{row.quota === null ? <span>Tanpa kuota</span> : <><strong>{row.lifetime_used}/{row.quota}</strong><small>{pct(row.quota_usage)}</small></>}</td>
                      <td><span className={`opr-performance ${row.performance === "TERPAKAI" ? "good" : row.status === "ACTIVE" ? "warn" : "neutral"}`}>{row.performance}</span></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan="9" className="opr-empty-cell">Belum ada promo sesuai filter.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="opr-section">
            <div className="opr-section-head"><div><span>OWNER INSIGHTS</span><h2>Apa yang perlu diperhatikan?</h2></div></div>
            <div className="opr-insights">{(data.insights || []).map((item, index) => <Insight key={`${item.title}-${index}`} item={item} />)}</div>
            <p className="opr-note"><strong>Catatan:</strong> {data.note}</p>
          </section>
        </>
      )}
    </section>
  );

  return createPortal(content, host);
}
