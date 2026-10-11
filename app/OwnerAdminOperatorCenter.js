"use client";

import { useCallback, useEffect, useState } from "react";

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

  useEffect(() => {
    let alive = true;
    let checking = false;

    const detectOwner = async () => {
      if (checking) return;
      const buttons = [...document.querySelectorAll("header.top nav button")];
      const hasOwnerNav =
        buttons.some((button) => button.textContent?.trim() === "Staf") &&
        buttons.some((button) => button.textContent?.trim() === "Audit log");
      if (hasOwnerNav) {
        if (alive) setIsOwner(true);
        return;
      }

      checking = true;
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json();
        if (alive) setIsOwner(data.user?.role === "OWNER");
      } catch {
        if (alive) setIsOwner(false);
      } finally {
        checking = false;
      }
    };

    detectOwner();
    const observer = new MutationObserver(detectOwner);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    load();
  }, [isOwner, load]);

  useEffect(() => {
    if (!isOwner) return;
    let navButton = null;
    const ensureButton = () => {
      const nav = document.querySelector("header.top nav");
      if (!nav) return;
      const existing = nav.querySelector('[data-owner-nav="AdminOperator"]');
      if (existing) {
        navButton = existing;
        return;
      }
      const staffButton = [...nav.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Staf",
      );
      if (!staffButton) return;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.ownerNav = "AdminOperator";
      button.className = "owner-admin-operator-nav";
      button.innerHTML = '<span aria-hidden="true">⌁</span><span>Operator Admin</span>';
      button.addEventListener("click", () => {
        setOpen(true);
        setSuccess("");
        setError("");
        load();
      });
      nav.insertBefore(button, staffButton);
      navButton = button;
    };

    ensureButton();
    const observer = new MutationObserver(ensureButton);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      navButton?.remove();
    };
  }, [isOwner, load]);

  useEffect(() => {
    const button = document.querySelector('[data-owner-nav="AdminOperator"]');
    if (button) button.classList.toggle("owner-admin-operator-nav-active", open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [open]);

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

  if (!isOwner || !open) return null;

  return (
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
          <div>
            <small>OWNER CONTROL</small>
            <h2>Operator Admin</h2>
            <p>Owner menentukan siapa yang boleh membuka shift Admin dan PIN-nya.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup">
            ×
          </button>
        </header>

        {error && <div className="owner-operator-feedback error">{error}</div>}
        {success && <div className="owner-operator-feedback success">✓ {success}</div>}

        <div className="owner-operator-body">
          <section className="owner-operator-create">
            <div>
              <small>TAMBAH OPERATOR</small>
              <h3>Daftarkan petugas Admin</h3>
              <p>PIN hanya dipakai saat mulai shift dan tidak pernah ditampilkan kembali.</p>
            </div>
            <div className="owner-operator-form">
              <label>
                Nama operator
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contoh: Virsa"
                  autoComplete="off"
                />
              </label>
              <label>
                PIN 4-6 digit
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => setPin(cleanPin(event.target.value))}
                  placeholder="Contoh: 2580"
                  autoComplete="new-password"
                  onKeyDown={(event) => event.key === "Enter" && createOperator()}
                />
              </label>
              <button type="button" onClick={createOperator} disabled={busy}>
                {busy ? "Menyimpan…" : "Tambah Operator"}
              </button>
            </div>
          </section>

          <section className="owner-operator-list-section">
            <div className="owner-operator-section-title">
              <div>
                <small>OPERATOR TERDAFTAR</small>
                <h3>{operators.length} operator</h3>
              </div>
              <span>PIN lama tidak dapat dilihat</span>
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
                              ? "Siap digunakan"
                              : "Tidak dapat digunakan"}
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
                Belum ada operator. Tambahkan operator pertama di atas.
              </div>
            )}
          </section>
        </div>

        {resetTarget && (
          <div className="owner-operator-reset-box">
            <div>
              <small>RESET PIN</small>
              <strong>{resetTarget.name}</strong>
              <span>PIN lama tetap tersembunyi. Masukkan PIN baru.</span>
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={resetPin}
              onChange={(event) => setResetPin(cleanPin(event.target.value))}
              placeholder="PIN baru 4-6 digit"
              autoComplete="new-password"
              onKeyDown={(event) => event.key === "Enter" && saveResetPin()}
            />
            <button type="button" onClick={saveResetPin} disabled={busy}>
              Simpan PIN Baru
            </button>
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
          </div>
        )}
      </section>
    </div>
  );
}
