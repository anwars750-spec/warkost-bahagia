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
        <div>
          <span>OPERASIONAL DELIVERY</span>
          <h1>Riwayat Delivery</h1>
          <p>Bukti penyelesaian, Driver, pembayaran, dan timeline dalam satu histori read-only.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={refresh}>{loading ? "Memuat..." : "Perbarui"}</button>
          {onClose && <button type="button" onClick={onClose}>Tutup</button>}
        </div>
      </header>

      <div className={styles.metrics}>
        <article><small>Delivery termuat</small><strong>{rows.length}</strong></article>
        <article><small>Dengan bukti foto</small><strong>{withProof}</strong></article>
        <article><small>Histori lama</small><strong>{rows.length - withProof}</strong></article>
      </div>

      <input
        className={styles.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Cari WB, customer, Driver, alamat..."
      />
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.list}>
        {visibleRows.map((row) => (
          <article key={row.order_id} className={styles.card}>
            <div className={styles.cardTop}>
              <div><span>SELESAI</span><h2>{code(row.order_id)}</h2><p>{row.customer_name}</p></div>
              <div><small>{row.method}</small><strong>{money(row.payment_amount ?? row.total)}</strong><span>{row.payment_status}</span></div>
            </div>
            <dl className={styles.info}>
              <div><dt>Driver</dt><dd>{row.driver_name || "-"}</dd></div>
              <div><dt>Selesai</dt><dd>{dateTime(row.delivered_at)}</dd></div>
              <div><dt>Alamat</dt><dd>{row.address || "-"}</dd></div>
              <div><dt>Bukti</dt><dd>{row.proof_image_url ? "Tersimpan" : "Histori lama"}</dd></div>
            </dl>
            <button type="button" onClick={() => setSelected(row)}>Lihat bukti & timeline</button>
          </article>
        ))}
      </div>

      {!loading && !visibleRows.length && <div className={styles.empty}>Belum ada delivery selesai.</div>}
      {cursor && !search && <button className={styles.more} type="button" onClick={more}>Muat riwayat sebelumnya</button>}

      {selected && (
        <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true">
            <header><div><span>DETAIL DELIVERY</span><h2>{code(selected.order_id)}</h2></div><button type="button" onClick={() => setSelected(null)}>x</button></header>
            <div className={styles.proof}>
              <small>BUKTI PENGANTARAN</small>
              {selected.proof_image_url ? <img src={selected.proof_image_url} alt="Bukti pengantaran" /> : <p>Delivery ini selesai sebelum Delivery Proof V1 diterapkan.</p>}
              {selected.proof_created_at && <span>Disimpan {dateTime(selected.proof_created_at)}</span>}
            </div>
            <section className={styles.timeline}>
              <small>TIMELINE ORDER</small>
              {(selected.events || []).map((event, index) => (
                <div key={`${event.created_at}-${index}`}><i /><span><strong>{statusLabel(event.next_status)}</strong><small>{dateTime(event.created_at)} - {event.actor_name || event.actor_role || "Sistem"}</small></span></div>
              ))}
            </section>
          </section>
        </div>
      )}
    </section>
  );
}
