"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ROLE_LABEL = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ADMIN: "Admin",
  DRIVER: "Driver",
  KITCHEN: "Kitchen",
  CUSTOMER: "Customer",
  SYSTEM: "Sistem",
};

const CATEGORY_LABEL = {
  ALL: "Semua",
  FINANCE: "Kas & Keuangan",
  ACCESS: "Staf & Akses",
  OPERATIONS: "Produk & Stok",
  PROMO: "Promo & Loyalty",
  SETTINGS: "Pengaturan",
  SYSTEM: "Sistem",
};

function ownerSignature() {
  return Boolean(
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ),
  );
}

function findLegacyAuditPanel() {
  return [...document.querySelectorAll("main > section.panel")].find(
    (node) =>
      node.querySelector("h2")?.textContent?.trim().toLowerCase() === "audit log",
  );
}

async function request(route) {
  const response = await fetch(`/api/${route}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Audit tidak dapat dimuat");
  return result;
}

function parseDetails(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `Rp${Math.round(number).toLocaleString("id-ID")}`;
}

function dateTime(value) {
  if (!value) return "Waktu tidak tersedia";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryOf(action) {
  const code = String(action || "").toUpperCase();
  if (/SETTLEMENT|CASH|COD|PAYMENT|SHIFT/.test(code)) return "FINANCE";
  if (/STAFF|PASSWORD|DRIVER_ACTIVE|ADMIN_OPERATOR|ACCESS|SESSION/.test(code))
    return "ACCESS";
  if (/STOCK|PRODUCT|CATEGORY|SUBCATEGORY|INVENTORY/.test(code))
    return "OPERATIONS";
  if (/PROMOTION|PROMO|VOUCHER|LOYALTY|REWARD/.test(code)) return "PROMO";
  if (/SETTING|PRINTER|BRANDING/.test(code)) return "SETTINGS";
  return "SYSTEM";
}

function sensitivityOf(action) {
  const code = String(action || "").toUpperCase();
  if (/PASSWORD_RESET|REJECTED|DEACTIVATED|ACTIVE_CHANGED|SETTINGS_UPDATED/.test(code))
    return "SENSITIVE";
  if (/STOCK_ADJUSTED|SETTLEMENT_SUBMITTED|PROMOTION_EDITED|PROMOTION_SAVED|LOYALTY_REWARD_SAVED/.test(code))
    return "REVIEW";
  return "NORMAL";
}

function actorText(log) {
  const name = log.actor_name || "Sistem";
  const role = ROLE_LABEL[log.actor_role] || log.actor_role || "Sistem";
  return `${name} · ${role}`;
}

function humanFallback(action) {
  return String(action || "Aktivitas sistem")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return null;
  if (/amount|revenue|discount|fee|minimum|subtotal|total/i.test(key)) {
    const formatted = money(value);
    if (formatted) return formatted;
  }
  if (typeof value === "boolean" || value === 0 || value === 1) {
    if (/active|simulation|enabled/i.test(key)) return Boolean(value) ? "Aktif" : "Nonaktif";
  }
  if (Array.isArray(value)) return `${value.length} item`;
  if (typeof value === "object") return null;
  return String(value);
}

function detailPairs(details) {
  const preferred = [
    ["settlementNumber", "Nomor setoran"],
    ["submittedAmount", "Nominal disetor"],
    ["receivedAmount", "Nominal diterima"],
    ["expectedAmount", "Nominal seharusnya"],
    ["overageAmount", "Kelebihan"],
    ["destination", "Tujuan"],
    ["email", "Email akun"],
    ["role", "Role"],
    ["title", "Promo"],
    ["name", "Nama"],
    ["quantity", "Perubahan stok"],
    ["balance", "Stok akhir"],
    ["reason", "Alasan"],
    ["deliveryFeePerKm", "Ongkir per km"],
    ["paymentExpiryMinutes", "Batas pembayaran"],
    ["printerSimulation", "Simulasi printer"],
  ];
  const pairs = [];
  for (const [key, label] of preferred) {
    const value = displayValue(key, details[key]);
    if (value !== null) pairs.push({ label, value });
    if (pairs.length >= 4) return pairs;
  }
  for (const [key, raw] of Object.entries(details)) {
    if (["before", "after", "adminSettlementIds"].includes(key)) continue;
    if (preferred.some(([preferredKey]) => preferredKey === key)) continue;
    const value = displayValue(key, raw);
    if (value === null) continue;
    const label = key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase());
    pairs.push({ label, value });
    if (pairs.length >= 4) break;
  }
  return pairs;
}

function presentation(log) {
  const action = String(log.action || "").toUpperCase();
  const details = parseDetails(log.details);
  const actor = log.actor_name || "Sistem";
  const category = categoryOf(action);
  const sensitivity = sensitivityOf(action);
  let title = humanFallback(action);
  let summary = `${actor} melakukan perubahan pada sistem.`;
  let impact = "Aktivitas tercatat sebagai jejak audit dan tidak memerlukan tindakan khusus.";

  if (action === "STAFF_CREATED") {
    title = "Akun staf baru dibuat";
    summary = `${actor} membuat akun ${details.role || "staf"}${details.email ? ` untuk ${details.email}` : ""}.`;
    impact = "Akun baru dapat mengakses sistem sesuai hak akses role yang diberikan.";
  } else if (action === "STAFF_PASSWORD_RESET") {
    title = "Password staf direset";
    summary = `${actor} mereset password akun ${details.role || "staf"}.`;
    impact = "Seluruh sesi lama akun tersebut dicabut. Pastikan reset memang dilakukan atas kebutuhan operasional.";
  } else if (action === "DRIVER_ACTIVE_CHANGED") {
    const active = Boolean(details.active);
    title = active ? "Driver diaktifkan" : "Driver dinonaktifkan";
    summary = `${actor} ${active ? "mengaktifkan" : "menonaktifkan"} akun Driver #${details.driverId || "-"}.`;
    impact = active
      ? "Driver dapat kembali menerima tugas pengantaran."
      : "Driver tidak dapat menerima tugas baru sampai diaktifkan kembali.";
  } else if (action === "STOCK_ADJUSTED") {
    const delta = Number(details.quantity || 0);
    title = delta >= 0 ? "Stok ditambahkan" : "Stok dikurangi / disesuaikan";
    summary = `${actor} mengubah stok produk #${details.productId || "-"} sebesar ${delta > 0 ? "+" : ""}${delta}.`;
    impact = `Stok akhir menjadi ${details.balance ?? "-"}${details.reason ? `. Alasan: ${details.reason}` : ""}.`;
  } else if (action === "SETTINGS_UPDATED") {
    title = "Pengaturan operasional diperbarui";
    summary = `${actor} menyimpan perubahan konfigurasi Warkost.`;
    impact = "Perubahan ini dapat memengaruhi operasional seperti pembayaran, ongkir, kontak bisnis, atau printer.";
  } else if (action === "PROMOTION_CREATED") {
    title = "Promo baru dibuat";
    summary = `${actor} membuat promo “${details.title || `#${details.promotionId || "-"}`}”.`;
    impact = details.active ? "Promo dibuat dalam keadaan aktif." : "Promo dibuat tetapi belum diaktifkan.";
  } else if (action === "PROMOTION_EDITED") {
    title = "Promo diperbarui";
    summary = `${actor} mengubah pengaturan promo “${details.title || `#${details.promotionId || "-"}`}”.`;
    impact = "Perubahan rule promo dapat memengaruhi diskon dan transaksi customer berikutnya.";
  } else if (action === "PROMOTION_ACTIVATED") {
    title = "Promo diaktifkan";
    summary = `${actor} mengaktifkan promo “${details.title || `#${details.promotionId || "-"}`}”.`;
    impact = "Promo dapat digunakan customer selama syarat dan jadwalnya terpenuhi.";
  } else if (action === "PROMOTION_DEACTIVATED") {
    title = "Promo dinonaktifkan";
    summary = `${actor} menonaktifkan promo “${details.title || `#${details.promotionId || "-"}`}”.`;
    impact = "Customer tidak dapat memakai promo tersebut sampai diaktifkan kembali.";
  } else if (action === "PROMOTION_SAVED") {
    const after = details.after || {};
    title = "Konfigurasi promo disimpan";
    summary = `${actor} menyimpan konfigurasi ${after.title ? `promo “${after.title}”` : "promo"}.`;
    impact = "Ini adalah jejak detail perubahan promo; status aktif/nonaktif ditampilkan pada aktivitas promo terkait.";
  } else if (action === "LOYALTY_REWARD_SAVED") {
    const after = details.after || {};
    title = "Aturan Loyalty Reward disimpan";
    summary = `${actor} menyimpan reward${after.name ? ` “${after.name}”` : " loyalty"}.`;
    impact = after.active
      ? "Reward aktif dan dapat dipilih customer yang memenuhi syarat."
      : "Reward tersimpan tetapi tidak tersedia untuk customer.";
  } else if (action === "MANAGER_OWNER_SETTLEMENT_SUBMITTED") {
    title = "Manager mengajukan setoran kas";
    summary = `${actor} mengajukan ${details.settlementNumber || "setoran"} sebesar ${money(details.submittedAmount) || "nominal tidak tersedia"} ke ${details.destination === "BANK" ? "Bank" : "Owner"}.`;
    impact = "Setoran menunggu proses verifikasi berikutnya sebelum dianggap final.";
  } else if (action === "OWNER_MANAGER_SETTLEMENT_VERIFIED") {
    title = "Setoran Manager diverifikasi";
    summary = `${actor} memverifikasi ${details.settlementNumber || "setoran Manager"}${details.managerName ? ` dari ${details.managerName}` : ""}.`;
    impact = "Kas pada setoran tersebut sudah diterima/dikonfirmasi dan statusnya menjadi final.";
  } else if (action === "OWNER_MANAGER_SETTLEMENT_REJECTED") {
    title = "Setoran Manager ditolak";
    summary = `${actor} menolak ${details.settlementNumber || "setoran Manager"}${details.managerName ? ` dari ${details.managerName}` : ""}.`;
    impact = `Setoran belum final${details.reason || details.rejectReason ? `. Alasan: ${details.reason || details.rejectReason}` : ". Perlu tindak lanjut Manager dan Owner."}`;
  } else if (/SETTLEMENT.*VERIFIED|VERIFIED.*SETTLEMENT/.test(action)) {
    title = "Setoran diverifikasi";
    summary = `${actor} menyelesaikan verifikasi setoran kas.`;
    impact = "Kas terkait sudah dikonfirmasi sesuai proses settlement.";
  } else if (/SETTLEMENT.*REJECTED|REJECTED.*SETTLEMENT/.test(action)) {
    title = "Setoran ditolak";
    summary = `${actor} menolak proses setoran kas.`;
    impact = "Setoran belum final dan perlu diperiksa kembali sebelum diajukan ulang.";
  } else if (/SETTLEMENT.*SUBMITTED|SUBMITTED.*SETTLEMENT/.test(action)) {
    title = "Setoran diajukan";
    summary = `${actor} mengajukan setoran kas untuk diverifikasi.`;
    impact = "Setoran masih menunggu verifikasi dan belum dianggap final.";
  }

  return {
    id: log.id,
    action,
    category,
    sensitivity,
    title,
    summary,
    impact,
    actor: actorText(log),
    createdAt: dateTime(log.created_at),
    details: detailPairs(details),
  };
}

