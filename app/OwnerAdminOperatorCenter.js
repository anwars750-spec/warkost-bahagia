"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

async function request(body) {
  const response = await fetch("/api/owner-admin-operators", {
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
    throw new Error(data.error || `Gagal memuat operator (${response.status})`);
  return data;
}

const cleanPin = (value) => String(value || "").replace(/\D/g, "").slice(0, 6);

function Icon({ name }) {
  const paths = {
    shield: "M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3ZM9 12l2 2 4-4",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    active: "M20 6 9 17l-5-5",
    shift: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    plus: "M12 5v14M5 12h14",
    key: "M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1ZM15.5 7.5l2 2L21 6l-2-2-3.5 3.5Z",
    close: "M6 6l12 12M18 6 6 18",
    refresh: "M20 11a8 8 0 0 0-15-3M4 4v5h5m11 4a8 8 0 0 1-15 3M4 20v-5h5",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={paths[name] || paths.shield} />
    </svg>
  );
}

export default function OwnerAdminOperatorCenter() {
  const [isOwner, setIsOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPin, setResetPin] = useState("");

  const load = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setOperators(data.operators || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  const openCenter = useCallback(() => {
    setOpen(true);
    setSuccess("");
    setError("");
    setResetTarget(null);
    setResetPin("");
  }, []);

  useEffect(() => {
    let alive = true;
    const detectOwner = async () => {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (alive) setIsOwner(response.ok && data.user?.role === "OWNER");
      } catch {
        if (alive) setIsOwner(false);
      }
    };
    detectOwner();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const openFromEvent = () => openCenter();
    const interceptDashboardOperator = (event) => {
      const target = event.target;
      const controlButton = target?.closest?.(".owner-control-grid-v3 > button");
      const controlLabel = controlButton
        ?.querySelector("strong")
        ?.textContent?.trim();
      const popupAction = target?.closest?.(".owner-popup-action");
      const popupLabel = popupAction?.textContent?.trim() || "";

      if (
        controlLabel !== "Operator Admin" &&
        !popupLabel.includes("Buka Operator Admin")
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      document.querySelector(".owner-popup-close")?.click();
      openCenter();
    };

    window.addEventListener("warkost:owner-open-admin-operators", openFromEvent);
    document.addEventListener("click", interceptDashboardOperator, true);
    return () => {
      window.removeEventListener("warkost:owner-open-admin-operators", openFromEvent);
      document.removeEventListener("click", interceptDashboardOperator, true);
    };
  }, [openCenter]);

  useEffect(() => {
    if (!open || !isOwner) return;
    load();
  }, [open, isOwner, load]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => {
      if (event.key !== "Escape") return;
      if (resetTarget) {
        setResetTarget(null);
        setResetPin("");
      } else {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [open, resetTarget]);

  const counts = useMemo(
    () => ({
      total: operators.length,
      active: operators.filter((operator) => operator.active).length,
      shifts: operators.filter((operator) => operator.shift_active).length,
    }),
    [operators],
  );

  const createOperator = async () => {
    if (busy) return;
    const cleanName = name.trim();
    const nextPin = cleanPin(pin);
    setError("");
    setSuccess("");
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError("Nama operator harus 2-80 karakter.");
      return;
    }
    if (!/^\d{4,6}$/.test(nextPin)) {
      setError("PIN harus 4-6 digit angka.");
      return;
    }

    setBusy(true);
    try {
      await request({ action: "CREATE", name: cleanName, pin: nextPin });
      setName("");
      setPin("");
      setSuccess(`Operator ${cleanName} berhasil dibuat.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveResetPin = async () => {
    if (!resetTarget || busy) return;
    const nextPin = cleanPin(resetPin);
    setError("");
    setSuccess("");
    if (!/^\d{4,6}$/.test(nextPin)) {
      setError("PIN baru harus 4-6 digit angka.");
      return;
    }

    setBusy(true);
    try {
      await request({
        action: "RESET_PIN",
        operatorId: resetTarget.id,
        pin: nextPin,
      });
      setSuccess(`PIN ${resetTarget.name} berhasil direset.`);
      setResetTarget(null);
      setResetPin("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (operator) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await request({
        action: "SET_ACTIVE",
        operatorId: operator.id,
        active: !operator.active,
      });
      setSuccess(
        `${operator.name} ${operator.active ? "dinonaktifkan" : "diaktifkan"}.`,
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner || !open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="owner-operator-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
    >
      <section
        className="owner-operator-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Kelola Operator Admin"
      >
        <header className="owner-operator-header">
          <div className="owner-operator-header-copy">
            <span className="owner-operator-header-icon">
              <Icon name="shield" />
            </span>
            <div>
              <small>OWNER CONTROL CENTER</small>
              <h2>Operator Admin</h2>
              <p>Kelola petugas yang berhak membuka shift Admin dan mengamankan akses dengan PIN.</p>
            </div>
          </div>
          <button
            className="owner-operator-close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup Operator Admin"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="owner-operator-summary" aria-label="Ringkasan operator">
          <article>
            <span><Icon name="users" /></span>
            <div><small>Total Operator</small><strong>{counts.total}</strong></div>
          </article>
          <article>
            <span><Icon name="active" /></span>
            <div><small>Operator Aktif</small><strong>{counts.active}</strong></div>
          </article>
          <article>
            <span><Icon name="shift" /></span>
            <div><small>Shift Aktif</small><strong>{counts.shifts}</strong></div>
          </article>
          <button type="button" className="owner-operator-refresh" onClick={load} disabled={loading || busy}>
            <Icon name="refresh" />
            {loading ? "Memuat" : "Perbarui"}
          </button>
        </div>

        {error && <div className="owner-operator-feedback error">{error}</div>}
        {success && <div className="owner-operator-feedback success">✓ {success}</div>}

        <div className="owner-operator-body">
          <aside className="owner-operator-create">
            <div className="owner-operator-create-title">
              <span className="owner-operator-create-icon"><Icon name="plus" /></span>
              <div>
                <small>TAMBAH OPERATOR</small>
                <h3>Daftarkan petugas Admin</h3>
              </div>
            </div>
            <p>Gunakan nama yang mudah dikenali. PIN hanya dipakai saat mulai shift dan tidak pernah ditampilkan kembali.</p>
            <div className="owner-operator-form">
              <label>
                <span>Nama operator</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contoh: Virsa"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>PIN 4-6 digit</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => setPin(cleanPin(event.target.value))}
                  placeholder="••••"
                  autoComplete="new-password"
                  onKeyDown={(event) => event.key === "Enter" && createOperator()}
                />
              </label>
              <button type="button" onClick={createOperator} disabled={busy}>
                <Icon name="plus" />
                {busy ? "Menyimpan…" : "Tambah Operator"}
              </button>
            </div>
            <div className="owner-operator-security-note">
              <Icon name="key" />
              <span>PIN tersimpan secara aman dan hanya bisa direset, bukan dilihat kembali.</span>
            </div>
          </aside>

          <section className="owner-operator-list-section">
            <div className="owner-operator-section-title">
              <div>
                <small>OPERATOR TERDAFTAR</small>
                <h3>Kelola akses operator</h3>
              </div>
              <span>{operators.length} operator</span>
            </div>

            {loading && !operators.length ? (
              <div className="owner-operator-empty">Memuat operator…</div>
            ) : operators.length ? (
              <div className="owner-operator-list">
                {operators.map((operator) => (
                  <article key={operator.id}>
                    <div className="owner-operator-identity">
                      <span className="owner-operator-avatar">
                        {operator.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{operator.name}</strong>
                        <small>
                          {operator.shift_active
                            ? "Sedang menjalankan shift"
                            : operator.active
                              ? "Siap digunakan untuk shift"
                              : "Akses operator dinonaktifkan"}
                        </small>
                      </div>
                    </div>
                    <div className="owner-operator-actions">
                      <span
                        className={`owner-operator-status ${
                          operator.shift_active
                            ? "shift"
                            : operator.active
                              ? "active"
                              : "inactive"
                        }`}
                      >
                        {operator.shift_active
                          ? "SHIFT AKTIF"
                          : operator.active
                            ? "AKTIF"
                            : "NONAKTIF"}
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setResetTarget(operator);
                          setResetPin("");
                          setError("");
                        }}
                        disabled={busy}
                      >
                        Reset PIN
                      </button>
                      <button
                        type="button"
                        className={operator.active ? "danger-quiet" : "secondary"}
                        onClick={() => toggleActive(operator)}
                        disabled={busy || operator.shift_active}
                      >
                        {operator.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="owner-operator-empty">
                <span className="owner-operator-empty-icon"><Icon name="users" /></span>
                <strong>Belum ada operator</strong>
                <p>Tambahkan operator pertama dari panel di sebelah kiri.</p>
              </div>
            )}
          </section>
        </div>

        {resetTarget && (
          <div
            className="owner-operator-reset-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !busy) {
                setResetTarget(null);
                setResetPin("");
              }
            }}
          >
            <section className="owner-operator-reset-box" role="dialog" aria-modal="true" aria-label={`Reset PIN ${resetTarget.name}`}>
              <button
                type="button"
                className="owner-operator-reset-close"
                onClick={() => {
                  setResetTarget(null);
                  setResetPin("");
                }}
                disabled={busy}
                aria-label="Tutup reset PIN"
              >
                <Icon name="close" />
              </button>
              <span className="owner-operator-reset-icon"><Icon name="key" /></span>
              <small>RESET PIN OPERATOR</small>
              <h3>{resetTarget.name}</h3>
              <p>PIN lama tetap tersembunyi. Masukkan PIN baru 4-6 digit untuk operator ini.</p>
              <input
                type="password"
                inputMode="numeric"
                value={resetPin}
                onChange={(event) => setResetPin(cleanPin(event.target.value))}
                placeholder="PIN baru 4-6 digit"
                autoComplete="new-password"
                autoFocus
                onKeyDown={(event) => event.key === "Enter" && saveResetPin()}
              />
              <div className="owner-operator-reset-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setResetTarget(null);
                    setResetPin("");
                  }}
                  disabled={busy}
                >
                  Batal
                </button>
                <button type="button" onClick={saveResetPin} disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan PIN Baru"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
