"use client";

import { useEffect, useState } from "react";

const endpoint = "/api/payment/midtrans/operations";
const reasons = {
  LATE_SETTLEMENT: "Pembayaran terverifikasi setelah batas waktu lokal",
  PROVIDER_MISMATCH: "Data provider berbeda dari pesanan",
  TRANSACTION_CONFLICT: "Referensi transaksi sudah dipakai",
  STATUS_CONFLICT: "Status provider dan Warkost berbeda",
  PROVIDER_REFUND: "Refund dilaporkan oleh Midtrans",
  INVALID_SETTLEMENT_TIME: "Waktu settlement tidak dapat diverifikasi",
  INVALID_PROVIDER_RESPONSE: "Respons status provider tidak valid",
  MERCHANT_CONFIGURATION_CHANGED: "Konfigurasi merchant berbeda dari intent",
  CALLBACK_STATUS_REFERENCE_CONFLICT:
    "Referensi callback dan Get Status berbeda",
  CALLBACK_SETTLEMENT_UNCONFIRMED:
    "Settlement pada callback belum cocok dengan Get Status",
  RECONCILIATION_OVERDUE: "Status provider belum terkonfirmasi setelah 48 jam",
};

export default function MidtransSandboxOperations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(body) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        endpoint,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      if (body?.action === "reconcile")
        setNotice("Status Midtrans sudah diperiksa ulang.");
      if (body?.action === "review")
        setNotice("Peninjauan kasus sudah dicatat.");
    } catch (failure) {
      setError(failure.message || "Panel pembayaran belum tersedia.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="panel" aria-label="Rekonsiliasi Midtrans sandbox">
      <h2>Rekonsiliasi Midtrans sandbox</h2>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => load()}>
          Muat ulang
        </button>
        {data?.canToggle && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              load({ action: "set-new-payments", enabled: !data.enabled })
            }
          >
            {data.enabled ? "Hentikan QRIS baru" : "Izinkan QRIS sandbox baru"}
          </button>
        )}
      </div>
      {data && (
        <>
          <p>
            {data.enabled
              ? "QRIS sandbox baru diizinkan."
              : "QRIS baru dihentikan. Rekonsiliasi transaksi berjalan tetap aktif."}
          </p>
          {data.cases.length === 0 && (
            <p>Belum ada kasus yang menunggu peninjauan.</p>
          )}
          {data.cases.map((entry) => (
            <article className="line" key={entry.id}>
              <div>
                <strong>
                  Pesanan #{entry.order_id} ·{" "}
                  {reasons[entry.reason] ?? entry.reason}
                </strong>
                <p>
                  Warkost {entry.payment_status} · Midtrans{" "}
                  {entry.observed_status}
                </p>
                <p>Order Midtrans {entry.order_reference}</p>
                {entry.transaction_reference && (
                  <p>Transaksi {entry.transaction_reference}</p>
                )}
                {entry.observed_amount != null && (
                  <p>
                    Nominal provider Rp
                    {Number(entry.observed_amount).toLocaleString("id-ID")} ·
                    pesanan Rp
                    {Number(entry.expected_amount).toLocaleString("id-ID")}
                  </p>
                )}
              </div>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    load({ action: "reconcile", caseId: entry.id })
                  }
                >
                  Periksa Get Status
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => load({ action: "review", caseId: entry.id })}
                >
                  Tandai ditinjau
                </button>
              </div>
            </article>
          ))}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
