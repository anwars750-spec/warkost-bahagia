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
  const response = await fetch("/api/manager-owner-settlement", {
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

export default function ManagerOwnerSettlementCenter() {
  const [role, setRole] = useState(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [destination, setDestination] = useState("OWNER");
  const [submittedAmount, setSubmittedAmount] = useState("");
  const [bankReference, setBankReference] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [ownerReceived, setOwnerReceived] = useState("");

  useEffect(() => {
    let alive = true;
    let checking = false;
    let lastCheck = 0;

    const detect = async (force = false) => {
      const now = Date.now();
      if (checking || (!force && now - lastCheck < 900)) return;
      checking = true;
      lastCheck = now;
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        const nextRole = ["MANAGER", "OWNER"].includes(data.user?.role)
          ? data.user.role
          : null;
        if (alive) setRole(nextRole);
      } catch {
        if (alive) setRole(null);
      } finally {
        checking = false;
      }
    };

    detect(true);
    const observer = new MutationObserver(() => detect(false));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);

  const load = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setState(data);
      if (data.role === "OWNER") {
        setSelectedId((current) => {
          if ((data.pending || []).some((item) => String(item.id) === String(current)))
            return current;
          return data.pending?.[0]?.id || null;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (!role) {
      setState(null);
      setOpen(false);
      return;
    }
    load();
  }, [role, load]);

  useEffect(() => {
    if (!role) return;
    const refresh = () => load();
    window.addEventListener("warkost:admin-settlement-submitted", refresh);
    window.addEventListener("warkost:manager-owner-settlement-submitted", refresh);
    window.addEventListener("warkost:manager-owner-settlement-verified", refresh);
    window.addEventListener("warkost:realtime-recovered", refresh);
    return () => {
      window.removeEventListener("warkost:admin-settlement-submitted", refresh);
      window.removeEventListener("warkost:manager-owner-settlement-submitted", refresh);
      window.removeEventListener("warkost:manager-owner-settlement-verified", refresh);
      window.removeEventListener("warkost:realtime-recovered", refresh);
    };
  }, [role, load]);

  useEffect(() => {
    if (role !== "MANAGER") return;
    let launcher = null;

    const ensure = () => {
      const summary = document.querySelector(".manager-cash-panel .manager-cash-summary");
      if (!summary) return;
      const panel = summary.closest(".manager-cash-panel");
      const existing = panel?.querySelector('[data-manager-owner-settlement-launcher="true"]');
      if (existing) {
        launcher = existing;
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.managerOwnerSettlementLauncher = "true";
      button.className = "manager-owner-launcher";
      button.innerHTML = `
        <span class="manager-owner-launcher-icon" aria-hidden="true">↗</span>
        <span class="manager-owner-launcher-copy">
          <small>SETORAN AKHIR</small>
          <strong>Setor ke Owner / Bank</strong>
          <em>Tanggung jawab selesai setelah Owner mengonfirmasi</em>
        </span>
        <span class="manager-owner-launcher-amount">Buka</span>
      `;
      button.addEventListener("click", () => {
        setOpen(true);
        setError("");
        setSuccess("");
        load();
      });
      summary.insertAdjacentElement("afterend", button);
      launcher = button;
    };

    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      launcher?.remove();
    };
  }, [role, load]);

  useEffect(() => {
    if (role !== "MANAGER") return;
    const launcher = document.querySelector('[data-manager-owner-settlement-launcher="true"]');
    if (!launcher) return;
    const amountNode = launcher.querySelector(".manager-owner-launcher-amount");
    const available = Number(state?.summary?.available_amount || 0);
    const pending = Number(state?.summary?.pending_amount || 0);
    if (amountNode) {
      amountNode.textContent = available > 0
        ? money(available)
        : pending > 0
          ? `${money(pending)} pending`
          : "Buka";
    }
    launcher.classList.toggle("has-pending", pending > 0);
    launcher.classList.toggle("is-open", open);
  }, [role, state, open]);

  useEffect(() => {
    if (role !== "OWNER") return;
    let navButton = null;

    const ensure = () => {
      const nav = document.querySelector("header.top nav");
      if (!nav) return;
      const existing = nav.querySelector('[data-owner-cash-settlement-nav="true"]');
      if (existing) {
        navButton = existing;
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.ownerCashSettlementNav = "true";
      button.className = "owner-cash-settlement-nav";
      button.innerHTML = '<span class="owner-cash-settlement-icon" aria-hidden="true">Rp</span><span>Setoran Kas</span><em hidden></em>';
      button.addEventListener("click", () => {
        setOpen(true);
        setError("");
        setSuccess("");
        load();
      });

      const before = [...nav.querySelectorAll("button")].find((node) =>
        /Audit log|Staf|Keluar/i.test(node.textContent || ""),
      );
      nav.insertBefore(button, before || null);
      navButton = button;
    };

    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      navButton?.remove();
    };
  }, [role, load]);

  useEffect(() => {
    if (role !== "OWNER") return;
    const button = document.querySelector('[data-owner-cash-settlement-nav="true"]');
    if (!button) return;
    button.classList.toggle("active", open);
    const badge = button.querySelector("em");
    const count = Number(state?.summary?.pending_count || 0);
    if (badge) {
      badge.textContent = count > 0 ? String(count) : "";
      badge.hidden = count < 1;
    }
  }, [role, open, state]);

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

  useEffect(() => {
    if (!open || role !== "MANAGER") return;
    setSubmittedAmount(String(Number(state?.summary?.available_amount || 0)));
  }, [open, role, state?.summary?.available_amount]);

  const ownerPending = role === "OWNER" ? state?.pending || [] : [];
  const selected = useMemo(
    () => ownerPending.find((item) => String(item.id) === String(selectedId)) || null,
    [ownerPending, selectedId],
  );

  useEffect(() => {
    if (selected)
      setOwnerReceived(String(Number(selected.submitted_amount || 0)));
    else setOwnerReceived("");
  }, [selectedId, selected?.submitted_amount]);

  const submitManager = async () => {
    if (busy || role !== "MANAGER") return;
    const actual = Number(submittedAmount);
    const expected = Number(state?.summary?.available_amount || 0);
    setError("");
    setSuccess("");

    if (expected < 1) {
      setError("Tidak ada Kas Manager baru yang siap disetorkan.");
      return;
    }
    if (!Number.isSafeInteger(actual) || actual < 0) {
      setError("Masukkan nominal setoran yang benar.");
      return;
    }
    if (actual < expected) {
      setError(`Setoran kurang ${money(expected - actual)}. Setoran tidak dapat diajukan.`);
      return;
    }
    if (destination === "BANK" && bankReference.trim().length < 3) {
      setError("Isi nomor referensi/setoran Bank terlebih dahulu.");
      return;
    }

    setBusy(true);
    try {
      const result = await request({
        action: "SUBMIT",
        destination,
        submittedAmount: actual,
        bankReference: destination === "BANK" ? bankReference.trim() : "",
      });
      setSuccess(
        `${result.settlement.settlement_number} diajukan ke ${destination === "BANK" ? "Bank" : "Owner"}. Menunggu konfirmasi Owner.`,
      );
      setBankReference("");
      window.dispatchEvent(new CustomEvent("warkost:manager-owner-settlement-submitted"));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyOwner = async () => {
    if (!selected || busy || role !== "OWNER") return;
    const actual = Number(ownerReceived);
    const expected = Number(selected.submitted_amount || 0);
    setError("");
    setSuccess("");

    if (!Number.isSafeInteger(actual) || actual < 0) {
      setError("Masukkan nominal yang benar-benar diterima/dikonfirmasi.");
      return;
    }
    if (actual < expected) {
      setError(`Nominal kurang ${money(expected - actual)}. Konfirmasi diblokir.`);
      return;
    }

    setBusy(true);
    try {
      const result = await request({
        action: "VERIFY",
        settlementId: selected.id,
        receivedAmount: actual,
      });
      setSuccess(
        `${result.settlement.settlement_number} selesai. ${money(actual)} telah dikonfirmasi Owner.`,
      );
      window.dispatchEvent(new CustomEvent("warkost:manager-owner-settlement-verified"));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rejectOwner = async () => {
    if (!selected || busy || role !== "OWNER") return;
    const confirmed = window.confirm(
      `Kembalikan ${selected.settlement_number} ke Manager untuk koreksi?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await request({
        action: "REJECT",
        settlementId: selected.id,
        reason: "Dikembalikan Owner untuk koreksi nominal/referensi",
      });
      setSuccess(`${result.settlement.settlement_number} dikembalikan ke Manager untuk koreksi.`);
      window.dispatchEvent(new CustomEvent("warkost:manager-owner-settlement-verified"));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!role) return null;

  const managerAvailable = Number(state?.summary?.available_amount || 0);
  const managerSubmitted = Number(submittedAmount || 0);
  const managerVariance = managerSubmitted - managerAvailable;
  const ownerSubmitted = Number(selected?.submitted_amount || 0);
  const ownerActual = Number(ownerReceived || 0);
  const ownerVariance = ownerActual - ownerSubmitted;

  return (
    <>
      {open &&
        createPortal(
          <div
            className="manager-owner-overlay"
            role="presentation"
            onMouseDown={(event) =>
              event.target === event.currentTarget && !busy && setOpen(false)
            }
          >
            <section
              className={`manager-owner-panel ${role === "OWNER" ? "owner-mode" : "manager-mode"}`}
              role="dialog"
              aria-modal="true"
              aria-label={role === "OWNER" ? "Setoran Manager ke Owner" : "Setoran Kas Manager"}
            >
              <header className="manager-owner-header">
                <div>
                  <small>{role === "OWNER" ? "OWNER CASH CONTROL" : "MANAGER CASH CONTROL"}</small>
                  <h2>{role === "OWNER" ? "Setoran Manager" : "Setor Kas Manager"}</h2>
                  <p>
                    {role === "OWNER"
                      ? "Konfirmasi uang fisik atau setoran Bank sebelum tanggung jawab Manager ditutup."
                      : "Setorkan seluruh kas yang sudah diverifikasi ke Owner atau Bank."}
                  </p>
                </div>
                <button
                  type="button"
                  className="manager-owner-close"
                  aria-label="Tutup"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                />
              </header>

              {error && <div className="manager-owner-feedback error">{error}</div>}
              {success && <div className="manager-owner-feedback success">✓ {success}</div>}

              {loading && !state ? (
                <div className="manager-owner-empty">Memuat setoran…</div>
              ) : role === "MANAGER" ? (
                <div className="manager-owner-manager-body">
                  <div className="manager-owner-summary">
                    <article>
                      <span>Kas siap disetor</span>
                      <strong>{money(state?.summary?.available_amount)}</strong>
                      <small>{state?.summary?.available_count || 0} setoran Admin</small>
                    </article>
                    <article className={Number(state?.summary?.pending_amount || 0) > 0 ? "waiting" : ""}>
                      <span>Menunggu Owner</span>
                      <strong>{money(state?.summary?.pending_amount)}</strong>
                      <small>{state?.summary?.pending_count || 0} pengajuan</small>
                    </article>
                  </div>

                  <section className="manager-owner-form-card">
                    <div className="manager-owner-section-head">
                      <div>
                        <small>TUJUAN SETORAN</small>
                        <h3>Pilih jalur penyerahan</h3>
                      </div>
                      <span className="manager-owner-lock-note">Semua kas aktif ikut disetor</span>
                    </div>

                    <div className="manager-owner-destination" role="group" aria-label="Tujuan setoran">
                      <button
                        type="button"
                        className={destination === "OWNER" ? "active" : ""}
                        onClick={() => {
                          setDestination("OWNER");
                          setError("");
                        }}
                        disabled={busy}
                      >
                        <span className="destination-icon">⌂</span>
                        <span><strong>Owner</strong><small>Serahkan uang fisik</small></span>
                      </button>
                      <button
                        type="button"
                        className={destination === "BANK" ? "active" : ""}
                        onClick={() => {
                          setDestination("BANK");
                          setError("");
                        }}
                        disabled={busy}
                      >
                        <span className="destination-icon">▣</span>
                        <span><strong>Bank</strong><small>Setor/transfer lalu catat referensi</small></span>
                      </button>
                    </div>

                    <label>
                      {destination === "BANK" ? "Nominal yang disetor ke Bank" : "Uang fisik yang diserahkan ke Owner"}
                      <div className="manager-owner-money-input">
                        <span>Rp</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={submittedAmount}
                          disabled={busy || managerAvailable < 1}
                          onChange={(event) => setSubmittedAmount(event.target.value)}
                        />
                      </div>
                    </label>

                    {destination === "BANK" && (
                      <label>
                        Nomor referensi / bukti setoran Bank
                        <input
                          className="manager-owner-reference"
                          value={bankReference}
                          disabled={busy}
                          maxLength={120}
                          placeholder="Contoh: BCA-111026-001"
                          onChange={(event) => setBankReference(event.target.value)}
                        />
                      </label>
                    )}

                    {managerAvailable > 0 && (
                      managerVariance < 0 ? (
                        <div className="manager-owner-variance short">
                          Kurang {money(Math.abs(managerVariance))} · pengajuan diblokir
                        </div>
                      ) : managerVariance > 0 ? (
                        <div className="manager-owner-variance over">
                          Lebih {money(managerVariance)} · boleh disetor dan dicatat
                        </div>
                      ) : (
                        <div className="manager-owner-variance match">Nominal cocok · siap diajukan</div>
                      )
                    )}

                    <div className="manager-owner-custody-note">
                      <span aria-hidden="true">i</span>
                      <p><strong>Tanggung jawab tetap di Manager.</strong> Kas baru dianggap selesai setelah Owner mengonfirmasi penerimaan atau mutasi Bank.</p>
                    </div>

                    <button
                      type="button"
                      className="manager-owner-primary"
                      disabled={
                        busy ||
                        managerAvailable < 1 ||
                        managerSubmitted < managerAvailable ||
                        (destination === "BANK" && bankReference.trim().length < 3)
                      }
                      onClick={submitManager}
                    >
                      {busy
                        ? "Mengajukan…"
                        : destination === "BANK"
                          ? "Ajukan Setoran Bank"
                          : "Ajukan Setoran ke Owner"}
                    </button>
                  </section>

                  {!!state?.pending?.length && (
                    <section className="manager-owner-pending-list">
                      <div className="manager-owner-section-head compact">
                        <div>
                          <small>MENUNGGU KONFIRMASI</small>
                          <h3>{state.pending.length} pengajuan</h3>
                        </div>
                      </div>
                      {state.pending.map((item) => (
                        <article key={item.id}>
                          <span className="pending-destination">{item.destination === "BANK" ? "BANK" : "OWNER"}</span>
                          <div>
                            <strong>{item.settlement_number}</strong>
                            <small>{dateTime(item.submitted_at)} · {item.items.length} setoran Admin</small>
                            {item.bank_reference && <small>Ref: {item.bank_reference}</small>}
                          </div>
                          <b>{money(item.submitted_amount)}</b>
                        </article>
                      ))}
                    </section>
                  )}

                  {!!state?.recent?.length && (
                    <section className="manager-owner-recent">
                      <small>RIWAYAT TERBARU</small>
                      {state.recent.map((item) => (
                        <div key={item.id}>
                          <span>
                            <strong>{item.settlement_number}</strong>
                            <small>{item.status === "VERIFIED" ? "Dikonfirmasi Owner" : "Dikembalikan Owner"} · {dateTime(item.verified_at || item.rejected_at)}</small>
                          </span>
                          <b>{money(item.owner_received_amount ?? item.submitted_amount)}</b>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              ) : (
                <div className="manager-owner-owner-body">
                  <div className="manager-owner-summary">
                    <article className={Number(state?.summary?.pending_amount || 0) > 0 ? "waiting" : ""}>
                      <span>Menunggu konfirmasi</span>
                      <strong>{money(state?.summary?.pending_amount)}</strong>
                      <small>{state?.summary?.pending_count || 0} setoran Manager</small>
                    </article>
                    <article>
                      <span>Sudah diselesaikan</span>
                      <strong>{money(state?.summary?.settled_amount)}</strong>
                      <small>{state?.summary?.settled_count || 0} setoran terverifikasi</small>
                    </article>
                  </div>

                  {ownerPending.length ? (
                    <div className="manager-owner-owner-grid">
                      <aside>
                        <small>MENUNGGU OWNER</small>
                        {ownerPending.map((item) => (
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
                              <strong>{item.manager_name}</strong>
                              <small>{item.settlement_number} · {item.destination}</small>
                            </span>
                            <b>{money(item.submitted_amount)}</b>
                          </button>
                        ))}
                      </aside>

                      {selected && (
                        <section className="manager-owner-owner-detail">
                          <div className="manager-owner-detail-head">
                            <div>
                              <small>{selected.destination === "BANK" ? "SETORAN BANK" : "SETORAN TUNAI"}</small>
                              <h3>{selected.manager_name}</h3>
                              <p>{selected.settlement_number} · {dateTime(selected.submitted_at)}</p>
                            </div>
                            <span className={`manager-owner-destination-badge ${selected.destination.toLowerCase()}`}>
                              {selected.destination === "BANK" ? "BANK" : "OWNER"}
                            </span>
                          </div>

                          <dl>
                            <div><dt>Kas sistem Manager</dt><dd>{money(selected.expected_amount)}</dd></div>
                            <div><dt>Diajukan Manager</dt><dd>{money(selected.submitted_amount)}</dd></div>
                            {selected.manager_overage_amount > 0 && (
                              <div className="overage"><dt>Kelebihan Manager</dt><dd>+{money(selected.manager_overage_amount)}</dd></div>
                            )}
                            {selected.destination === "BANK" && (
                              <div><dt>Referensi Bank</dt><dd>{selected.bank_reference || "—"}</dd></div>
                            )}
                          </dl>

                          <div className="manager-owner-source-box">
                            <small>SUMBER KAS</small>
                            {selected.items.map((item) => (
                              <div key={item.admin_settlement_id}>
                                <span><strong>{item.operator_name}</strong><small>{item.slip_number}</small></span>
                                <b>{money(item.amount)}</b>
                              </div>
                            ))}
                          </div>

                          <div className={`manager-owner-owner-check ${selected.destination === "BANK" ? "bank" : "cash"}`}>
                            <span aria-hidden="true">{selected.destination === "BANK" ? "▣" : "Rp"}</span>
                            <p>
                              <strong>{selected.destination === "BANK" ? "Cek mutasi rekening" : "Hitung uang fisik"}</strong>
                              {selected.destination === "BANK"
                                ? "Pastikan nominal dan referensi benar-benar masuk ke rekening sebelum konfirmasi."
                                : "Pastikan uang yang diterima sesuai sebelum tanggung jawab Manager ditutup."}
                            </p>
                          </div>

                          <label>
                            {selected.destination === "BANK" ? "Nominal yang terkonfirmasi masuk Bank" : "Uang fisik yang diterima Owner"}
                            <div className="manager-owner-money-input">
                              <span>Rp</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={ownerReceived}
                                disabled={busy}
                                onChange={(event) => setOwnerReceived(event.target.value)}
                              />
                            </div>
                          </label>

                          {ownerVariance < 0 ? (
                            <div className="manager-owner-variance short">
                              Kurang {money(Math.abs(ownerVariance))} · tidak dapat dikonfirmasi
                            </div>
                          ) : ownerVariance > 0 ? (
                            <div className="manager-owner-variance over">
                              Lebih {money(ownerVariance)} · boleh diterima dan dicatat
                            </div>
                          ) : (
                            <div className="manager-owner-variance match">Nominal cocok · siap dikonfirmasi</div>
                          )}

                          <button
                            type="button"
                            className="manager-owner-primary"
                            disabled={busy || ownerActual < ownerSubmitted}
                            onClick={verifyOwner}
                          >
                            {busy
                              ? "Memproses…"
                              : selected.destination === "BANK"
                                ? "Konfirmasi Masuk Bank"
                                : "Konfirmasi Uang Diterima"}
                          </button>
                          <button
                            type="button"
                            className="manager-owner-reject"
                            disabled={busy}
                            onClick={rejectOwner}
                          >
                            Kembalikan untuk Koreksi
                          </button>
                        </section>
                      )}
                    </div>
                  ) : (
                    <div className="manager-owner-empty success-empty">
                      <strong>✓ Tidak ada setoran menunggu</strong>
                      <span>Pengajuan Manager berikutnya akan muncul otomatis di sini.</span>
                    </div>
                  )}

                  {!!state?.recent?.length && (
                    <section className="manager-owner-recent owner-recent">
                      <small>RIWAYAT TERBARU</small>
                      {state.recent.map((item) => (
                        <div key={item.id}>
                          <span>
                            <strong>{item.manager_name} · {item.settlement_number}</strong>
                            <small>{item.status === "VERIFIED" ? "Selesai" : "Dikembalikan"} · {item.destination} · {dateTime(item.verified_at || item.rejected_at)}</small>
                          </span>
                          <b>{money(item.owner_received_amount ?? item.submitted_amount)}</b>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