function dedupePromotionSave(items) {
  return items.filter((item, index) => {
    if (item.action !== "PROMOTION_SAVED") return true;
    const neighborActions = [items[index - 1]?.action, items[index + 1]?.action];
    return !neighborActions.some((action) =>
      ["PROMOTION_CREATED", "PROMOTION_EDITED", "PROMOTION_ACTIVATED", "PROMOTION_DEACTIVATED"].includes(action),
    );
  });
}

export default function OwnerAuditCenter() {
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[data-owner-audit-legacy="true"]')
        .forEach((node) => {
          node.hidden = false;
          delete node.dataset.ownerAuditLegacy;
        });
      document.getElementById("owner-audit-center-host")?.remove();
      document.body.classList.remove("owner-audit-center-active");
      setHost(null);
      setVisible(false);
    };

    const sync = () => {
      const legacy = findLegacyAuditPanel();
      if (!legacy || !ownerSignature()) {
        if (!legacy) cleanup();
        return;
      }
      legacy.dataset.ownerAuditLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-audit-center-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-audit-center-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      document.body.classList.add("owner-audit-center-active");
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

  async function load({ more = false } = {}) {
    if (!visible) return;
    more ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const result = await request(
        more && nextCursor ? `audit?before=${nextCursor}` : "audit",
      );
      setLogs((current) => (more ? [...current, ...(result.logs || [])] : result.logs || []));
      setNextCursor(result.nextCursor || null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const activities = useMemo(
    () => dedupePromotionSave(logs.map(presentation)),
    [logs],
  );

  const summary = useMemo(() => {
    const sensitive = activities.filter((item) => item.sensitivity === "SENSITIVE");
    return {
      total: activities.length,
      sensitive: sensitive.length,
      finance: activities.filter((item) => item.category === "FINANCE").length,
      access: activities.filter((item) => item.category === "ACCESS").length,
      latestSensitive: sensitive[0] || null,
    };
  }, [activities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((item) => {
      if (category !== "ALL" && item.category !== category) return false;
      if (sensitiveOnly && item.sensitivity !== "SENSITIVE") return false;
      if (!q) return true;
      return [item.title, item.summary, item.actor, item.impact, item.action]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [activities, search, category, sensitiveOnly]);

  if (!host || !visible) return null;

  const content = (
    <section className="owner-audit-center" aria-label="Owner Audit Activity Center">
      <header className="oac-hero">
        <div>
          <span>OWNER AUDIT & CONTROL</span>
          <h1>Audit Aktivitas</h1>
          <p>
            Jejak perubahan penting dalam bahasa sederhana: siapa melakukan apa,
            kapan terjadi, dan apa dampaknya terhadap operasional Warkost.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading}>
          ↻ {loading ? "Memuat…" : "Perbarui"}
        </button>
      </header>

      <section className="oac-kpis">
        <article>
          <span>Aktivitas dimuat</span>
          <strong>{summary.total}</strong>
          <small>jejak audit terbaru</small>
        </article>
        <article className={summary.sensitive ? "attention" : ""}>
          <span>Aktivitas sensitif</span>
          <strong>{summary.sensitive}</strong>
          <small>akses, penolakan, atau konfigurasi</small>
        </article>
        <article>
          <span>Kas & Keuangan</span>
          <strong>{summary.finance}</strong>
          <small>setoran / settlement</small>
        </article>
        <article>
          <span>Staf & Akses</span>
          <strong>{summary.access}</strong>
          <small>akun dan keamanan</small>
        </article>
      </section>

      <section className={`oac-owner-summary ${summary.latestSensitive ? "attention" : "safe"}`}>
        <div className="oac-summary-icon">{summary.latestSensitive ? "!" : "✓"}</div>
        <div>
          <span>RINGKASAN UNTUK OWNER</span>
          <h2>
            {summary.latestSensitive
              ? "Ada aktivitas sensitif yang perlu diketahui"
              : "Tidak ada aktivitas sensitif pada data yang dimuat"}
          </h2>
          <p>
            {summary.latestSensitive
              ? `${summary.latestSensitive.title} — ${summary.latestSensitive.summary}`
              : "Audit yang tampil saat ini didominasi aktivitas normal. Tetap gunakan filter untuk meninjau perubahan tertentu."}
          </p>
        </div>
      </section>

      {error && <div className="oac-feedback error">{error}</div>}

      <section className="oac-panel">
        <div className="oac-panel-head">
          <div>
            <span>ACTIVITY TIMELINE</span>
            <h2>Apa yang berubah di sistem?</h2>
          </div>
          <small>Audit bersifat read-only dan tidak dapat diedit.</small>
        </div>

        <div className="oac-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari staf, aktivitas, setoran, promo…"
          />
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            className={sensitiveOnly ? "active" : ""}
            onClick={() => setSensitiveOnly((value) => !value)}
          >
            {sensitiveOnly ? "✓ " : ""}Sensitif saja
          </button>
        </div>

        <div className="oac-list">
          {filtered.map((item) => (
            <article key={item.id} className={`oac-item ${item.sensitivity.toLowerCase()}`}>
              <div className={`oac-category ${item.category.toLowerCase()}`}>
                {CATEGORY_LABEL[item.category] || "Sistem"}
              </div>
              <div className="oac-item-main">
                <div className="oac-item-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                  </div>
                  <span className={`oac-tone ${item.sensitivity.toLowerCase()}`}>
                    {item.sensitivity === "SENSITIVE"
                      ? "SENSITIF"
                      : item.sensitivity === "REVIEW"
                        ? "PERLU DICATAT"
                        : "NORMAL"}
                  </span>
                </div>
                <div className="oac-meta">
                  <span><b>Pelaku:</b> {item.actor}</span>
                  <span><b>Waktu:</b> {item.createdAt}</span>
                </div>
                <div className="oac-impact">
                  <b>Dampak untuk bisnis</b>
                  <span>{item.impact}</span>
                </div>
                {item.details.length > 0 && (
                  <div className="oac-details">
                    {item.details.map((detail) => (
                      <div key={`${item.id}-${detail.label}`}>
                        <span>{detail.label}</span>
                        <strong>{detail.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <details className="oac-system-ref">
                  <summary>Referensi sistem</summary>
                  <code>{item.action}</code>
                </details>
              </div>
            </article>
          ))}
          {!loading && !filtered.length && (
            <div className="oac-empty">Tidak ada aktivitas yang sesuai filter.</div>
          )}
        </div>

        {nextCursor && (
          <button
            className="oac-load-more"
            type="button"
            disabled={loadingMore}
            onClick={() => load({ more: true })}
          >
            {loadingMore ? "Memuat aktivitas…" : "Muat aktivitas lebih lama"}
          </button>
        )}
      </section>

      <section className="oac-note">
        <strong>Cara membaca Audit Log</strong>
        <p>
          Status “Sensitif” bukan berarti fraud atau kesalahan. Penanda tersebut
          membantu Owner memprioritaskan perubahan akses, penolakan transaksi,
          penonaktifan, dan konfigurasi yang berdampak lebih besar.
        </p>
      </section>
    </section>
  );

  return createPortal(content, host);
}
