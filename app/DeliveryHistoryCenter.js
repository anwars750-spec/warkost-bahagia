"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./DeliveryHistoryCenter.module.css";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const code = (id) => `WB${String(id).padStart(6, "0")}`;

function dateTime(value) {
  if (!value) return "-";
  const text = String(value);
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(text)
    ? text
    : `${text.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const statusLabel = (value) =>
  ({
    PENDING: "Menunggu",
    CONFIRMED: "Dikonfirmasi",
    PREPARING: "Disiapkan",
    READY: "Siap antar",
    ASSIGNED: "Driver ditugaskan",
    PICKED_UP: "Diambil driver",
    ON_DELIVERY: "Dalam perjalanan",
    DELIVERED: "Selesai",
    CANCELLED: "Dibatalkan",
  })[value] || String(value || "").replaceAll("_", " ");

const paymentLabel = (value) =>
  ({ CASH: "COD", QRIS: "QRIS", TRANSFER: "Transfer" })[value] || value || "-";

async function loadHistory(before = null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const response = await fetch(`/api/delivery-history${query}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal memuat riwayat delivery");
  return data;
}

export default function DeliveryHistoryCenter({ onClose = null }) {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await loadHistory();
      setRows(result.deliveries || []);
      setCursor(result.nextCursor || null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [code(row.order_id), row.customer_name, row.driver_name, row.address, row.method]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search]);

  async function more() {
    if (!cursor) return;
    try {
      const result = await loadHistory(cursor);
      setRows((current) => [...current, ...(result.deliveries || [])]);
      setCursor(result.nextCursor || null);
    } catch (caught) {
      setError(caught.message);
    }
  }

  const withProof = rows.filter((row) => row.proof_image_url).length;

  return (
    <section className={styles.center} aria-label="Riwayat Delivery">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span>OPERASIONAL DELIVERY</span>
          <h1>Riwayat Delivery</h1>
          <p>Riwayat pengantaran selesai, bukti foto, pembayaran, dan timeline order.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={refresh} disabled={loading}>
            {loading ? "Memuat..." : "Perbarui"}
          </button>
          {onClose && (
            <button type="button" onClick={onClose}>Tutup</button>
          )}
        </div>
      </header>

      <div className={styles.summaryBar}>
        <div><span>Delivery selesai</span><strong>{rows.length}</strong></div>
        <i />
        <div><span>Dengan bukti</span><strong>{withProof}</strong></div>
        <i />
        <div><span>Histori lama</span><strong>{rows.length - withProof}</strong></div>
      </div>

      <label className={styles.searchWrap}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nomor order, customer, Driver, atau alamat"
        />
      </label>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.listHeader} aria-hidden="true">
        <span>Order</span><span>Driver</span><span>Selesai</span><span>Pembayaran</span><span>Bukti</span><span />
      </div>

      <div className={styles.historyList}>
        {visibleRows.map((row) => (
          <button key={row.order_id} type="button" className={styles.historyRow} onClick={() => setSelected(row)}>
            <span className={styles.orderCell}>
              <i />
              <span><strong>{code(row.order_id)}</strong><small>{row.customer_name || "-"}</small></span>
            </span>
            <span className={styles.cell}><strong>{row.driver_name || "-"}</strong><small>{row.address || "-"}</small></span>
            <span className={styles.cell}><strong>{dateTime(row.delivered_at)}</strong><small>Status selesai</small></span>
            <span className={styles.cell}><strong>{money(row.payment_amount ?? row.total)}</strong><small>{paymentLabel(row.method)} · {row.payment_status || "-"}</small></span>
            <span className={`${styles.proofBadge} ${row.proof_image_url ? styles.proofReady : styles.proofLegacy}`}>
              {row.proof_image_url ? "Ada bukti" : "Histori lama"}
            </span>
            <span className={styles.rowArrow} aria-hidden="true">→</span>
          </button>
        ))}
      </div>

      {!loading && !visibleRows.length && <div className={styles.empty}>Belum ada delivery selesai.</div>}
      {cursor && !search && <button className={styles.more} type="button" onClick={more}>Muat riwayat sebelumnya</button>}

      {selected && (
        <div className={styles.detailBackdrop} onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className={styles.detailDialog} role="dialog" aria-modal="true">
            <header className={styles.detailHeader}>
              <div><span>DETAIL DELIVERY</span><h2>{code(selected.order_id)}</h2><p>{selected.customer_name || "-"}</p></div>
              <button type="button" aria-label="Tutup detail delivery" onClick={() => setSelected(null)}>×</button>
            </header>

            <div className={styles.detailMeta}>
              <div><span>Driver</span><strong>{selected.driver_name || "-"}</strong></div>
              <div><span>Selesai</span><strong>{dateTime(selected.delivered_at)}</strong></div>
              <div><span>Pembayaran</span><strong>{paymentLabel(selected.method)} · {selected.payment_status || "-"}</strong></div>
              <div><span>Nilai order</span><strong>{money(selected.payment_amount ?? selected.total)}</strong></div>
              <div className={styles.addressMeta}><span>Alamat pengantaran</span><strong>{selected.address || "-"}</strong></div>
            </div>

            <div className={styles.detailContent}>
              <section className={styles.proofSection}>
                <div className={styles.sectionTitle}><span>BUKTI PENGANTARAN</span><small>{selected.proof_image_url ? "Tersimpan" : "Histori lama"}</small></div>
                {selected.proof_image_url ? (
                  <img src={selected.proof_image_url} alt="Bukti pengantaran" />
                ) : (
                  <div className={styles.legacyProof}>Delivery ini selesai sebelum Delivery Proof V1 diterapkan.</div>
                )}
                {selected.proof_created_at && <p>Disimpan {dateTime(selected.proof_created_at)}</p>}
              </section>

              <section className={styles.timeline}>
                <div className={styles.sectionTitle}><span>TIMELINE ORDER</span><small>{(selected.events || []).length} aktivitas</small></div>
                <div className={styles.timelineList}>
                  {(selected.events || []).map((event, index) => (
                    <div className={styles.timelineItem} key={`${event.created_at}-${index}`}>
                      <i />
                      <span>
                        <strong>{statusLabel(event.next_status)}</strong>
                        <small>{dateTime(event.created_at)}</small>
                        <em>{event.actor_name || event.actor_role || "Sistem"}</em>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
