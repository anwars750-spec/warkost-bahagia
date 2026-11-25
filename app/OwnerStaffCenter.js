"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ROLES = ["MANAGER", "ADMIN", "DRIVER"];
const ROLE_LABEL = { MANAGER: "Manager", ADMIN: "Admin", DRIVER: "Driver" };

function ownerSignature() {
  return Boolean(
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ),
  );
}

function findLegacyStaffPanel() {
  return [...document.querySelectorAll("main > section.panel")].find(
    (node) =>
      node.querySelector("h2")?.textContent?.trim().toLowerCase() ===
      "kelola staf",
  );
}

function emptyStaff() {
  return {
    role: "ADMIN",
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  };
}

async function request(route, options = {}) {
  const response = await fetch(`/api/${route}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Permintaan gagal diproses");
  return result;
}

export default function OwnerStaffCenter() {
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(false);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [editor, setEditor] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[data-owner-staff-legacy="true"]')
        .forEach((node) => {
          node.hidden = false;
          delete node.dataset.ownerStaffLegacy;
        });
      document.getElementById("owner-staff-center-host")?.remove();
      document.body.classList.remove("owner-staff-center-active");
      setHost(null);
      setVisible(false);
    };

    const sync = () => {
      const legacy = findLegacyStaffPanel();
      if (!legacy || !ownerSignature()) {
        if (!legacy) cleanup();
        return;
      }
      legacy.dataset.ownerStaffLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-staff-center-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-staff-center-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      document.body.classList.add("owner-staff-center-active");
      setHost(target);
      setVisible(true);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, []);

  async function load() {
    if (!visible) return;
    setLoading(true);
    setError("");
    try {
      const result = await request("staff");
      setStaff(result.staff || []);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const counts = useMemo(() => {
    const base = { total: staff.length, MANAGER: 0, ADMIN: 0, DRIVER: 0, activeDrivers: 0 };
    for (const item of staff) {
      if (ROLES.includes(item.role)) base[item.role] += 1;
      if (item.role === "DRIVER" && Number(item.active) === 1) base.activeDrivers += 1;
    }
    return base;
  }, [staff]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((item) => {
      if (roleFilter !== "ALL" && item.role !== roleFilter) return false;
      if (!q) return true;
      return [item.name, item.email, item.phone, ROLE_LABEL[item.role]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [staff, search, roleFilter]);

  async function createStaff(event) {
    event.preventDefault();
    if (!editor) return;
    if (editor.password.length < 14) {
      setError("Password staf minimal 14 karakter.");
      return;
    }
    if (editor.password !== editor.confirmPassword) {
      setError("Konfirmasi password belum sama.");
      return;
    }
    if (editor.role === "DRIVER" && !editor.phone.trim()) {
      setError("Nomor HP wajib diisi untuk Driver.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request("staff", {
        method: "POST",
        body: JSON.stringify({
          role: editor.role,
          name: editor.name,
          email: editor.email,
          phone: editor.phone,
          password: editor.password,
        }),
      });
      setEditor(null);
      setMessage("Akun staf berhasil dibuat.");
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReset(event) {
    event.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 14) {
      setError("Password baru minimal 14 karakter.");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setError("Konfirmasi password baru belum sama.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request("staff-password", {
        method: "POST",
        body: JSON.stringify({ id: resetTarget.id, password: resetPassword }),
      });
      setResetTarget(null);
      setResetPassword("");
      setResetConfirm("");
      setMessage(`Password ${resetTarget.name} berhasil direset dan sesi lama dicabut.`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDriver(member) {
    setSaving(true);
    setError("");
    setMessage("");
    const next = Number(member.active) !== 1;
    try {
      await request("driver-active", {
        method: "POST",
        body: JSON.stringify({ id: member.id, active: next }),
      });
      setMessage(`Driver ${member.name} ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  if (!host || !visible) return null;

  const content = (
    <section className="owner-staff-center" aria-label="Owner Staff Center">
      <header className="osc-hero">
        <div>
          <span>OWNER TEAM & ACCESS</span>
          <h1>Staf & Akses</h1>
          <p>Kelola akun Manager, Admin, dan Driver dari satu layar dengan kontrol akses yang aman.</p>
        </div>
        <div className="osc-hero-actions">
          <button className="primary" type="button" onClick={() => setEditor(emptyStaff())}>+ Tambah Staf</button>
          <button type="button" onClick={load} disabled={loading}>↻ {loading ? "Memuat…" : "Perbarui"}</button>
        </div>
      </header>

      <section className="osc-kpis">
        <article><span>Total Staf</span><strong>{counts.total}</strong><small>Manager, Admin & Driver</small></article>
        <article><span>Manager</span><strong>{counts.MANAGER}</strong><small>kontrol operasional</small></article>
        <article><span>Admin</span><strong>{counts.ADMIN}</strong><small>akun staf Admin</small></article>
        <article><span>Driver</span><strong>{counts.DRIVER}</strong><small>{counts.activeDrivers} aktif</small></article>
      </section>

      {error && <div className="osc-feedback error">{error}</div>}
      {message && <div className="osc-feedback success">{message}</div>}

      <section className="osc-panel">
        <div className="osc-panel-head">
          <div><span>TEAM DIRECTORY</span><h2>Daftar staf</h2></div>
          <small>Password lama tidak pernah ditampilkan.</small>
        </div>

        <div className="osc-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, atau nomor HP…" />
          <div className="osc-role-filter">
            {["ALL", ...ROLES].map((role) => (
              <button key={role} type="button" className={roleFilter === role ? "active" : ""} onClick={() => setRoleFilter(role)}>
                {role === "ALL" ? "Semua" : ROLE_LABEL[role]}
              </button>
            ))}
          </div>
        </div>

        <div className="osc-staff-list">
          {filtered.map((member) => {
            const active = Number(member.active) === 1;
            return (
              <article key={member.id} className="osc-staff-card">
                <div className={`osc-avatar ${member.role.toLowerCase()}`}>{ROLE_LABEL[member.role]?.slice(0, 1) || "S"}</div>
                <div className="osc-staff-main">
                  <div className="osc-name-line">
                    <h3>{member.name}</h3>
                    <span className={`osc-status ${active ? "active" : "inactive"}`}>{active ? "AKTIF" : "NONAKTIF"}</span>
                  </div>
                  <strong>{ROLE_LABEL[member.role] || member.role}</strong>
                  <p>{member.email}</p>
                  <small>{member.phone || "Nomor HP belum diisi"}</small>
                </div>
                <div className="osc-staff-actions">
                  {["MANAGER", "ADMIN"].includes(member.role) && (
                    <button type="button" onClick={() => { setResetTarget(member); setResetPassword(""); setResetConfirm(""); setError(""); }}>Reset Password</button>
                  )}
                  {member.role === "DRIVER" && (
                    <button type="button" className={active ? "danger" : "primary"} disabled={saving} onClick={() => toggleDriver(member)}>
                      {active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!filtered.length && <div className="osc-empty">Tidak ada staf yang sesuai filter.</div>}
        </div>
      </section>

      <section className="osc-security-note">
        <strong>Kontrol keamanan</strong>
        <p>Reset password Manager/Admin mencabut sesi lama. Driver yang masih memiliki pengantaran aktif tidak dapat dinonaktifkan.</p>
      </section>

      {editor && createPortal(
        <div className="osc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null); }}>
          <section className="osc-modal" role="dialog" aria-modal="true" aria-label="Tambah staf">
            <header><div><span>STAFF ACCOUNT</span><h2>Tambah Staf</h2><p>Buat akun operasional baru dengan role yang sesuai.</p></div><button type="button" aria-label="Tutup" disabled={saving} onClick={() => setEditor(null)}>×</button></header>
            <form onSubmit={createStaff}>
              <label>Role<select value={editor.role} onChange={(event) => setEditor({ ...editor, role: event.target.value })}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
              <label>Nama lengkap<input required minLength="2" maxLength="80" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
              <label>Email<input required type="email" value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} /></label>
              <label>Nomor HP {editor.role === "DRIVER" ? "*" : "(opsional)"}<input required={editor.role === "DRIVER"} value={editor.phone} onChange={(event) => setEditor({ ...editor, phone: event.target.value })} placeholder="08xxxxxxxxxx" /></label>
              <div className="osc-form-grid">
                <label>Password<input required type="password" minLength="14" value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} /></label>
                <label>Konfirmasi password<input required type="password" minLength="14" value={editor.confirmPassword} onChange={(event) => setEditor({ ...editor, confirmPassword: event.target.value })} /></label>
              </div>
              <p className="osc-form-note">Minimal 14 karakter. Password tidak akan ditampilkan lagi setelah akun dibuat.</p>
              <div className="osc-modal-actions"><button type="button" disabled={saving} onClick={() => setEditor(null)}>Batal</button><button className="primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat Akun"}</button></div>
            </form>
          </section>
        </div>, document.body,
      )}

      {resetTarget && createPortal(
        <div className="osc-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setResetTarget(null); }}>
          <section className="osc-modal compact" role="dialog" aria-modal="true" aria-label="Reset password staf">
            <header><div><span>SECURITY ACCESS</span><h2>Reset Password</h2><p>{resetTarget.name} · {ROLE_LABEL[resetTarget.role]}</p></div><button type="button" aria-label="Tutup" disabled={saving} onClick={() => setResetTarget(null)}>×</button></header>
            <form onSubmit={saveReset}>
              <label>Password baru<input required type="password" minLength="14" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
              <label>Konfirmasi password<input required type="password" minLength="14" value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} /></label>
              <p className="osc-form-note">Setelah reset berhasil, seluruh sesi lama akun ini akan dicabut.</p>
              <div className="osc-modal-actions"><button type="button" disabled={saving} onClick={() => setResetTarget(null)}>Batal</button><button className="primary" disabled={saving}>{saving ? "Mereset…" : "Reset Password"}</button></div>
            </form>
          </section>
        </div>, document.body,
      )}
    </section>
  );

  return createPortal(content, host);
}
