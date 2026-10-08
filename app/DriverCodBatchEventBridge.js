"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

async function request(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Gagal memuat data (${response.status})`);
  }
  return data;
}

function orderNumber(order) {
  return order.display_number || `WB${String(order.order_id || 0).padStart(6, "0")}`;
}

export default function DriverCodBatchEventBridge() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, data] = await Promise.all([
        request("me"),
        request("cod-batch-driver"),
      ]);
      if (me.user?.role !== "DRIVER") {
        throw new Error("Pusat setoran COD hanya dapat dibuka oleh Driver.");
      }
      setSnapshot(data);
      const expected =
        data.current_batch?.expected_amount ??
        data.eligible_expected_amount ??
        0;
      setAmount(String(expected || ""));
      setReference(data.current_batch?.evidence_reference || "");
    } catch (err) {
      setSnapshot(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openCenter = useCallback(() => {
    setOpen(true);
    load();
  }, [load]);

  useEffect(() => {
    // Own the actual Driver trip button directly. This deliberately avoids a
    // fragile event chain between independently mounted React roots.
    const onDocumentClick = (event) => {
      const button = event.target?.closest?.(".driver-trip-workspace button");
      if (!button) return;
      const label = String(button.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Setoran COD(?:\s|\(|$)/i.test(label)) return;

      event.preventDefault();
      event.stopPropagation();
      openCenter();
    };

    const onOpenEvent = () => openCenter();

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("warkost:open-cod-batch", onOpenEvent);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("warkost:open-cod-batch", onOpenEvent);
    };
  }, [openCenter]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const batch = snapshot?.current_batch || null;
  const eligible = snapshot?.eligible_orders || [];
  const orders = batch?.orders || eligible;
  const expected = batch?.expected_amount ?? snapshot?.eligible_expected_amount ?? 0;
  const qris = snapshot?.qris_excluded || { order_count: 0, amount: 0 };
  const editable = !batch || batch.status === "NEEDS_REVIEW";
  const difference = useMemo(() => {
    if (batch?.submitted_amount == null) return null;
    return Number(batch.submitted_amount) - Number(expected);
  }, [batch?.submitted_amount, expected]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("cod-batch-submit", {
        cashAmount: Number(amount),
        evidenceReference: reference,
      });
      await load();
      window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="cod-batch-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="cod-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Setoran COD Driver"
      >
        <div className="cod-batch-shell driver-mode">
          <header className="cod-batch-header">
            <div>
              <small>SETORAN COD DRIVER</small>
              <h2>Gabungkan setoran tunai</h2>
              <p>Satu penyerahan untuk seluruh order COD yang sudah selesai.</p>
            </div>
            <button
              className="cod-batch-close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup"
            >
              ×
            </button>
          </header>

          {error && <div className="cod-batch-feedback error">{error}</div>}

          {loading ? (
            <div className="cod-batch-loading">Memuat setoran COD…</div>
          ) : (
            <div className="cod-batch-driver-layout">
              <section className="cod-batch-driver-main">
                <div className="cod-batch-detail-head">
                  <div>
                    <small>{batch ? `BATCH #${batch.id}` : "SIAP DISETORKAN"}</small>
                    <h3>{orders.length} pesanan COD</h3>
                    <p>
                      {qris.order_count || 0} pesanan QRIS dikecualikan dari setoran tunai.
                    </p>
                  </div>
                  {orders.length > 0 && (
                    <span className="cod-batch-status large waiting">
                      {batch?.status === "SUBMITTED"
                        ? "Menunggu Admin"
                        : batch?.status === "NEEDS_REVIEW"
                          ? "Perlu koreksi"
                          : batch?.status === "VERIFIED"
                            ? "Terverifikasi"
                            : "Siap disetor"}
                    </span>
                  )}
                </div>

                <div className="cod-batch-amount-grid">
                  <article>
                    <span>Total COD</span>
                    <strong>{money(expected)}</strong>
                    <small>Total server-authoritative</small>
                  </article>
                  <article>
                    <span>Setoran Driver</span>
                    <strong>
                      {batch?.submitted_amount == null
                        ? "—"
                        : money(batch.submitted_amount)}
                    </strong>
                    <small>
                      {batch?.submitted_amount == null ? "Belum diserahkan" : "Tunai tercatat"}
                    </small>
                  </article>
                  <article
                    className={
                      difference === 0
                        ? "is-match"
                        : difference == null
                          ? ""
                          : "is-mismatch"
                    }
                  >
                    <span>Selisih</span>
                    <strong>{difference == null ? "—" : money(Math.abs(difference))}</strong>
                    <small>
                      {difference == null
                        ? "Menunggu setoran"
                        : difference === 0
                          ? "Cocok"
                          : difference < 0
                            ? "Kurang"
                            : "Lebih"}
                    </small>
                  </article>
                </div>

                <div className="cod-batch-section-heading">
                  <div>
                    <small>RINCIAN SETORAN</small>
                    <h4>{orders.length} order COD</h4>
                  </div>
                  <strong>{money(expected)}</strong>
                </div>

                {orders.length ? (
                  <div className="cod-batch-order-list">
                    {orders.map((order) => (
                      <article className="cod-batch-order-row" key={order.order_id}>
                        <div className="cod-batch-order-number">
                          <small>ORDER</small>
                          <strong>#{orderNumber(order)}</strong>
                        </div>
                        <div className="cod-batch-order-customer">
                          <strong>{order.customer || "Pelanggan"}</strong>
                          <small>{order.address || "Alamat tidak tersedia"}</small>
                        </div>
                        <div className="cod-batch-order-payment">
                          <strong>{money(order.expected_amount)}</strong>
                          <small>{order.payment_status || "UNPAID"}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="cod-batch-empty">
                    <span>✓</span>
                    <strong>Tidak ada COD yang perlu disetor</strong>
                    <p>Selesaikan pengantaran COD terlebih dahulu.</p>
                  </div>
                )}
              </section>

              <aside className="cod-batch-driver-summary">
                <div className="cod-batch-qris-note">
                  <span>QRIS selesai</span>
                  <strong>{qris.order_count || 0} order</strong>
                  <small>{money(qris.amount || 0)} · tidak masuk setoran COD</small>
                </div>

                {orders.length > 0 && editable && (
                  <form onSubmit={submit}>
                    <label>
                      Jumlah tunai diserahkan
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </label>
                    <label>
                      Referensi serah-terima <small>(opsional)</small>
                      <input
                        maxLength="191"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Contoh: diserahkan ke Admin"
                      />
                    </label>
                    <div className="cod-batch-driver-total">
                      <span>Total yang harus disetor</span>
                      <strong>{money(expected)}</strong>
                    </div>
                    <button
                      className="cod-batch-primary"
                      disabled={busy}
                      type="submit"
                    >
                      {busy
                        ? "Mengirim setoran…"
                        : batch?.status === "NEEDS_REVIEW"
                          ? "Koreksi Setoran COD"
                          : `Serahkan ${orders.length} Order COD`}
                    </button>
                  </form>
                )}

                {batch?.status === "SUBMITTED" && (
                  <div className="cod-batch-waiting-card">
                    <strong>Menunggu verifikasi Admin</strong>
                    <span>Setoran {money(batch.submitted_amount)} sudah tercatat.</span>
                  </div>
                )}

                {batch?.status === "VERIFIED" && (
                  <div className="cod-batch-success">
                    ✓ Setoran batch sudah diverifikasi Admin.
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
