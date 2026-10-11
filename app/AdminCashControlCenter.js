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
    hour: "2-digit",
    minute: "2-digit",
  });
};

async function request(body) {
  const response = await fetch("/api/admin-cash-control", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Gagal memuat data (${response.status})`);
  return data;
}

export default function AdminCashControlCenter() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("");
  const [pin, setPin] = useState("");
  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapPin, setBootstrapPin] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setState(data);
      if (!selectedOperator && data.operators?.length)
        setSelectedOperator(String(data.operators[0].id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedOperator]);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => active && setIsAdmin(data.user?.role === "ADMIN"))
      .catch(() => active && setIsAdmin(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const refresh = () => load();
    window.addEventListener("warkost:cod-batch-updated", refresh);
    return () => window.removeEventListener("warkost:cod-batch-updated", refresh);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    let navButton = null;
    let observer = null;

    const ensureButton = () => {
      const nav = document.querySelector(".admin-nav");
      if (!nav) return;
      const existing = nav.querySelector('[data-admin-nav="Setoran"]');
      if (existing) {
        navButton = existing;
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.adminNav = "Setoran";
      button.className = "admin-cash-nav";
      button.innerHTML = '<span class="admin-cash-nav-icon" aria-hidden="true">⇄</span><span>Setoran</span><em class="admin-cash-nav-badge"></em>';
      const printer = nav.querySelector('[data-admin-nav="Printer"]');
      nav.insertBefore(button, printer || null);
      navButton = button;
      button.addEventListener("click", () => {
        setOpen(true);
        setSuccess("");
        load();
      });
    };

    ensureButton();
    observer = new MutationObserver(ensureButton);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      navButton?.remove();
    };
  }, [isAdmin, load]);

  useEffect(() => {
    const button = document.querySelector('.admin-nav [data-admin-nav="Setoran"]');
    if (!button) return;
    button.classList.toggle("admin-nav-active", open);
    const badge = button.querySelector(".admin-cash-nav-badge");
    const pending = Number(state?.pending_driver?.count || 0);
    if (badge) {
      badge.textContent = pending > 0 ? String(pending) : "";
      badge.hidden = pending < 1;
    }
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("admin-cash-control-open");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("admin-cash-control-open");
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shift = state?.current_shift || null;
  const operators = state?.operators || [];
  const receipts = state?.recent_receipts || [];
  const pending = state?.pending_driver || { count: 0, actual_amount: 0 };
  const issueCount = Number(state?.issues?.count || 0);

  const operatorName = useMemo(
    () => operators.find((item) => String(item.id) === selectedOperator)?.name || "",
    [operators, selectedOperator],
  );

  const bootstrap = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await request({
        action: "BOOTSTRAP_OPERATOR",
        name: bootstrapName,
        pin: bootstrapPin,
      });
      setBootstrapPin("");
      setSuccess("Operator pertama berhasil dibuat. Sekarang mulai shift.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startShift = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await request({
        action: "START_SHIFT",
        operatorId: Number(selectedOperator),
        pin,
      });
      setPin("");
      setSuccess(`Shift ${operatorName} dimulai.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDriverSettlement = () => {
    setOpen(false);
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent("warkost:open-admin-cod-batch")),
      40,
    );
  };

  if (!isAdmin || !open) return null;

  return (
    <div
      className="admin-cash-overlay"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && setOpen(false)
      }
    >
      <section
        className="admin-cash-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Setoran dan Shift Admin"
      >
        <header className="admin-cash-header">
          <div>
            <small>CASH SETTLEMENT</small>
            <h2>Setoran Admin</h2>
            <p>Simple: operator aktif, uang diterima, dan kas yang menjadi tanggung jawab.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup">
            ×
          </button>
        </header>

        {error && <div className="admin-cash-feedback error">{error}</div>}
        {success && <div className="admin-cash-feedback success">✓ {success}</div>}

        {loading && !state ? (
          <div className="admin-cash-loading">Memuat cash control…</div>
        ) : operators.length === 0 ? (
          <div className="admin-cash-setup">
            <div className="admin-cash-copy">
              <span>SETUP PERTAMA</span>
              <h3>Buat operator Admin pertama</h3>
              <p>
                Akun Admin tetap satu. Nama operator dan PIN dipakai untuk mencatat siapa yang benar-benar memegang uang pada shift tersebut.
              </p>
            </div>
            <form onSubmit={bootstrap}>
              <label>
                Nama operator
                <input
                  value={bootstrapName}
                  onChange={(event) => setBootstrapName(event.target.value)}
                  placeholder="Contoh: Virsa"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                PIN operator
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  value={bootstrapPin}
                  onChange={(event) => setBootstrapPin(event.target.value)}
                  placeholder="4-6 digit"
                  required
                />
              </label>
              <button className="admin-cash-primary" type="submit" disabled={busy}>
                {busy ? "Menyimpan…" : "Buat Operator"}
              </button>
            </form>
          </div>
        ) : !shift ? (
          <div className="admin-cash-start">
            <div className="admin-cash-copy">
              <span>MULAI SHIFT</span>
              <h3>Siapa operator yang bertugas?</h3>
              <p>
                Uang COD baru menjadi tanggung jawab operator setelah setoran Driver benar-benar diterima dan diverifikasi.
              </p>
            </div>
            <form onSubmit={startShift}>
              <label>
                Operator
                <select
                  value={selectedOperator}
                  onChange={(event) => setSelectedOperator(event.target.value)}
                  required
                >
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                PIN {operatorName || "operator"}
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Masukkan PIN"
                  required
                />
              </label>
              <button className="admin-cash-primary" type="submit" disabled={busy}>
                {busy ? "Memulai…" : "Mulai Shift"}
              </button>
            </form>
          </div>
        ) : (
          <div className="admin-cash-active">
            <div className="admin-cash-shiftbar">
              <div>
                <small>OPERATOR AKTIF</small>
                <strong>{shift.operator_name}</strong>
                <span>Mulai {formatTime(shift.started_at)}</span>
              </div>
              <span className="admin-cash-live">SHIFT AKTIF</span>
            </div>

            <div className="admin-cash-kpis">
              <article>
                <span>Kas COD di tangan</span>
                <strong>{money(shift.cash_custody)}</strong>
                <small>{shift.receipt_count} setoran Driver diterima</small>
              </article>
              <article>
                <span>Menunggu dari Driver</span>
                <strong>{money(pending.actual_amount)}</strong>
                <small>{pending.count} batch belum diterima</small>
              </article>
              <article className={issueCount ? "has-issue" : ""}>
                <span>Perlu koreksi</span>
                <strong>{issueCount}</strong>
                <small>Setoran kurang tidak dapat diterima</small>
              </article>
            </div>

            <div className="admin-cash-rule">
              <strong>Aturan sederhana</strong>
              <span>
                Driver belum menyerahkan = tanggung jawab Driver. Setelah operator menekan verifikasi = masuk Kas Admin.
              </span>
            </div>

            <button
              className="admin-cash-primary admin-cash-receive"
              type="button"
              onClick={openDriverSettlement}
            >
              Terima Setoran Driver
              {pending.count > 0 && <em>{pending.count}</em>}
            </button>

            <div className="admin-cash-history">
              <div className="admin-cash-section-title">
                <div>
                  <small>SHIFT INI</small>
                  <h3>Uang yang sudah diterima</h3>
                </div>
                <strong>{money(shift.cash_custody)}</strong>
              </div>
              {receipts.length ? (
                <div className="admin-cash-receipt-list">
                  {receipts.map((receipt) => (
                    <article key={receipt.id}>
                      <div>
                        <strong>{receipt.driver_name}</strong>
                        <small>
                          Batch #{receipt.batch_id} · {formatTime(receipt.received_at)}
                        </small>
                      </div>
                      <div>
                        <strong>{money(receipt.actual_amount)}</strong>
                        {receipt.overage_amount > 0 && (
                          <small className="overage">
                            +{money(receipt.overage_amount)} lebih
                          </small>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-cash-empty">
                  Belum ada uang COD yang diterima operator pada shift ini.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
