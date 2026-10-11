"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const dateTime = (value) => {
  if (!value) return "—";
  const raw = String(value);
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

async function request(body) {
  const response = await fetch("/api/manager-cash-control", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body
      ? { "Content-Type": "application/json", Accept: "application/json" }
      : { Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Gagal memuat setoran (${response.status})`);
  return data;
}

export default function ManagerCashSettlementCenter() {
  const [isManager, setIsManager] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [printSettlement, setPrintSettlement] = useState(null);

  useEffect(() => {
    let alive = true;
    let checking = false;
    const detect = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (alive) setIsManager(data.user?.role === "MANAGER");
      } catch {
        if (alive) setIsManager(false);
      } finally {
        checking = false;
      }
    };
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);

  const load = useCallback(async () => {
    if (!isManager) return;
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setState(data);
      const pending = data.pending || [];
      setSelectedId((current) => {
        if (pending.some((item) => String(item.id) === String(current)))
          return current;
        return pending[0]?.id || null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    if (!isManager) return;
    load();
    const refresh = () => load();
    window.addEventListener("warkost:admin-settlement-submitted", refresh);
    return () => window.removeEventListener("warkost:admin-settlement-submitted", refresh);
  }, [isManager, load]);

  useEffect(() => {
    if (!isManager) return;
    let desktop = null;
    let mobile = null;

    const ensure = () => {
      const topNav = document.querySelector("header.top nav");
      if (topNav && !topNav.querySelector('[data-manager-cash-nav="true"]')) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.managerCashNav = "true";
        button.className = "manager-cash-nav";
        button.innerHTML = '<span aria-hidden="true">Rp</span><span>Kas & Setoran</span><em></em>';
        button.addEventListener("click", () => {
          setOpen(true);
          setError("");
          setSuccess("");
          load();
        });
        const before = [...topNav.querySelectorAll("button")].find((node) =>
          /Notifikasi|Keluar/i.test(node.textContent || ""),
        );
        topNav.insertBefore(button, before || null);
        desktop = button;
      } else if (topNav) {
        desktop = topNav.querySelector('[data-manager-cash-nav="true"]');
      }

      const mobileNav = document.querySelector(".manager-mobile-nav");
      if (mobileNav && !mobileNav.querySelector('[data-manager-cash-mobile="true"]')) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.managerCashMobile = "true";
        button.className = "manager-cash-mobile-nav";
        button.innerHTML = 'Rp<span>Setoran</span>';
        button.addEventListener("click", () => {
          setOpen(true);
          setError("");
          setSuccess("");
          load();
        });
        mobileNav.insertBefore(button, mobileNav.lastElementChild || null);
        mobile = button;
      } else if (mobileNav) {
        mobile = mobileNav.querySelector('[data-manager-cash-mobile="true"]');
      }
    };

    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      desktop?.remove();
      mobile?.remove();
    };
  }, [isManager, load]);

  useEffect(() => {
    const count = Number(state?.summary?.pending_count || 0);
    const desktop = document.querySelector('[data-manager-cash-nav="true"]');
    if (desktop) {
      desktop.classList.toggle("active", open);
      const badge = desktop.querySelector("em");
      if (badge) {
        badge.textContent = count > 0 ? String(count) : "";
        badge.hidden = count < 1;
      }
    }
    const mobile = document.querySelector('[data-manager-cash-mobile="true"]');
    if (mobile) mobile.classList.toggle("active", open);
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  const pending = state?.pending || [];
  const selected = useMemo(
    () => pending.find((item) => String(item.id) === String(selectedId)) || null,
    [pending, selectedId],
  );

  useEffect(() => {
    if (selected)
      setReceivedAmount(String(Number(selected.submitted_amount || 0)));
    else setReceivedAmount("");
  }, [selectedId, selected?.submitted_amount]);

  const verify = async () => {
    if (!selected || busy) return;
    const actual = Number(receivedAmount);
    const expected = Number(selected.submitted_amount || 0);
    setError("");
    setSuccess("");
    if (!Number.isSafeInteger(actual) || actual < 0) {
      setError("Masukkan uang fisik yang benar-benar diterima.");
      return;
    }
    if (actual < expected) {
      setError(
        `Uang kurang ${money(expected - actual)}. Verifikasi diblokir sampai nominal lengkap.`,
      );
      return;
    }

    setBusy(true);
    try {
      const result = await request({
        action: "VERIFY_ADMIN_SETTLEMENT",
        settlementId: selected.id,
        receivedAmount: actual,
      });
      setSuccess(
        `${result.settlement.slip_number} terverifikasi. ${money(actual)} masuk Kas Manager.`,
      );
      setPrintSettlement(result.settlement);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const print = (settlement) => {
    setPrintSettlement(settlement);
    window.setTimeout(() => window.print(), 120);
  };

  if (!isManager) return null;

  return (
    <>
      {open &&
        createPortal(
          <div
            className="manager-cash-overlay"
            role="presentation"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !busy && setOpen(false)
            }
          >
            <section
              className="manager-cash-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Kas dan Setoran Manager"
            >
              <header>
                <div>
                  <small>CASH CONTROL</small>
                  <h2>Kas & Setoran</h2>
                  <p>Terima setoran Admin, hitung fisik, lalu verifikasi.</p>
                </div>
                <button type="button" disabled={busy} onClick={() => setOpen(false)}>×</button>
              </header>

              {error && <div className="manager-cash-feedback error">{error}</div>}
              {success && <div className="manager-cash-feedback success">✓ {success}</div>}

              <div className="manager-cash-summary">
                <article>
                  <span>Menunggu dari Admin</span>
                  <strong>{money(state?.summary?.pending_amount)}</strong>
                  <small>{state?.summary?.pending_count || 0} setoran</small>
                </article>
                <article>
                  <span>Kas Manager</span>
                  <strong>{money(state?.summary?.manager_cash)}</strong>
                  <small>{state?.summary?.manager_cash_count || 0} setoran terverifikasi</small>
                </article>
              </div>

              {loading && !state ? (
                <div className="manager-cash-empty">Memuat setoran…</div>
              ) : pending.length ? (
                <div className="manager-cash-grid">
                  <aside>
                    <small>MENUNGGU VERIFIKASI</small>
                    {pending.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={String(item.id) === String(selectedId) ? "active" : ""}
                        onClick={() => {
                          setSelectedId(item.id);
                          setError("");
                          setSuccess("");
                        }}
                      >
                        <span>
                          <strong>{item.operator_name}</strong>
                          <small>{item.slip_number}</small>
                        </span>
                        <b>{money(item.submitted_amount)}</b>
                      </button>
                    ))}
                  </aside>

                  {selected && (
                    <section className="manager-cash-detail">
                      <div className="manager-cash-detail-head">
                        <div>
                          <small>SETORAN ADMIN</small>
                          <h3>{selected.operator_name}</h3>
                          <p>{selected.slip_number} · {selected.receipt_count} batch Driver</p>
                        </div>
                        <button type="button" onClick={() => print(selected)}>Cetak Slip</button>
                      </div>

                      <dl>
                        <div><dt>Mulai Shift</dt><dd>{dateTime(selected.started_at)}</dd></div>
                        <div><dt>Selesai Shift</dt><dd>{dateTime(selected.ended_at || selected.submitted_at)}</dd></div>
                        <div><dt>Kas Sistem Admin</dt><dd>{money(selected.expected_amount)}</dd></div>
                        <div><dt>Diserahkan Admin</dt><dd>{money(selected.submitted_amount)}</dd></div>
                        {selected.admin_overage_amount > 0 && (
                          <div><dt>Kelebihan Admin</dt><dd>+{money(selected.admin_overage_amount)}</dd></div>
                        )}
                      </dl>

                      <label>
                        Uang fisik yang diterima Manager
                        <div className="manager-cash-money-input">
                          <span>Rp</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={receivedAmount}
                            disabled={busy}
                            onChange={(event) => setReceivedAmount(event.target.value)}
                          />
                        </div>
                      </label>

                      {Number(receivedAmount || 0) < Number(selected.submitted_amount || 0) ? (
                        <div className="manager-cash-variance short">
                          Kurang {money(Number(selected.submitted_amount || 0) - Number(receivedAmount || 0))} · tidak dapat diverifikasi
                        </div>
                      ) : Number(receivedAmount || 0) > Number(selected.submitted_amount || 0) ? (
                        <div className="manager-cash-variance over">
                          Lebih {money(Number(receivedAmount || 0) - Number(selected.submitted_amount || 0))} · boleh diterima dan dicatat
                        </div>
                      ) : (
                        <div className="manager-cash-variance match">Nominal cocok · siap diverifikasi</div>
                      )}

                      <button
                        className="manager-cash-primary"
                        type="button"
                        disabled={busy || Number(receivedAmount || 0) < Number(selected.submitted_amount || 0)}
                        onClick={verify}
                      >
                        {busy ? "Memverifikasi…" : "Verifikasi & Terima Setoran"}
                      </button>
                    </section>
                  )}
                </div>
              ) : (
                <div className="manager-cash-empty">
                  <strong>✓ Tidak ada setoran menunggu</strong>
                  <span>Setoran akhir shift Admin akan muncul otomatis di sini.</span>
                </div>
              )}

              {!!state?.recent?.length && (
                <section className="manager-cash-history">
                  <small>RIWAYAT TERBARU</small>
                  {state.recent.map((item) => (
                    <div key={item.id}>
                      <span>
                        <strong>{item.operator_name}</strong>
                        <small>{item.slip_number} · {dateTime(item.verified_at)}</small>
                      </span>
                      <b>{money(item.manager_received_amount)}</b>
                    </div>
                  ))}
                </section>
              )}
            </section>
          </div>,
          document.body,
        )}

      {printSettlement &&
        createPortal(
          <section className="admin-settlement-print-sheet" aria-label="Slip Setoran Admin">
            <div className="admin-settlement-print-logo">WARKOST BAHAGIA</div>
            <h1>BUKTI SETORAN SHIFT</h1>
            <p className="admin-settlement-print-number">{printSettlement.slip_number}</p>
            <dl>
              <div><dt>Operator</dt><dd>{printSettlement.operator_name}</dd></div>
              <div><dt>Mulai Shift</dt><dd>{dateTime(printSettlement.started_at)}</dd></div>
              <div><dt>Selesai Shift</dt><dd>{dateTime(printSettlement.ended_at || printSettlement.submitted_at)}</dd></div>
              <div><dt>Setoran Driver</dt><dd>{printSettlement.receipt_count} batch</dd></div>
            </dl>
            <div className="admin-settlement-print-total">
              <div><span>Kas Sistem</span><strong>{money(printSettlement.expected_amount)}</strong></div>
              <div><span>Diserahkan Admin</span><strong>{money(printSettlement.submitted_amount)}</strong></div>
              {printSettlement.manager_received_amount !== null && (
                <div><span>Diterima Manager</span><strong>{money(printSettlement.manager_received_amount)}</strong></div>
              )}
            </div>
            <p className="admin-settlement-print-status">
              {printSettlement.status === "VERIFIED" ? "VERIFIED" : "MENUNGGU VERIFIKASI MANAGER"}
            </p>
            <div className="admin-settlement-signatures">
              <div><span>Admin</span><strong>{printSettlement.operator_name}</strong></div>
              <div><span>Manager</span><strong>{printSettlement.manager_name || "__________________"}</strong></div>
            </div>
            <small>Ledger digital Warkost adalah source of truth.</small>
          </section>,
          document.body,
        )}
    </>
  );
}
