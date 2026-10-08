"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const formatTime = (value) => {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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

function isAdminCodCard(target) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  let node = element;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (
      /SETORAN COD/i.test(text) &&
      (/Verifikasi uang tunai driver/i.test(text) || /settlement/i.test(text))
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function statusLabel(status) {
  const value = String(status || "").toUpperCase();
  if (value === "SUBMITTED") return "Menunggu verifikasi";
  if (value === "NEEDS_REVIEW") return "Perlu koreksi";
  if (value === "VERIFIED") return "Terverifikasi";
  return value.replaceAll("_", " ") || "Belum tersedia";
}

export default function AdminCodBatchEventBridge() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("pending");
  const [batches, setBatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pendingData, historyData] = await Promise.all([
        request("cod-batches?filter=pending"),
        request("cod-batches?filter=history"),
      ]);
      const pending = pendingData.batches || [];
      const done = historyData.batches || [];
      setBatches(pending);
      setHistory(done);
      const visible = tab === "history" ? done : pending;
      if (visible.length) {
        setSelectedId((current) =>
          visible.some((item) => String(item.id) === String(current))
            ? current
            : visible[0].id,
        );
      } else {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(err.message);
      setBatches([]);
      setHistory([]);
      setSelectedId(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const openCenter = useCallback(async () => {
    if (document.querySelector(".cod-batch-overlay[data-admin-cod-primary='true']")) {
      return;
    }
    try {
      const me = await request("me");
      if (me.user?.role !== "ADMIN") return;
      setOpen(true);
      setTab("pending");
      setSuccess("");
    } catch (err) {
      setError(err.message);
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const onClick = async (event) => {
      if (!isAdminCodCard(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      await openCenter();
    };
    const onCustomOpen = () => openCenter();
    document.addEventListener("click", onClick, true);
    window.addEventListener("warkost:open-admin-cod-batch", onCustomOpen);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("warkost:open-admin-cod-batch", onCustomOpen);
    };
  }, [openCenter]);

  useEffect(() => {
    if (!open) return;
    loadLists();
  }, [open, tab, loadLists]);

  useEffect(() => {
    if (!open || !selectedId) return;
    let active = true;
    setDetailLoading(true);
    setError("");
    request(`cod-batch?batchId=${selectedId}`)
      .then((data) => active && setDetail(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [open, selectedId]);

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

  const visible = tab === "history" ? history : batches;
  const current = useMemo(() => {
    return visible.find((item) => String(item.id) === String(selectedId)) || null;
  }, [selectedId, visible]);

  const expected = Number(detail?.expected_amount || 0);
  const submitted = Number(detail?.submitted_amount || 0);
  const difference = submitted - expected;
  const orders = detail?.orders || [];
  const canVerify =
    detail?.status === "SUBMITTED" &&
    submitted === expected &&
    orders.length > 0;

  const verify = async () => {
    if (!detail?.id || !canVerify || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await request("cod-batch-verify", { batchId: detail.id });
      setSuccess(
        `${orders.length} order COD berhasil diverifikasi. Pembayaran telah menjadi PAID.`,
      );
      window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
      await loadLists();
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
      data-admin-cod-primary="true"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && setOpen(false)
      }
    >
      <div
        className="cod-batch-modal admin-mode"
        role="dialog"
        aria-modal="true"
        aria-label="Pusat Setoran COD Admin"
      >
        <div className="cod-batch-shell admin-mode">
          <header className="cod-batch-header">
            <div>
              <small>PUSAT SETORAN COD</small>
              <h2>Verifikasi setoran Driver</h2>
              <p>Satu batch untuk seluruh order COD yang diserahkan Driver.</p>
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

          <div className="cod-batch-tabs" role="tablist">
            <button
              type="button"
              className={tab === "pending" ? "active" : ""}
              onClick={() => {
                setTab("pending");
                setSuccess("");
              }}
            >
              Menunggu verifikasi <span>{batches.length}</span>
            </button>
            <button
              type="button"
              className={tab === "history" ? "active" : ""}
              onClick={() => {
                setTab("history");
                setSuccess("");
              }}
            >
              Riwayat <span>{history.length}</span>
            </button>
          </div>

          {error && <div className="cod-batch-feedback error">{error}</div>}
          {success && <div className="cod-batch-success">✓ {success}</div>}

          {loading ? (
            <div className="cod-batch-loading">Memuat setoran COD…</div>
          ) : !visible.length ? (
            <div className="cod-batch-empty admin-empty">
              <span>✓</span>
              <strong>
                {tab === "pending"
                  ? "Tidak ada setoran menunggu"
                  : "Belum ada riwayat setoran"}
              </strong>
              <p>
                {tab === "pending"
                  ? "Setoran gabungan Driver akan muncul otomatis setelah dikirim."
                  : "Batch yang sudah diverifikasi akan tampil di sini."}
              </p>
            </div>
          ) : (
            <div className="cod-batch-admin-grid">
              <aside className="cod-batch-sidebar">
                <div className="cod-batch-sidebar-title">
                  <span>{tab === "pending" ? "Batch aktif" : "Batch selesai"}</span>
                  <strong>{visible.length}</strong>
                </div>
                <div className="cod-batch-list">
                  {visible.map((batch) => {
                    const itemDiff =
                      Number(batch.submitted_amount || 0) -
                      Number(batch.expected_amount || 0);
                    return (
                      <button
                        type="button"
                        key={batch.id}
                        className={
                          String(current?.id) === String(batch.id) ? "active" : ""
                        }
                        onClick={() => {
                          setSelectedId(batch.id);
                          setSuccess("");
                        }}
                      >
                        <div>
                          <span>Batch #{batch.id}</span>
                          <strong>
                            {batch.driver?.name ||
                              batch.driver_name ||
                              `Driver #${batch.driver?.id || batch.driver_id || "—"}`}
                          </strong>
                          <small>
                            {batch.order_count || batch.orders?.length || 0} order COD
                          </small>
                        </div>
                        <div>
                          <strong>{money(batch.expected_amount)}</strong>
                          <small className={itemDiff === 0 ? "match" : "mismatch"}>
                            {itemDiff === 0
                              ? statusLabel(batch.status)
                              : `Selisih ${money(Math.abs(itemDiff))}`}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="cod-batch-detail">
                {detailLoading ? (
                  <div className="cod-batch-loading">Memuat rincian settlement…</div>
                ) : detail ? (
                  <>
                    <div className="cod-batch-detail-head">
                      <div>
                        <small>SETORAN DRIVER</small>
                        <h3>
                          {detail.driver?.name ||
                            detail.driver_name ||
                            `Driver #${detail.driver?.id || detail.driver_id || "—"}`}
                        </h3>
                        <p>
                          Batch #{detail.id} · {orders.length} order COD
                        </p>
                      </div>
                      <span
                        className={`cod-batch-status large ${
                          detail.status === "VERIFIED"
                            ? "verified"
                            : detail.status === "NEEDS_REVIEW"
                              ? "review"
                              : "submitted"
                        }`}
                      >
                        {statusLabel(detail.status)}
                      </span>
                    </div>

                    <div className="cod-batch-amount-grid">
                      <article>
                        <span>Tagihan COD</span>
                        <strong>{money(expected)}</strong>
                        <small>Nominal dari sistem</small>
                      </article>
                      <article>
                        <span>Setoran Driver</span>
                        <strong>{money(submitted)}</strong>
                        <small>Tunai yang diserahkan</small>
                      </article>
                      <article className={difference === 0 ? "is-match" : "is-mismatch"}>
                        <span>Selisih</span>
                        <strong>{money(Math.abs(difference))}</strong>
                        <small>
                          {difference === 0
                            ? "Cocok"
                            : difference < 0
                              ? "Kurang"
                              : "Lebih"}
                        </small>
                      </article>
                    </div>

                    {detail.status === "NEEDS_REVIEW" && (
                      <div className="cod-batch-warning">
                        <strong>Setoran perlu diperbaiki</strong>
                        <span>
                          Admin tidak dapat memverifikasi sampai Driver mengoreksi nominal.
                        </span>
                      </div>
                    )}

                    <div className="cod-batch-section-heading">
                      <div>
                        <small>RINCIAN BATCH</small>
                        <h4>{orders.length} pesanan COD</h4>
                      </div>
                      <strong>{money(expected)}</strong>
                    </div>

                    <div className="cod-batch-order-list">
                      {orders.map((order) => (
                        <article
                          className="cod-batch-order-row"
                          key={order.order_id || order.id}
                        >
                          <div className="cod-batch-order-number">
                            <small>ORDER</small>
                            <strong>
                              #{
                                order.display_number ||
                                `WB${String(order.order_id || order.id).padStart(6, "0")}`
                              }
                            </strong>
                          </div>
                          <div className="cod-batch-order-customer">
                            <strong>
                              {order.customer || order.customer_name || "Pelanggan"}
                            </strong>
                            <small>{order.address || "Alamat tidak tersedia"}</small>
                          </div>
                          <div className="cod-batch-order-payment">
                            <strong>
                              {money(order.expected_amount || order.total_amount)}
                            </strong>
                            <small>{order.payment_status || "UNPAID"}</small>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="cod-batch-meta-row">
                      <div>
                        <span>Driver</span>
                        <strong>
                          {detail.driver?.name ||
                            detail.driver_name ||
                            `Driver #${detail.driver?.id || detail.driver_id || "—"}`}
                        </strong>
                      </div>
                      <div>
                        <span>Waktu setoran</span>
                        <strong>{formatTime(detail.submitted_at)}</strong>
                      </div>
                      <div>
                        <span>Referensi</span>
                        <strong>{detail.evidence_reference || "Tidak ada"}</strong>
                      </div>
                    </div>

                    {detail.status === "SUBMITTED" && (
                      <button
                        className="cod-batch-primary"
                        type="button"
                        disabled={!canVerify || busy}
                        onClick={verify}
                      >
                        {busy
                          ? "Memverifikasi…"
                          : `Verifikasi ${orders.length} Setoran COD`}
                      </button>
                    )}

                    {detail.status === "VERIFIED" && (
                      <div className="cod-batch-success">
                        ✓ Batch terverifikasi {formatTime(detail.verified_at)}. Seluruh order COD terkait sudah diproses.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cod-batch-empty">
                    <span>◎</span>
                    <strong>Pilih batch setoran</strong>
                    <p>Rincian order dan nominal tunai akan muncul di sini.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
