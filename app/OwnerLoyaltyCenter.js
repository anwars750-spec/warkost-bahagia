"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const number = (value) => Number(value || 0);
const pct = (value) => `${number(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

const dateLabel = (value) => {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${raw}T12:00:00+07:00`));
};

const periodLabel = (period) => {
  if (!period?.from) return "—";
  return period.from === period.to
    ? dateLabel(period.from)
    : `${dateLabel(period.from)} – ${dateLabel(period.to)}`;
};

const rewardLabel = (rule) =>
  rule.reward_type === "PERCENT"
    ? `${number(rule.reward_value)}%`
    : money(rule.reward_value);

function ownerSignature() {
  return Boolean(
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ),
  );
}

function findLegacyLoyaltyPanel() {
  return [...document.querySelectorAll("main > section.panel")].find((node) =>
    node.querySelector("h2")?.textContent?.trim().toLowerCase() ===
    "loyalty reward",
  );
}

function Insight({ item }) {
  return (
    <article className={`olc-insight ${item.type || "neutral"}`}>
      <span aria-hidden="true">
        {item.type === "positive" ? "✓" : item.type === "warning" ? "!" : "•"}
      </span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.text}</p>
      </div>
    </article>
  );
}

function emptyEditor() {
  return {
    id: null,
    name: "",
    pointsRequired: 20,
    rewardType: "FIXED",
    rewardValue: 10000,
    minimumOrder: 0,
    maximumDiscount: "",
    active: true,
  };
}

function ruleToEditor(rule) {
  return {
    id: rule.id,
    name: rule.name,
    pointsRequired: rule.points_required,
    rewardType: rule.reward_type,
    rewardValue: rule.reward_value,
    minimumOrder: rule.minimum_order,
    maximumDiscount:
      rule.maximum_discount === null ? "" : rule.maximum_discount,
    active: Boolean(rule.active),
  };
}

