"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const statusMeta = (status) => {
  const normalized = String(status || "").toUpperCase();
  const map = {
    SUBMITTED: ["Siap diverifikasi", "submitted"],
    NEEDS_REVIEW: ["Perlu koreksi", "review"],
    VERIFIED: ["Terverifikasi", "verified"],
    AWAITING: ["Menunggu setoran", "waiting"],
    AWAITING_COD_SETTLEMENT: ["Menunggu setoran", "waiting"],
  };
  const [label, tone] = map[normalized] || [normalized.replaceAll("_", " ") || "Belum tersedia", "waiting"];
  return { normalized, label, tone };
};

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
  if (!response.ok) throw new Error(data.error || `Gagal memuat data (${response.status})`);
  return data;
}

function findAdminSettlementCard() {
  const main = document.querySelector("main");
  if (!main) return null;
  const label = [...main.querySelectorAll("*")].find(
    (node) =>
      node.children.length === 0 &&
      node.textContent?.trim().toUpperCase() === "SETORAN COD",
  );
  if (!label) return null;
  let node = label.parentElement;
  while (node && node !== main) {
    const text = String(node.textContent || "");
    if (text.toUpperCase().includes("SETORAN COD") && /verifikasi uang tunai driver/i.test(text)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function AmountSummary({ expected, submitted, discrepancy }) {
  const difference = Number(discrepancy || 0);
  const submittedAvailable = submitted !== null && submitted !== undefined;
  return (
    <div className="cod-batch-amount-grid">
      <article>
        <span>Total COD</span>
        <strong>{money(expected)}</strong>
        <small>Tagihan seluruh order dalam batch</small>
      </article>
      <article>
        <span>Setoran Driver</span>
        <strong>{submittedAvailable ? money(submitted) : "—"}</strong>
        <small>{submittedAvailable ? "Tunai yang diserahkan" : "Belum diserahkan"}</small>
      </article>
      <article className={difference === 0 && submittedAvailable ? "is-match" : difference !== 0 ? "is-mismatch" : ""}>
        <span>Selisih</span>
        <strong>{submittedAvailable ? money(Math.abs(difference)) : "—"}</strong>
        <small>
          {!submittedAvailable ? "Menunggu setoran" : difference === 0 ? "Cocok" : difference < 0 ? "Kurang" : "Lebih"}
        </small>
      </article>
    </div>
  );
}

function OrderRows({ orders = [] }) {
  if (!orders.length) return <div className="cod-batch-empty compact">Belum ada order COD di batch ini.</div>;
  return (
    <div className="cod-batch-order-list">
      {orders.map((order) => (
        <article className="cod-batch-order-row" key={order.order_id}>
          <div className="cod-batch-order-number">
            <small>ORDER</small>
            <strong>#{order.display_number || `WB${String(order.order_id).padStart(6, "0")}`}</strong>
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
  );
}

function AdminBatchView({ onClose }) {
  const [filter, setFilter] = useState("pending");
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(async (nextFilter = filter, preferId = null) => {
    setLoading(true);
    setError("");
    try {
      const data = await request(`cod-batches?filter=${encodeURIComponent(nextFilter)}`);
      const next = data.batches || [];
      setBatches(next);
      const targetId = preferId && next.some((item) => Number(item.id) === Number(preferId))
        ? Number(preferId)
        : next.length
          ? Number(next[0].id)
          : null;
      setSelectedId(targetId);
      if (!targetId) setDetail(null);
    } catch (err) {
      setError(err.message);
      setBatches([]);
      setSelectedId(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadList(filter);
  }, [filter]);

  useEffect(() => {
    if (!selectedId) return;
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
  }, [selectedId]);

  const verify = async () => {
    if (!detail?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      await request("cod-batch-verify", { batchId: detail.id });
      await loadList(filter);
      window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const meta = statusMeta(detail?.status);
  const canVerify =
    detail?.status === "SUBMITTED" &&
    Number(detail?.expected_amount || 0) === Number(detail?.submitted_amount || 0);

  return (
    <div className="cod-batch-shell admin-mode">
      <header className="cod-batch-header">
        <div>
          <small>PUSAT SETORAN COD</small>
          <h2>Settlement Driver</h2>
          <p>Verifikasi beberapa order COD dalam satu serah-terima tunai.</p>
        </div>
        <button className="cod-batch-close" type="button" onClick={onClose} aria-label="Tutup">×</button>
      </header>

      <div className="cod-batch-tabs" role="tablist">
        <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Menunggu verifikasi</button>
        <button className={filter === "history" ? "active" : ""} onClick={() => setFilter("history")}>Riwayat</button>
      </div>

      {error && <div className="cod-batch-feedback error">{error}</div>}

      <div className="cod-batch-admin-grid">
        <aside className="cod-batch-sidebar">
          <div className="cod-batch-sidebar-title">
            <span>{filter === "pending" ? "Batch aktif" : "Batch selesai"}</span>
            <strong>{batches.length}</strong>
          </div>
          {loading ? (
            <div className="cod-batch-loading small">Memuat batch…</div>
          ) : batches.length ? (
            <div className="cod-batch-list">
              {batches.map((batch) => {
                const itemMeta = statusMeta(batch.status);
                return (
                  <button
                    type="button"
                    key={batch.id}
                    className={Number(selectedId) === Number(batch.id) ? "active" : ""}
                    onClick={() => setSelectedId(Number(batch.id))}
                  >
                    <div>
                      <span>Batch #{batch.id}</span>
                      <strong>{batch.driver?.name || `Driver #${batch.driver?.id || "—"}`}</strong>
                      <small>{batch.order_count || 0} order COD</small>
                    </div>
                    <div>
                      <strong>{money(batch.expected_amount)}</strong>
                      <span className={`cod-batch-status ${itemMeta.tone}`}>{itemMeta.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="cod-batch-empty compact">
              {filter === "pending" ? "Tidak ada setoran COD yang perlu diverifikasi." : "Belum ada riwayat batch COD."}
            </div>
          )}
        </aside>

        <section className="cod-batch-detail">
          {detailLoading ? (
            <div className="cod-batch-loading">Memuat rincian settlement…</div>
          ) : detail ? (
            <>
              <div className="cod-batch-detail-head">
                <div>
                  <small>SETORAN DRIVER</small>
                  <h3>{detail.driver?.name || `Driver #${detail.driver?.id || "—"}`}</h3>
                  <p>Batch #{detail.id} · {detail.order_count || detail.orders?.length || 0} order COD</p>
                </div>
                <span className={`cod-batch-status large ${meta.tone}`}>{meta.label}</span>
              </div>

              <AmountSummary
                expected={detail.expected_amount}
                submitted={detail.submitted_amount}
                discrepancy={detail.discrepancy_amount}
              />

              {detail.status === "NEEDS_REVIEW" && (
                <div className="cod-batch-warning">
                  <strong>Nominal belum sesuai</strong>
                  <span>Semua order dalam batch tetap UNPAID sampai Driver mengoreksi setoran.</span>
                </div>
              )}

              <div className="cod-batch-meta-row">
                <div><span>Waktu setoran</span><strong>{formatTime(detail.submitted_at)}</strong></div>
                <div><span>Referensi</span><strong>{detail.evidence_reference || "Tidak ada"}</strong></div>
                <div><span>Verifikator</span><strong>{detail.admin_verifier_name || "Belum diverifikasi"}</strong></div>
              </div>

              <div className="cod-batch-section-heading">
                <div>
                  <small>RINCIAN BATCH</small>
                  <h4>{detail.orders?.length || 0} pesanan COD</h4>
                </div>
                <strong>{money(detail.expected_amount)}</strong>
              </div>
              <OrderRows orders={detail.orders} />

              {canVerify && (
                <button className="cod-batch-primary" type="button" onClick={verify} disabled={busy}>
                  {busy ? "Memverifikasi…" : `Verifikasi ${detail.orders?.length || 0} Setoran`}
                </button>
              )}
              {detail.status === "VERIFIED" && (
                <div className="cod-batch-success">
                  ✓ Batch sudah diverifikasi pada {formatTime(detail.verified_at)}. Seluruh order COD di batch ini sudah PAID.
                </div>
              )}
            </>
          ) : (
            <div className="cod-batch-empty">
              <span>◎</span>
              <strong>Pilih batch setoran</strong>
              <p>Rincian order dan nominal tunai akan tampil di sini.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DriverBatchView({ onClose }) {
  const [snapshot, setSnapshot] = useState(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request("cod-batch-driver");
      setSnapshot(data);
      const expected = data.current_batch?.expected_amount ?? data.eligible_expected_amount ?? 0;
      setAmount(String(expected || ""));
      setReference(data.current_batch?.evidence_reference || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const batch = snapshot?.current_batch || null;
  const eligible = snapshot?.eligible_orders || [];
  const expected = batch?.expected_amount ?? snapshot?.eligible_expected_amount ?? 0;
  const currentMeta = statusMeta(batch?.status || (eligible.length ? "AWAITING" : ""));
  const orders = batch?.orders || eligible;
  const editable = !batch || batch.status === "NEEDS_REVIEW";
  const qris = snapshot?.qris_excluded || { order_count: 0, amount: 0 };

  return (
    <div className="cod-batch-shell driver-mode">
      <header className="cod-batch-header">
        <div>
          <small>SETORAN COD DRIVER</small>
          <h2>Gabungkan setoran tunai</h2>
          <p>Order QRIS tidak ikut dihitung karena sudah dibayar digital.</p>
        </div>
        <button className="cod-batch-close" type="button" onClick={onClose} aria-label="Tutup">×</button>
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
                <p>{qris.order_count || 0} pesanan QRIS tidak termasuk setoran tunai.</p>
              </div>
              {orders.length > 0 && <span className={`cod-batch-status large ${currentMeta.tone}`}>{currentMeta.label}</span>}
            </div>

            {orders.length ? (
              <>
                <AmountSummary
                  expected={expected}
                  submitted={batch?.submitted_amount}
                  discrepancy={batch?.discrepancy_amount}
                />

                {batch?.status === "NEEDS_REVIEW" && (
                  <div className="cod-batch-warning">
                    <strong>Setoran perlu dikoreksi</strong>
                    <span>Masukkan kembali jumlah tunai yang benar. Seluruh order tetap UNPAID sampai Admin memverifikasi.</span>
                  </div>
                )}

                <div className="cod-batch-section-heading">
                  <div>
                    <small>ORDER COD</small>
                    <h4>Pesanan dalam setoran</h4>
                  </div>
                  <strong>{money(expected)}</strong>
                </div>
                <OrderRows orders={orders} />
              </>
            ) : (
              <div className="cod-batch-empty">
                <span>✓</span>
                <strong>Tidak ada COD yang perlu disetor</strong>
                <p>Selesaikan pengantaran COD terlebih dahulu. Order QRIS tidak membutuhkan setoran tunai.</p>
              </div>
            )}
          </section>

          <aside className="cod-batch-driver-summary">
            <div className="cod-batch-qris-note">
              <span>QRIS selesai</span>
              <strong>{qris.order_count || 0} order</strong>
              <small>{money(qris.amount || 0)} · tidak masuk COD</small>
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
                <button className="cod-batch-primary" disabled={busy} type="submit">
                  {busy ? "Mengirim setoran…" : batch?.status === "NEEDS_REVIEW" ? "Koreksi Setoran COD" : `Serahkan ${orders.length} Order COD`}
                </button>
              </form>
            )}

            {batch?.status === "SUBMITTED" && (
              <div className="cod-batch-waiting-card">
                <strong>Menunggu verifikasi Admin</strong>
                <span>Setoran {money(batch.submitted_amount)} sudah tercatat. Jangan buat setoran baru untuk order yang sama.</span>
              </div>
            )}

            {batch?.status === "VERIFIED" && (
              <div className="cod-batch-success">✓ Setoran batch ini sudah diverifikasi Admin.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default function CodBatchSettlementCenter() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [driverBadge, setDriverBadge] = useState({ count: 0, amount: 0, status: "" });
  const [adminPending, setAdminPending] = useState(0);

  useEffect(() => {
    let active = true;
    request("me")
      .then((data) => active && setUser(data.user || null))
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, []);

  const refreshBadge = useCallback(async () => {
    if (!user) return;
    try {
      if (user.role === "ADMIN") {
        const data = await request("cod-batches?filter=pending");
        setAdminPending((data.batches || []).length);
      }
      if (user.role === "DRIVER") {
        const data = await request("cod-batch-driver");
        const current = data.current_batch;
        setDriverBadge({
          count: current?.order_count || data.eligible_orders?.length || 0,
          amount: current?.expected_amount || data.eligible_expected_amount || 0,
          status: current?.status || "",
        });
      }
    } catch {
      // Badge is convenience only; the center itself will show actionable errors.
    }
  }, [user]);

  useEffect(() => {
    refreshBadge();
    const onUpdated = () => refreshBadge();
    window.addEventListener("warkost:cod-batch-updated", onUpdated);
    const timer = window.setInterval(refreshBadge, 20000);
    return () => {
      window.removeEventListener("warkost:cod-batch-updated", onUpdated);
      window.clearInterval(timer);
    };
  }, [refreshBadge]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let observer;
    let card = null;

    const decorate = () => {
      const next = findAdminSettlementCard();
      if (!next) return;
      card = next;
      card.classList.add("cod-batch-admin-launcher");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "Buka pusat setoran COD");
      let badge = card.querySelector(".cod-batch-launcher-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "cod-batch-launcher-badge";
        card.appendChild(badge);
      }
      const nextBadgeText = adminPending > 0 ? `${adminPending} menunggu` : "Buka";
      if (badge.textContent !== nextBadgeText) badge.textContent = nextBadgeText;
    };

    const onClick = (event) => {
      const target = event.target.closest(".cod-batch-admin-launcher");
      if (!target) return;
      event.preventDefault();
      setOpen(true);
    };
    const onKey = (event) => {
      if (!event.target.closest(".cod-batch-admin-launcher")) return;
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setOpen(true);
    };

    decorate();
    observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      observer?.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      if (card) {
        card.classList.remove("cod-batch-admin-launcher");
        card.removeAttribute("role");
        card.removeAttribute("tabindex");
        card.removeAttribute("aria-label");
        card.querySelector(".cod-batch-launcher-badge")?.remove();
      }
    };
  }, [user?.role, adminPending]);

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

  const driverMeta = useMemo(() => statusMeta(driverBadge.status), [driverBadge.status]);

  if (!user || !["ADMIN", "DRIVER"].includes(user.role)) return null;

  return (
    <>
      {user.role === "DRIVER" && (
        <button className="cod-batch-driver-launcher" type="button" onClick={() => setOpen(true)}>
          <span className="cod-batch-driver-launcher-icon">▣</span>
          <span>
            <small>SETORAN COD</small>
            <strong>{driverBadge.count ? `${driverBadge.count} order · ${money(driverBadge.amount)}` : "Tidak ada setoran"}</strong>
          </span>
          {driverBadge.status ? <em className={driverMeta.tone}>{driverMeta.label}</em> : <em>Buka</em>}
        </button>
      )}

      {open && (
        <div className="cod-batch-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="cod-batch-modal" role="dialog" aria-modal="true" aria-label="Pusat setoran COD">
            {user.role === "ADMIN" ? (
              <AdminBatchView onClose={() => setOpen(false)} />
            ) : (
              <DriverBatchView onClose={() => setOpen(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
