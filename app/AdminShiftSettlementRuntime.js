"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const RUNTIME_REVISION = "P0-ENDSHIFT-R5";
const POST_TIMEOUT_MS = 5000;
const LEDGER_TIMEOUT_MS = 1800;
const LEDGER_ATTEMPTS = 12;

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

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const never = () => new Promise(() => {});

function signalSubmitting(active) {
  window.dispatchEvent(
    new CustomEvent("warkost:admin-shift-submitting", {
      detail: { active: Boolean(active) },
    }),
  );
}

function staleRuntimeError() {
  const error = new Error(
    "Build Owner Demo dan browser tidak sinkron. Hentikan server, build ulang, start Owner Demo lagi, lalu hard refresh browser (Ctrl+Shift+R).",
  );
  error.code = "STALE_RUNTIME";
  return error;
}

function assertRuntime(data) {
  if (data?.runtime_revision !== RUNTIME_REVISION) throw staleRuntimeError();
  return data;
}

async function request(body, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/admin-shift-settlement", {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        data.error || `Gagal memproses setoran (${response.status})`,
      );
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        "Respons perintah setoran terlambat. Ledger tetap diperiksa agar transaksi tidak dibuat ganda.",
      );
      timeoutError.code = "SETTLEMENT_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export default function AdminShiftSettlementRuntime() {
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [submittedAmount, setSubmittedAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState("idle");
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [error, setError] = useState("");
  const [lastSlip, setLastSlip] = useState(null);
  const [noCashMessage, setNoCashMessage] = useState("");

  useEffect(() => {
    let currentAnchor = null;

    const ensure = () => {
      const receiveButton = document.querySelector(
        ".admin-cash-active .admin-cash-receive",
      );
      if (!receiveButton) {
        if (currentAnchor?.isConnected) currentAnchor.remove();
        currentAnchor = null;
        setAnchor(null);
        return;
      }

      let node = receiveButton.parentElement?.querySelector(
        ":scope > .admin-shift-settlement-anchor",
      );
      if (!node) {
        node = document.createElement("div");
        node.className = "admin-shift-settlement-anchor";
        receiveButton.insertAdjacentElement("afterend", node);
      }
      currentAnchor = node;
      setAnchor(node);
    };

    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentAnchor?.isConnected) currentAnchor.remove();
    };
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = assertRuntime(await request(undefined, 4000));
      setRuntimeReady(true);
      setState(data);
      const expected = Number(data.current_shift?.cash_custody || 0);
      setSubmittedAmount(String(expected));
      return data;
    } catch (err) {
      setRuntimeReady(false);
      setError(err.message);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!anchor) return;
    void load();
    const refresh = () => void load({ silent: true });
    window.addEventListener("warkost:cod-batch-updated", refresh);
    window.addEventListener("warkost:admin-session-restored", refresh);
    return () => {
      window.removeEventListener("warkost:cod-batch-updated", refresh);
      window.removeEventListener("warkost:admin-session-restored", refresh);
    };
  }, [anchor, load]);

  const openSettlement = async () => {
    setOpen(true);
    setError("");
    setNoCashMessage("");
    await load();
  };

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

  const completeSubmission = useCallback((result) => {
    setOpen(false);
    setError("");

    if (result?.no_cash) {
      setNoCashMessage(
        `Shift ${result.operator_name} selesai. Tidak ada kas COD untuk disetor.`,
      );
      setBusy(false);
      setBusyStage("idle");
      signalSubmitting(false);
      window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
      window.dispatchEvent(new CustomEvent("warkost:admin-shift-ended"));
      return true;
    }

    if (!result?.settlement) return false;

    const settlement = result.settlement;
    setLastSlip(settlement);
    setBusyStage("printing");

    window.dispatchEvent(
      new CustomEvent("warkost:admin-settlement-submitted", {
        detail: { settlement },
      }),
    );

    const releaseGate = () => {
      setBusy(false);
      setBusyStage("idle");
      signalSubmitting(false);
      window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
      window.dispatchEvent(new CustomEvent("warkost:admin-shift-ended"));
    };

    // Modal ditutup sebelum print. Karena lastSlip sudah dirender oleh React,
    // print sheet tetap tersedia walaupun workspace berpindah ke Printer.
    window.setTimeout(() => {
      document.querySelector('nav [data-admin-nav="Printer"]')?.click();

      window.setTimeout(() => {
        let released = false;
        const releaseOnce = () => {
          if (released) return;
          released = true;
          window.removeEventListener("afterprint", releaseOnce);
          releaseGate();
        };

        window.addEventListener("afterprint", releaseOnce, { once: true });
        try {
          window.print();
        } catch {
          releaseOnce();
          return;
        }
        window.setTimeout(releaseOnce, 1800);
      }, 320);
    }, 80);

    return true;
  }, []);

  const recoverSubmission = useCallback(
    async (shiftId, expected, operatorName) => {
      // Ledger adalah source of truth. Poll ini dimulai paralel dengan POST,
      // bukan menunggu POST timeout. Jadi response POST yang macet tidak dapat
      // menahan modal setelah database sudah commit.
      await wait(180);
      setBusyStage("checking");

      for (let attempt = 0; attempt < LEDGER_ATTEMPTS; attempt += 1) {
        if (attempt) await wait(250);
        try {
          const snapshot = assertRuntime(
            await request(undefined, LEDGER_TIMEOUT_MS),
          );
          const settlement = (snapshot.recent_settlements || []).find(
            (item) => Number(item.shift_id) === Number(shiftId),
          );

          if (settlement) {
            return {
              no_cash: false,
              settlement,
              replayed: true,
              confirmed_by: "ledger",
            };
          }

          if (
            Number(expected) === 0 &&
            !snapshot.current_shift
          ) {
            return {
              no_cash: true,
              shift_id: Number(shiftId),
              operator_name: operatorName,
              expected_amount: 0,
              submitted_amount: 0,
              confirmed_by: "ledger",
            };
          }
        } catch (recoveryError) {
          if (recoveryError?.code === "STALE_RUNTIME") throw recoveryError;
        }
      }

      return null;
    },
    [],
  );

  const submit = async () => {
    if (busy || !state?.current_shift) return;

    const actual = Number(submittedAmount);
    const expected = Number(state.current_shift.cash_custody || 0);
    const shiftId = Number(state.current_shift.id);
    const operatorName = state.current_shift.operator_name;
    setError("");

    if (!runtimeReady) {
      setError(
        "Runtime setoran belum sinkron dengan server. Restart Owner Demo lalu hard refresh browser (Ctrl+Shift+R).",
      );
      return;
    }
    if (!Number.isSafeInteger(actual) || actual < 0) {
      setError("Masukkan nominal uang fisik yang valid.");
      return;
    }
    if (actual < expected) {
      setError(
        `Setoran kurang ${money(expected - actual)}. Tambahkan uang sampai minimal ${money(expected)}.`,
      );
      return;
    }

    setBusy(true);
    setBusyStage("saving");
    signalSubmitting(true);

    let handedOff = false;
    let postError = null;

    // Satu POST saja. Jika body response macet di browser, ledger watcher di
    // bawah tetap dapat menyelesaikan UI berdasarkan transaksi yang sudah commit.
    const postSuccess = request(
      {
        action: "SUBMIT_END_SHIFT",
        shiftId,
        submittedAmount: actual,
      },
      POST_TIMEOUT_MS,
    )
      .then(assertRuntime)
      .then((result) => ({ source: "post", result }))
      .catch((err) => {
        postError = err;
        return never();
      });

    const ledgerSuccess = recoverSubmission(
      shiftId,
      expected,
      operatorName,
    ).then((result) => ({ source: "ledger", result }));

    try {
      const winner = await Promise.race([postSuccess, ledgerSuccess]);

      if (winner?.result) {
        handedOff = completeSubmission(winner.result);
      } else if (postError?.code === "STALE_RUNTIME") {
        setRuntimeReady(false);
        setError(postError.message);
      } else if (postError && postError.status && postError.status < 500) {
        setError(postError.message);
      } else {
        setError(
          "Setoran belum terkonfirmasi di ledger. Proses dihentikan otomatis agar tidak membeku dan tidak membuat transaksi ganda. Muat ulang data lalu coba lagi.",
        );
        await load();
      }
    } catch (err) {
      if (err?.code === "STALE_RUNTIME") {
        setRuntimeReady(false);
        setError(err.message);
      } else {
        setError(err?.message || "Gagal mengecek ledger setoran.");
      }
    } finally {
      if (!handedOff) {
        setBusy(false);
        setBusyStage("idle");
        signalSubmitting(false);
      }
    }
  };

  const shift = state?.current_shift || null;
  const expected = Number(shift?.cash_custody || 0);
  const actual = Number(submittedAmount || 0);
  const difference = actual - expected;

  const busyLabel =
    busyStage === "checking"
      ? "Memeriksa ledger…"
      : busyStage === "printing"
        ? "Menyiapkan Printer…"
        : "Menyimpan setoran…";

  return (
    <>
      {anchor &&
        createPortal(
          <button
            type="button"
            className="admin-shift-settlement-launcher"
            onClick={openSettlement}
          >
            <span>
              <small>AKHIR SHIFT</small>
              <strong>Setor ke Manager</strong>
            </span>
            <b>{money(expected)}</b>
          </button>,
          anchor,
        )}

      {open &&
        createPortal(
          <div
            className="admin-shift-settlement-overlay"
            role="presentation"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !busy && setOpen(false)
            }
          >
            <section
              className="admin-shift-settlement-panel"
              role="dialog"
              aria-modal="true"
              aria-label="End Shift dan Setoran Manager"
              data-runtime-revision={RUNTIME_REVISION}
            >
              <header>
                <div>
                  <small>END SHIFT</small>
                  <h2>Setor ke Manager</h2>
                  <p>Hitung uang fisik, cocokkan, lalu serahkan ke Manager.</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>

              {error && <div className="admin-shift-settlement-error">{error}</div>}

              {loading ? (
                <div className="admin-shift-settlement-loading">Memuat kas shift…</div>
              ) : shift ? (
                <div className="admin-shift-settlement-body">
                  <div className="admin-shift-operator">
                    <div>
                      <small>OPERATOR</small>
                      <strong>{shift.operator_name}</strong>
                    </div>
                    <span>Mulai {dateTime(shift.started_at)}</span>
                  </div>

                  <div className="admin-shift-settlement-kpis">
                    <article>
                      <span>Kas sistem</span>
                      <strong>{money(expected)}</strong>
                      <small>{shift.receipt_count || 0} setoran Driver</small>
                    </article>
                    <article>
                      <span>Kelebihan dari Driver</span>
                      <strong>{money(shift.driver_overage)}</strong>
                      <small>Tetap ikut disetorkan</small>
                    </article>
                  </div>

                  <label>
                    Uang fisik yang diserahkan ke Manager
                    <div className="admin-shift-money-input">
                      <span>Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={submittedAmount}
                        disabled={busy}
                        onChange={(event) => setSubmittedAmount(event.target.value)}
                      />
                    </div>
                  </label>

                  <div
                    className={`admin-shift-settlement-match ${
                      difference < 0 ? "short" : difference > 0 ? "over" : "match"
                    }`}
                  >
                    <strong>
                      {difference < 0
                        ? `Kurang ${money(Math.abs(difference))}`
                        : difference > 0
                          ? `Lebih ${money(difference)}`
                          : "Nominal cocok"}
                    </strong>
                    <span>
                      {difference < 0
                        ? "Setoran kurang tidak dapat dilanjutkan."
                        : difference > 0
                          ? "Boleh diterima dan kelebihannya akan tercatat."
                          : "Siap diserahkan ke Manager."}
                    </span>
                  </div>

                  <button
                    className="admin-shift-settlement-primary"
                    type="button"
                    disabled={busy || difference < 0 || !runtimeReady}
                    onClick={submit}
                  >
                    {busy
                      ? busyLabel
                      : expected === 0 && actual === 0
                        ? "Akhiri Shift"
                        : "Ajukan Setoran & Cetak Slip"}
                  </button>
                </div>
              ) : (
                <div className="admin-shift-settlement-loading">
                  Tidak ada shift aktif.
                </div>
              )}
            </section>
          </div>,
          document.body,
        )}

      {noCashMessage &&
        createPortal(
          <div className="admin-shift-settlement-toast">
            <span>✓ {noCashMessage}</span>
            <button type="button" onClick={() => setNoCashMessage("")}>Tutup</button>
          </div>,
          document.body,
        )}

      {lastSlip &&
        createPortal(
          <>
            <div className="admin-shift-settlement-toast">
              <span>✓ {lastSlip.slip_number} dibuat dan menunggu Manager.</span>
              <button type="button" onClick={() => window.print()}>Cetak Ulang</button>
              <button type="button" onClick={() => setLastSlip(null)}>Tutup</button>
            </div>
            <section
              className="admin-settlement-print-sheet"
              aria-label="Slip Setoran Admin"
            >
              <div className="admin-settlement-print-logo">WARKOST BAHAGIA</div>
              <h1>BUKTI PENYERAHAN SETORAN</h1>
              <p className="admin-settlement-print-number">{lastSlip.slip_number}</p>
              <dl>
                <div><dt>Operator</dt><dd>{lastSlip.operator_name}</dd></div>
                <div><dt>Mulai Shift</dt><dd>{dateTime(lastSlip.started_at)}</dd></div>
                <div><dt>Selesai Shift</dt><dd>{dateTime(lastSlip.ended_at || lastSlip.submitted_at)}</dd></div>
                <div><dt>Setoran Driver</dt><dd>{lastSlip.receipt_count} batch</dd></div>
              </dl>
              <div className="admin-settlement-print-total">
                <div><span>Kas COD Sistem</span><strong>{money(lastSlip.expected_amount)}</strong></div>
                <div><span>Uang Diserahkan</span><strong>{money(lastSlip.submitted_amount)}</strong></div>
                <div><span>Selisih Lebih</span><strong>{money(lastSlip.admin_overage_amount)}</strong></div>
              </div>
              <p className="admin-settlement-print-status">MENUNGGU VERIFIKASI MANAGER</p>
              <div className="admin-settlement-signatures">
                <div><span>Diserahkan oleh</span><strong>{lastSlip.operator_name}</strong></div>
                <div><span>Diterima oleh</span><strong>Manager __________________</strong></div>
              </div>
              <small>
                Dicetak {dateTime(lastSlip.submitted_at)} · Source of truth tetap ledger Warkost.
              </small>
            </section>
          </>,
          document.body,
        )}
    </>
  );
}