export default function OwnerLoyaltyCenter() {
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[data-owner-loyalty-legacy="true"]')
        .forEach((node) => {
          node.hidden = false;
          delete node.dataset.ownerLoyaltyLegacy;
        });
      document.getElementById("owner-loyalty-center-host")?.remove();
      document.body.classList.remove("owner-loyalty-center-active");
      setHost(null);
      setVisible(false);
    };

    const sync = () => {
      const legacy = findLegacyLoyaltyPanel();
      if (!legacy || !ownerSignature()) {
        if (!legacy) cleanup();
        return;
      }
      legacy.dataset.ownerLoyaltyLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-loyalty-center-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-loyalty-center-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      document.body.classList.add("owner-loyalty-center-active");
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

  const query = useMemo(() => {
    const params = new URLSearchParams({ preset });
    if (preset === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    return params.toString();
  }, [preset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!visible) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setError("Pilih rentang tanggal custom yang valid.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/owner-loyalty-report?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Gagal memuat Loyalty Performance");
      setData(result);
      if (result.period?.from && !customFrom) setCustomFrom(result.period.from);
      if (result.period?.to && !customTo) setCustomTo(result.period.to);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [visible, preset, customFrom, customTo, query]);

  useEffect(() => {
    if (visible) load();
  }, [visible, query]);

  const saveRule = async (event) => {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = {
        ...(editor.id ? { id: Number(editor.id) } : {}),
        name: editor.name,
        pointsRequired: Number(editor.pointsRequired),
        rewardType: editor.rewardType,
        rewardValue: Number(editor.rewardValue),
        minimumOrder: Number(editor.minimumOrder || 0),
        maximumDiscount:
          editor.maximumDiscount === "" ? null : Number(editor.maximumDiscount),
        active: Boolean(editor.active),
      };
      const response = await fetch("/api/loyalty-reward", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Gagal menyimpan Loyalty Reward");
      setMessage(editor.id ? "Reward berhasil diperbarui." : "Reward baru berhasil dibuat.");
      setEditor(null);
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  if (!host || !visible) return null;
  const summary = data?.summary || {};

  const content = (
    <section className="owner-loyalty-center" aria-label="Loyalty Owner Center">
      <header className="olc-hero">
        <div>
          <span>OWNER CUSTOMER RETENTION</span>
          <h1>Loyalty Performance</h1>
          <p>
            Pantau engagement member, pergerakan poin, dampak reward, dan kelola
            aturan loyalty dari satu layar.
          </p>
        </div>
        <div className="olc-hero-actions">
          <button type="button" className="olc-new" onClick={() => setEditor(emptyEditor())}>
            + Tambah Reward
          </button>
          <button type="button" onClick={load} disabled={loading}>
            ↻ {loading ? "Memuat…" : "Perbarui"}
          </button>
        </div>
      </header>

      <div className="olc-filterbar">
        <div className="olc-presets">
          {[["today", "Hari Ini"], ["7d", "7 Hari"], ["month", "Bulan Ini"], ["custom", "Custom"]].map(([key, label]) => (
            <button key={key} type="button" className={preset === key ? "active" : ""} onClick={() => setPreset(key)}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="olc-custom-range">
            <label>Dari<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
            <label>Sampai<input type="date" min={customFrom} value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
          </div>
        )}
        <strong>{periodLabel(data?.period)}</strong>
      </div>

      {error && <div className="olc-feedback error">{error}</div>}
      {message && <div className="olc-feedback success">{message}</div>}
      {loading && !data && <div className="olc-feedback">Menyusun Loyalty Performance…</div>}

      {data && (
        <>
          <section className="olc-kpis">
            <article><span>Member Loyalty</span><strong>{number(summary.members)}</strong><small>{number(summary.active_members)} aktif di periode</small></article>
            <article><span>Poin Beredar</span><strong>{number(summary.outstanding_points).toLocaleString("id-ID")}</strong><small>rata-rata {number(summary.average_balance).toLocaleString("id-ID")} poin/member</small></article>
            <article><span>Poin Diperoleh</span><strong>+{number(summary.earned_points).toLocaleString("id-ID")}</strong><small>{number(summary.earn_events)} earn event</small></article>
            <article><span>Poin Ditukar</span><strong>−{number(summary.redeemed_points).toLocaleString("id-ID")}</strong><small>{number(summary.redeem_events)} redemption</small></article>
            <article><span>Revenue Loyalty</span><strong>{money(summary.loyalty_revenue)}</strong><small>{number(summary.paid_orders)} order berbayar</small></article>
            <article className={number(summary.loyalty_discount) ? "attention" : ""}><span>Discount Loyalty</span><strong>{money(summary.loyalty_discount)}</strong><small>{pct(summary.discount_to_revenue)} dari revenue loyalty</small></article>
          </section>

          <section className="olc-section">
            <div className="olc-section-head">
              <div><span>LOYALTY HEALTH</span><h2>Apakah member menggunakan loyalty?</h2></div>
              <small>Saldo poin tidak sama dengan liabilitas rupiah langsung.</small>
            </div>
            <div className="olc-health-grid">
              <article><b>{number(summary.active_rules)}</b><span>Reward aktif</span></article>
              <article><b>{number(summary.active_members)}</b><span>Member aktif</span></article>
              <article><b>{pct(summary.point_usage_ratio)}</b><span>Rasio poin ditukar vs diperoleh</span></article>
              <article><b>{money(summary.loyalty_aov)}</b><span>AOV order loyalty</span></article>
            </div>
          </section>

          <section className="olc-section">
            <div className="olc-section-head">
              <div><span>REWARD PERFORMANCE</span><h2>Reward mana yang benar-benar dipakai?</h2></div>
              <small>Data berdasarkan order PAID yang memakai Loyalty Reward.</small>
            </div>
            <div className="olc-rules">
              {(data.rules || []).map((rule) => (
                <article key={rule.id} className={rule.active ? "" : "inactive"}>
                  <div className="olc-rule-main">
                    <span className={`olc-status ${rule.active ? "active" : "inactive"}`}>
                      {rule.active ? "AKTIF" : "NONAKTIF"}
                    </span>
                    <h3>{rule.name}</h3>
                    <strong>{rule.points_required} poin → {rewardLabel(rule)}</strong>
                    <small>
                      Minimum {money(rule.minimum_order)} · Maks. diskon {rule.maximum_discount === null ? "tanpa batas" : money(rule.maximum_discount)}
                    </small>
                  </div>
                  <div className="olc-rule-stats">
                    <span><b>{rule.period_paid_orders}</b> order</span>
                    <span><b>{money(rule.period_revenue)}</b> revenue</span>
                    <span><b>{money(rule.period_discount)}</b> discount</span>
                    <span><b>{rule.period_points_redeemed}</b> poin</span>
                  </div>
                  <button type="button" onClick={() => setEditor(ruleToEditor(rule))}>Atur Reward</button>
                </article>
              ))}
              {!data.rules?.length && <div className="olc-empty">Belum ada Loyalty Reward. Buat reward pertama untuk mulai.</div>}
            </div>
          </section>

          <section className="olc-section">
            <div className="olc-section-head">
              <div><span>MEMBER ENGAGEMENT</span><h2>Member loyalty paling aktif</h2></div>
              <small>Ranking berdasarkan poin yang pernah diperoleh.</small>
            </div>
            <div className="olc-member-wrap">
              <table>
                <thead><tr><th>Member</th><th>Saldo</th><th>Diperoleh</th><th>Ditukar</th><th>Aktivitas terakhir</th></tr></thead>
                <tbody>
                  {(data.members || []).map((member) => (
                    <tr key={member.id}>
                      <td><strong>{member.name}</strong><small>{member.email}</small></td>
                      <td>{member.balance.toLocaleString("id-ID")} poin</td>
                      <td>{member.earned_points.toLocaleString("id-ID")}</td>
                      <td>{member.redeemed_points.toLocaleString("id-ID")}</td>
                      <td>{member.last_activity ? dateLabel(member.last_activity) : "—"}</td>
                    </tr>
                  ))}
                  {!data.members?.length && <tr><td colSpan="5" className="olc-empty-cell">Belum ada member dengan aktivitas loyalty.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="olc-section">
            <div className="olc-section-head"><div><span>OWNER INSIGHTS</span><h2>Apa yang perlu diperhatikan?</h2></div></div>
            <div className="olc-insights">
              {(data.insights || []).map((item, index) => <Insight key={`${item.title}-${index}`} item={item} />)}
            </div>
            <p className="olc-note"><strong>Catatan:</strong> {data.note}</p>
          </section>
        </>
      )}

      {editor && createPortal(
        <div className="olc-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditor(null);
        }}>
          <section className="olc-modal" role="dialog" aria-modal="true" aria-label={editor.id ? "Edit Loyalty Reward" : "Tambah Loyalty Reward"}>
            <header>
              <div><span>LOYALTY RULE</span><h2>{editor.id ? "Atur Reward" : "Tambah Reward"}</h2></div>
              <button type="button" aria-label="Tutup" disabled={saving} onClick={() => setEditor(null)}>×</button>
            </header>
            <form onSubmit={saveRule}>
              <label>Nama reward<input required minLength="2" maxLength="100" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></label>
              <div className="olc-form-grid">
                <label>Poin dibutuhkan<input required type="number" min="1" value={editor.pointsRequired} onChange={(e) => setEditor({ ...editor, pointsRequired: e.target.value })} /></label>
                <label>Tipe reward<select value={editor.rewardType} onChange={(e) => setEditor({ ...editor, rewardType: e.target.value })}><option value="FIXED">Potongan nominal</option><option value="PERCENT">Persentase</option></select></label>
                <label>Nilai reward<input required type="number" min="1" max={editor.rewardType === "PERCENT" ? 100 : undefined} value={editor.rewardValue} onChange={(e) => setEditor({ ...editor, rewardValue: e.target.value })} /></label>
                <label>Minimum belanja<input required type="number" min="0" value={editor.minimumOrder} onChange={(e) => setEditor({ ...editor, minimumOrder: e.target.value })} /></label>
                <label>Maksimum diskon<input type="number" min="0" placeholder="Kosong = tanpa batas" value={editor.maximumDiscount} onChange={(e) => setEditor({ ...editor, maximumDiscount: e.target.value })} /></label>
              </div>
              <label className="olc-switch"><input type="checkbox" checked={editor.active} onChange={(e) => setEditor({ ...editor, active: e.target.checked })} /><span>Reward aktif dan dapat dipilih customer</span></label>
              <div className="olc-modal-actions">
                <button type="button" disabled={saving} onClick={() => setEditor(null)}>Batal</button>
                <button className="primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Reward"}</button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );

  return createPortal(content, host);
}
