"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const number = (value) => Number(value || 0);

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const periodLabel = (period) => {
  if (!period?.from) return "—";
  if (period.from === period.to) return dateLabel(period.from);
  return `${dateLabel(period.from)} – ${dateLabel(period.to)}`;
};

const pct = (value) => `${Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

const methodLabel = (method) => {
  const value = String(method || "").toUpperCase();
  if (["CASH", "COD", "CASH_ON_DELIVERY"].includes(value)) return "COD / Tunai";
  if (value === "QRIS") return "QRIS";
  if (["TRANSFER", "BANK_TRANSFER", "BANK TRANSFER"].includes(value)) return "Transfer Bank";
  if (["VIRTUAL_ACCOUNT", "VA"].includes(value)) return "Virtual Account";
  return value.replaceAll("_", " ") || "Lainnya";
};

const duration = (minutes) => {
  const total = Math.round(number(minutes));
  if (total < 60) return `${total} mnt`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `${hours}j ${rest}m`;
};

function Growth({ value }) {
  const growth = number(value);
  const direction = growth > 0 ? "up" : growth < 0 ? "down" : "flat";
  return (
    <span className={`obr-growth ${direction}`}>
      {growth > 0 ? "↑" : growth < 0 ? "↓" : "→"} {Math.abs(growth)}%
    </span>
  );
}

function EmptyRow({ colSpan, text = "Belum ada data pada periode ini." }) {
  return (
    <tr>
      <td colSpan={colSpan} className="obr-empty-cell">{text}</td>
    </tr>
  );
}

function RankBars({ rows, valueKey = "revenue", moneyValue = true, limit = 6 }) {
  const visible = (rows || []).slice(0, limit);
  const max = Math.max(1, ...visible.map((row) => number(row[valueKey])));
  if (!visible.length) return <div className="obr-empty-block">Belum ada data penjualan.</div>;
  return (
    <div className="obr-rank-list">
      {visible.map((row, index) => (
        <div className="obr-rank-row" key={`${row.id || row.name}-${index}`}>
          <span className="obr-rank-number">{index + 1}</span>
          <div className="obr-rank-main">
            <div className="obr-rank-copy">
              <strong>{row.name}</strong>
              <small>{row.category && row.category !== row.name ? row.category : row.subcategory || ""}</small>
            </div>
            <div className="obr-rank-track"><span style={{ width: `${Math.max(4, (number(row[valueKey]) / max) * 100)}%` }} /></div>
          </div>
          <div className="obr-rank-value">
            <strong>{moneyValue ? money(row[valueKey]) : row.quantity_label || number(row[valueKey]).toLocaleString("id-ID")}</strong>
            {row.contribution !== undefined && <small>{pct(row.contribution)} kontribusi</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OwnerBusinessReport() {
  const [host, setHost] = useState(null);
  const [owner, setOwner] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [teamTab, setTeamTab] = useState("manager");

  useEffect(() => {
    const cleanupLegacy = () => {
      document.querySelectorAll('[data-owner-report-legacy-v2="true"]').forEach((node) => {
        node.hidden = false;
        delete node.dataset.ownerReportLegacyV2;
      });
    };

    const sync = () => {
      const main = document.querySelector("main");
      const heading = main?.querySelector(".heading h1");
      const onReport = heading?.textContent?.trim() === "Laporan harian";
      setVisible(Boolean(onReport));

      if (!onReport || !main) {
        cleanupLegacy();
        document.body.classList.remove("owner-business-report-v2-active");
        document.getElementById("owner-business-report-host")?.remove();
        setHost(null);
        return;
      }

      let target = document.getElementById("owner-business-report-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-business-report-host";
        main.querySelector(".heading")?.insertAdjacentElement("afterend", target);
      }

      [...main.children].forEach((node) => {
        if (!node.classList?.contains("panel")) return;
        const title = node.querySelector("h2")?.textContent?.trim();
        if (title !== "Ringkasan operasional") return;
        node.dataset.ownerReportLegacyV2 = "true";
        node.hidden = true;
      });

      document.body.classList.add("owner-business-report-v2-active");
      setHost(target);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupLegacy();
      document.body.classList.remove("owner-business-report-v2-active");
      document.getElementById("owner-business-report-host")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setOwner(null);
      return;
    }
    let alive = true;
    fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((result) => alive && setOwner(result.user?.role === "OWNER" ? result.user : null))
      .catch(() => alive && setOwner(null));
    return () => { alive = false; };
  }, [visible]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ preset });
    if (preset === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    return params.toString();
  }, [preset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!visible || !owner) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setError("Pilih rentang tanggal custom yang valid.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/owner-business-report?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Gagal memuat laporan Owner");
      setData(result);
      if (result.period?.from && !customFrom) setCustomFrom(result.period.from);
      if (result.period?.to && !customTo) setCustomTo(result.period.to);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [visible, owner, preset, customFrom, customTo, query]);

  useEffect(() => {
    if (!visible || !owner) return;
    load();
    window.addEventListener("warkost:realtime-recovered", load);
    return () =>
      window.removeEventListener("warkost:realtime-recovered", load);
  }, [visible, owner?.id, query, load]);

  if (!host || !visible || !owner) return null;

  const summary = data?.summary || {};
  const finance = data?.finance || {};
  const merchandise = data?.merchandise || {};
  const team = data?.team || {};
  const health = data?.health || { score: 0, status: "MEMUAT", signals: [] };

  const content = (
    <section className="owner-business-report" aria-label="Laporan bisnis Owner">
      <header className="obr-hero">
        <div className="obr-hero-copy">
          <span>OWNER BUSINESS PERFORMANCE</span>
          <h2>Laporan Bisnis</h2>
          <p>Ringkasan penjualan, keuangan, produk, operasional, dan kinerja tim untuk membantu Owner mengambil keputusan.</p>
        </div>
        <button type="button" className="obr-refresh" onClick={load} disabled={loading}>
          <span aria-hidden="true">↻</span>{loading ? "Memuat..." : "Perbarui"}
        </button>
      </header>

      <div className="obr-filterbar">
        <div className="obr-presets" aria-label="Filter periode laporan">
          {[
            ["today", "Hari Ini"],
            ["yesterday", "Kemarin"],
            ["7d", "7 Hari"],
            ["month", "Bulan Ini"],
            ["custom", "Custom"],
          ].map(([key, label]) => (
            <button type="button" key={key} className={preset === key ? "active" : ""} onClick={() => setPreset(key)}>{label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="obr-custom-range">
            <label><span>Dari</span><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
            <label><span>Sampai</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></label>
          </div>
        )}
        <strong className="obr-period-label">{periodLabel(data?.period)}</strong>
      </div>

      {error && <div className="obr-feedback error">{error}</div>}
      {loading && !data && <div className="obr-loading">Menyusun laporan bisnis…</div>}

      {data && (
        <>
          <section className={`obr-health ${String(health.status).toLowerCase().replaceAll(" ", "-")}`}>
            <div className="obr-health-score">
              <span>BUSINESS HEALTH</span>
              <strong>{health.score}</strong>
              <em>/100</em>
            </div>
            <div className="obr-health-main">
              <small>Kondisi bisnis periode ini</small>
              <h3>{health.status}</h3>
              <p>{health.note}</p>
            </div>
            <div className="obr-health-signals">
              {(health.signals || []).slice(0, 4).map((signal, index) => (
                <div className={signal.level || "info"} key={`${signal.text}-${index}`}>
                  <span aria-hidden="true">{signal.level === "good" ? "✓" : signal.level === "danger" ? "!" : "•"}</span>
                  {signal.text}
                </div>
              ))}
            </div>
          </section>

          <section className="obr-section">
            <div className="obr-section-head">
              <div><span>SALES PERFORMANCE</span><h3>Apakah bisnis bertumbuh?</h3></div>
              <small>vs periode sebelumnya dengan durasi yang sama</small>
            </div>
            <div className="obr-kpis">
              <article><small>Revenue</small><strong>{money(summary.revenue)}</strong><Growth value={summary.comparison?.revenue} /></article>
              <article><small>Order</small><strong>{number(summary.orders).toLocaleString("id-ID")}</strong><Growth value={summary.comparison?.orders} /></article>
              <article><small>Quantity</small><strong>{number(summary.quantity).toLocaleString("id-ID")}</strong><Growth value={summary.comparison?.quantity} /></article>
              <article><small>AOV</small><strong>{money(summary.aov)}</strong><Growth value={summary.comparison?.aov} /></article>
              <article><small>Order Selesai</small><strong>{number(summary.delivered_orders).toLocaleString("id-ID")}</strong><em>{pct(summary.delivery_completion_rate)} delivery completion</em></article>
              <article className={number(summary.cancel_rate) > 5 ? "attention" : ""}><small>Cancellation</small><strong>{pct(summary.cancel_rate)}</strong><em>{number(summary.cancelled_orders)} order dibatalkan</em></article>
            </div>
          </section>

          <section className="obr-section obr-finance-section">
            <div className="obr-section-head">
              <div><span>FINANCIAL CONTROL</span><h3>Revenue & aliran kas</h3></div>
              <small>Revenue ≠ laba bersih</small>
            </div>
            <div className="obr-finance-summary">
              <article><span>Revenue Terverifikasi</span><strong>{money(finance.revenue)}</strong><small>{number(finance.paid_transactions)} transaksi paid</small></article>
              <article><span>Payment Success</span><strong>{pct(summary.payment_success_rate)}</strong><small>Pembayaran order pada periode</small></article>
              <article className={number(finance.cod_outstanding_current?.amount) ? "attention" : ""}><span>COD Belum Final Saat Ini</span><strong>{money(finance.cod_outstanding_current?.amount)}</strong><small>{number(finance.cod_outstanding_current?.count)} transaksi</small></article>
              <article className={number(finance.owner_pending_current?.amount) ? "attention" : ""}><span>Setoran Menunggu Owner</span><strong>{money(finance.owner_pending_current?.amount)}</strong><small>{number(finance.owner_pending_current?.count)} setoran pending</small></article>
            </div>

            <div className="obr-two-columns">
              <article className="obr-card">
                <div className="obr-card-head"><div><span>METODE PEMBAYARAN</span><h4>Komposisi penerimaan</h4></div></div>
                <div className="obr-payment-list">
                  {(finance.payment_methods || []).length ? finance.payment_methods.map((row) => (
                    <div key={row.method}><div><strong>{methodLabel(row.method)}</strong><small>{number(row.transactions)} transaksi</small></div><b>{money(row.amount)}</b></div>
                  )) : <div className="obr-empty-block">Belum ada pembayaran terverifikasi.</div>}
                </div>
              </article>

              <article className="obr-card">
                <div className="obr-card-head"><div><span>CASH ACCOUNTABILITY</span><h4>Jejak Admin → Manager → Owner</h4></div></div>
                <div className="obr-cash-flow">
                  <div><span>Admin setor</span><strong>{money(finance.admin_to_manager?.submitted_amount)}</strong><small>{number(finance.admin_to_manager?.count)} settlement</small></div>
                  <b>→</b>
                  <div><span>Manager terverifikasi</span><strong>{money(finance.admin_to_manager?.verified_amount)}</strong><small>{number(finance.admin_to_manager?.pending_count)} pending</small></div>
                  <b>→</b>
                  <div><span>Owner terima</span><strong>{money(finance.manager_to_owner?.verified_amount)}</strong><small>{number(finance.manager_to_owner?.pending_count)} pending · {number(finance.manager_to_owner?.rejected_count)} reject</small></div>
                </div>
              </article>
            </div>
            <div className="obr-accounting-note"><strong>Catatan keuangan:</strong> {finance.accounting_note}</div>
          </section>

          <section className="obr-section">
            <div className="obr-section-head">
              <div><span>MENU PERFORMANCE</span><h3>Apa yang paling laku?</h3></div>
              <small>berdasarkan order paid & tidak dibatalkan</small>
            </div>
            <div className="obr-two-columns">
              <article className="obr-card">
                <div className="obr-card-head"><div><span>KATEGORI</span><h4>Best category by revenue</h4></div></div>
                <RankBars rows={merchandise.categories} />
              </article>
              <article className="obr-card">
                <div className="obr-card-head"><div><span>SUBKATEGORI</span><h4>Best subcategory by revenue</h4></div></div>
                <RankBars rows={merchandise.subcategories} />
              </article>
            </div>
            <div className="obr-two-columns">
              <article className="obr-card">
                <div className="obr-card-head"><div><span>BEST SELLER</span><h4>Produk terbaik by revenue</h4></div></div>
                <RankBars rows={merchandise.products} />
              </article>
              <article className="obr-card">
                <div className="obr-card-head"><div><span>BEST QUANTITY</span><h4>Produk paling banyak terjual</h4></div></div>
                <RankBars rows={merchandise.products_by_quantity} valueKey="quantity" moneyValue={false} />
              </article>
            </div>
            <article className="obr-card obr-unsold-card">
              <div className="obr-card-head"><div><span>PERLU DORONGAN</span><h4>Produk aktif tanpa penjualan pada periode</h4></div><small>Bukan berarti produk buruk; gunakan sebagai daftar evaluasi.</small></div>
              <div className="obr-chip-list">
                {(merchandise.unsold_products || []).length ? merchandise.unsold_products.map((row) => (
                  <span key={row.id}><strong>{row.name}</strong><small>{row.category}{row.subcategory ? ` · ${row.subcategory}` : ""} · stok {number(row.stock_quantity).toLocaleString("id-ID")} {row.stock_unit}</small></span>
                )) : <div className="obr-empty-block">Semua produk aktif memiliki penjualan pada periode ini.</div>}
              </div>
            </article>
          </section>

          <section className="obr-section obr-team-section">
            <div className="obr-section-head">
              <div><span>TEAM PERFORMANCE</span><h3>Kinerja operasional tim</h3></div>
              <small>berbasis aktivitas sistem, bukan penilaian subjektif</small>
            </div>
            <div className="obr-team-tabs">
              {[ ["manager", "Manager"], ["admin", "Admin"], ["driver", "Driver"] ].map(([key, label]) => (
                <button key={key} type="button" className={teamTab === key ? "active" : ""} onClick={() => setTeamTab(key)}>{label}</button>
              ))}
            </div>

            {teamTab === "manager" && (
              <div className="obr-table-wrap"><table><thead><tr><th>Manager</th><th>Settlement Admin Diverifikasi</th><th>Kas Diverifikasi</th><th>Setor ke Owner</th><th>Pending</th><th>Reject</th></tr></thead><tbody>
                {(team.managers || []).length ? team.managers.map((row) => (
                  <tr key={row.id}><td><strong>{row.name}</strong><small>{row.active ? "Aktif" : "Nonaktif"}</small></td><td>{row.admin_settlements_verified}</td><td>{money(row.admin_cash_verified)}</td><td>{money(row.owner_cash_submitted)}<small>{row.owner_verified_count} verified</small></td><td className={row.owner_pending_count ? "warn" : ""}>{row.owner_pending_count}</td><td className={row.owner_rejected_count ? "bad" : ""}>{row.owner_rejected_count}</td></tr>
                )) : <EmptyRow colSpan={6} />}
              </tbody></table></div>
            )}

            {teamTab === "admin" && (
              <div className="obr-table-wrap"><table><thead><tr><th>Operator Admin</th><th>Shift</th><th>Durasi Shift</th><th>COD Diterima</th><th>Nominal COD</th><th>Setoran</th><th>Pending</th></tr></thead><tbody>
                {(team.admins || []).length ? team.admins.map((row) => (
                  <tr key={row.id}><td><strong>{row.name}</strong><small>{row.active ? "Aktif" : "Nonaktif"}</small></td><td>{row.shifts}</td><td>{duration(row.minutes_worked)}</td><td>{row.cod_receipts}</td><td>{money(row.cod_received)}{row.cash_overage > 0 && <small className="warn">Selisih lebih {money(row.cash_overage)}</small>}</td><td>{money(row.settlement_amount)}<small>{row.verified_count} verified</small></td><td className={row.pending_count ? "warn" : ""}>{row.pending_count}</td></tr>
                )) : <EmptyRow colSpan={7} />}
              </tbody></table></div>
            )}

            {teamTab === "driver" && (
              <div className="obr-table-wrap"><table><thead><tr><th>Driver</th><th>Tugas</th><th>Selesai</th><th>Completion</th><th>Avg Delivery</th><th>COD Dibawa</th><th>COD Verified</th></tr></thead><tbody>
                {(team.drivers || []).length ? team.drivers.map((row) => (
                  <tr key={row.id}><td><strong>{row.name}</strong><small>{row.active ? "Aktif" : "Nonaktif"}</small></td><td>{row.assignments}</td><td>{row.delivered}</td><td className={row.completion_rate < 80 && row.assignments >= 3 ? "warn" : ""}>{pct(row.completion_rate)}</td><td>{duration(row.avg_delivery_minutes)}</td><td>{money(row.cod_carried)}</td><td>{money(row.cod_verified)}</td></tr>
                )) : <EmptyRow colSpan={7} />}
              </tbody></table></div>
            )}
          </section>

          <section className="obr-section obr-insights-section">
            <div className="obr-section-head"><div><span>OWNER INSIGHTS</span><h3>Apa yang harus diperhatikan?</h3></div></div>
            <div className="obr-insight-grid">
              {(data.insights || []).length ? data.insights.map((item, index) => (
                <article className={item.type || "info"} key={`${item.title}-${index}`}><span>{item.type === "positive" ? "✓" : item.type === "warning" ? "!" : "i"}</span><div><strong>{item.title}</strong><p>{item.text}</p></div></article>
              )) : <div className="obr-empty-block">Belum ada insight karena data periode ini masih kosong.</div>}
            </div>
          </section>
        </>
      )}
    </section>
  );

  return createPortal(content, host);
}
