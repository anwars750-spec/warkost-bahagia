"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ACTIVE_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "ASSIGNED",
  "PICKED_UP",
  "ON_DELIVERY",
];

const STATUS_LABELS = {
  PENDING: "Menunggu konfirmasi",
  CONFIRMED: "Sudah dikonfirmasi",
  PREPARING: "Sedang disiapkan",
  READY: "Siap diantar",
  ASSIGNED: "Driver ditugaskan",
  PICKED_UP: "Sudah diambil driver",
  ON_DELIVERY: "Dalam pengantaran",
};

const ICONS = {
  activity: "M3 12h4l2-6 4 12 2-6h6",
  box: "M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10",
  payment: "M4 6h16v12H4zM4 10h16M8 15h3",
  printer: "M6 9V4h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v6H6z",
  refresh: "M20 11a8 8 0 0 0-15-3M4 4v5h5m11 4a8 8 0 0 1-15 3M4 20v-5h5",
  close: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14m-5-5 5 5-5 5",
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name] || ICONS.activity} />
    </svg>
  );
}

async function request(route) {
  const response = await fetch(`/api/${route}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Data operasional tidak dapat dimuat");
  return data;
}

function countStatuses(statuses, wanted) {
  return (statuses || [])
    .filter((item) => wanted.includes(item.status))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function clickOwnerControl(label) {
  const wanted = String(label || "").trim().toLowerCase();
  const button = [...document.querySelectorAll(".owner-control-grid-v3 > button")].find(
    (item) => item.querySelector("strong")?.textContent?.trim().toLowerCase() === wanted,
  );
  button?.click();
  return Boolean(button);
}

function openPrinterSettings() {
  if (!clickOwnerControl("Pengaturan")) return;
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const printerTab = [...document.querySelectorAll(".osx-tabs button")].find(
      (button) => button.textContent?.trim().toLowerCase() === "printer",
    );
    if (printerTab) {
      printerTab.click();
      window.clearInterval(timer);
      return;
    }
    if (attempts >= 30) window.clearInterval(timer);
  }, 50);
}

function installStyles() {
  if (document.getElementById("owner-operational-health-v4-style")) return;
  const style = document.createElement("style");
  style.id = "owner-operational-health-v4-style";
  style.textContent = `
    .owner-health-panel-v3[data-owner-health-legacy="true"]{display:none!important}
    .ooh{display:flex;flex-direction:column;overflow:hidden;border:1px solid #e8d8c7;border-radius:20px;background:#fffdf9;box-shadow:0 10px 26px rgba(74,42,24,.045);color:#38271e}
    .ooh *{box-sizing:border-box}.ooh svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
    .ooh-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #eee0d2;background:#fffaf4}.ooh-head-copy>span{display:block;margin-bottom:5px;color:#a35f39;font-size:10px;font-weight:900;letter-spacing:.13em}.ooh-head h3{margin:0;color:#402719;font-size:16px}.ooh-head p{margin:5px 0 0;color:#8b776b;font-size:10px;line-height:1.4}.ooh-head-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}.ooh-summary{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.04em;white-space:nowrap}.ooh-summary::before{width:7px;height:7px;border-radius:50%;background:currentColor;content:""}.ooh-summary.safe{background:#edf7f0;color:#347247}.ooh-summary.warning{background:#fff3df;color:#986022}.ooh-summary.critical{background:#fff0ec;color:#a43c2f}.ooh-refresh{display:grid;place-items:center;width:36px;height:36px;border:1px solid #dcc7b5;border-radius:11px;background:#fff;color:#71432d;cursor:pointer}.ooh-refresh:disabled{opacity:.55;cursor:wait}.ooh-refresh.loading svg{animation:ooh-spin .8s linear infinite}@keyframes ooh-spin{to{transform:rotate(360deg)}}
    .ooh-overview{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;margin:14px 14px 0;padding:13px 15px;border:1px solid #e5ded6;border-radius:14px;background:linear-gradient(120deg,#faf8f5,#fff)}.ooh-overview.safe{border-color:#d7e6db;background:linear-gradient(120deg,#f4fbf6,#fff)}.ooh-overview.warning{border-color:#ead8ba;background:linear-gradient(120deg,#fff8ec,#fff)}.ooh-overview.critical{border-color:#edc9bf;background:linear-gradient(120deg,#fff3ef,#fff)}.ooh-overview strong{display:block;color:#422a1d;font-size:13px}.ooh-overview span{display:block;margin-top:3px;color:#806f65;font-size:9px;line-height:1.45}.ooh-overview em{font-style:normal;color:#927a6b;font-size:9px;white-space:nowrap}
    .ooh-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px}.ooh-card{position:relative;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:148px;padding:14px;border:1px solid #eadbca;border-radius:16px;background:#fff;color:#543221;text-align:left;cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.ooh-card:hover{transform:translateY(-1px);border-color:#cba788;box-shadow:0 8px 20px rgba(75,42,24,.07)}.ooh-card.warning{border-color:#ead5b7;background:linear-gradient(145deg,#fffaf2,#fff)}.ooh-card.critical{border-color:#ecc7bc;background:linear-gradient(145deg,#fff6f2,#fff)}.ooh-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.ooh-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#f4e8db;color:#724229}.ooh-card.safe .ooh-icon{background:#eaf4ed;color:#3f7650}.ooh-card.warning .ooh-icon{background:#faead1;color:#9a6126}.ooh-card.critical .ooh-icon{background:#f8dfd7;color:#a44634}.ooh-tone{padding:5px 7px;border-radius:999px;background:#f2eee9;color:#79695f;font-size:8px;font-weight:900;white-space:nowrap}.ooh-card.safe .ooh-tone{background:#e9f4ec;color:#39724a}.ooh-card.warning .ooh-tone{background:#faead1;color:#8f5b25}.ooh-card.critical .ooh-tone{background:#f7dfd8;color:#9d402f}.ooh-value{display:block;color:#3e271a;font-size:24px;line-height:1}.ooh-title{display:block;margin-top:4px;color:#695044;font-size:10px;font-weight:850}.ooh-card p{margin:0;color:#8b776c;font-size:9px;line-height:1.45}.ooh-detail-link{margin-top:auto;color:#9a5c3b;font-size:9px;font-weight:850}
    .ooh-error{margin:14px;padding:11px 13px;border:1px solid #efcac2;border-radius:12px;background:#fff2ef;color:#9e3d31;font-size:10px}
    .ooh-backdrop{position:fixed;inset:0;z-index:1250;display:grid;place-items:center;padding:20px;background:rgba(44,27,18,.48);backdrop-filter:blur(6px)}.ooh-modal{position:relative;width:min(620px,100%);max-height:min(84vh,760px);overflow:auto;border:1px solid #e2cdbb;border-radius:22px;background:#fffaf6;box-shadow:0 30px 90px rgba(55,31,17,.28)}.ooh-modal-head{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:13px;align-items:center;padding:21px 22px 17px;border-bottom:1px solid #eadfd6}.ooh-modal-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:#f2e3d5;color:#6c3d24}.ooh-modal-head small{display:block;color:#a15e3b;font-size:9px;font-weight:900;letter-spacing:.13em}.ooh-modal-head h3{margin:4px 0 0;color:#382319;font-size:21px}.ooh-close{display:grid;place-items:center;width:40px;height:40px;border:1px solid #dfcdbf;border-radius:12px;background:#fff;color:#603722;cursor:pointer}.ooh-modal-body{display:flex;flex-direction:column;gap:13px;padding:18px 22px 22px}.ooh-modal-status{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;padding:13px 14px;border:1px solid #e8ddd3;border-radius:14px;background:#fff}.ooh-modal-status strong{display:block;color:#3f291d;font-size:29px;line-height:1}.ooh-modal-status span{display:block;margin-top:5px;color:#7d6c62;font-size:10px}.ooh-modal-status b{padding:6px 9px;border-radius:999px;background:#f2ece7;color:#70594c;font-size:9px}.ooh-modal-status b.safe{background:#eaf5ed;color:#367248}.ooh-modal-status b.warning{background:#fbecd6;color:#8e5c26}.ooh-modal-status b.critical{background:#f8e1d9;color:#9b4030}.ooh-explain{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ooh-explain>div{padding:13px;border:1px solid #e8ddd4;border-radius:13px;background:#fff}.ooh-explain small{display:block;color:#9a684e;font-size:8px;font-weight:900;letter-spacing:.1em}.ooh-explain strong{display:block;margin-top:5px;color:#483126;font-size:11px;line-height:1.45}.ooh-list{display:flex;flex-direction:column;gap:7px}.ooh-list-title{color:#7c5d4c;font-size:9px;font-weight:900;letter-spacing:.08em}.ooh-list>div:not(.ooh-list-title){padding:9px 11px;border:1px solid #eadfd6;border-radius:10px;background:#fff;color:#6d5548;font-size:10px}.ooh-empty{padding:12px;border-radius:11px;background:#f6f4f2;color:#83766e;font-size:10px}.ooh-action{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;margin-top:2px;padding:0 13px;border:0;border-radius:11px;background:#73391f;color:#fff;font-weight:850;cursor:pointer}.ooh-action:hover{background:#864526}.ooh-action svg{width:17px;height:17px}
    @media(max-width:1100px){.ooh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:680px){.ooh-head{align-items:flex-start;padding:14px}.ooh-head h3{font-size:15px}.ooh-head p{font-size:9px}.ooh-head-actions{gap:5px}.ooh-summary{max-width:130px;min-height:32px;padding:0 9px;font-size:8px;overflow:hidden;text-overflow:ellipsis}.ooh-refresh{width:33px;height:33px}.ooh-overview{grid-template-columns:1fr;margin:10px 10px 0;padding:11px}.ooh-overview em{white-space:normal}.ooh-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}.ooh-card{min-height:136px;padding:11px}.ooh-value{font-size:21px}.ooh-card p{font-size:8px}.ooh-modal{max-height:92dvh;border-radius:18px}.ooh-modal-head{grid-template-columns:40px minmax(0,1fr) 36px;padding:16px}.ooh-modal-icon{width:39px;height:39px}.ooh-modal-head h3{font-size:17px}.ooh-close{width:36px;height:36px}.ooh-modal-body{padding:14px 16px 17px}.ooh-explain{grid-template-columns:1fr}.ooh-modal-status strong{font-size:25px}}
  `;
  document.head.appendChild(style);
}

export default function OwnerOperationalHealth() {
  const [host, setHost] = useState(null);
  const [data, setData] = useState({ dashboard: null, stock: [], printJobs: [], settings: {}, devices: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    installStyles();
    let currentLegacy = null;
    const sync = () => {
      const legacy = document.querySelector(".owner-health-panel-v3");
      const dashboardActive = document.body.classList.contains("owner-dashboard-v3-active");
      if (!legacy || !dashboardActive) {
        if (currentLegacy) {
          currentLegacy.hidden = false;
          delete currentLegacy.dataset.ownerHealthLegacy;
          currentLegacy = null;
        }
        document.getElementById("owner-operational-health-v4-host")?.remove();
        setHost(null);
        return;
      }
      currentLegacy = legacy;
      legacy.dataset.ownerHealthLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-operational-health-v4-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-operational-health-v4-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      setHost(target);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      if (currentLegacy) {
        currentLegacy.hidden = false;
        delete currentLegacy.dataset.ownerHealthLegacy;
      }
      document.getElementById("owner-operational-health-v4-host")?.remove();
    };
  }, []);

  async function load() {
    if (!host) return;
    setLoading(true);
    setError("");
    try {
      const [dashboard, stock, printJobs] = await Promise.all([
        request("owner-dashboard-v2?preset=today"),
        request("stock"),
        request("print-jobs"),
      ]);
      let settings = {};
      let devices = null;
      try { settings = await request("settings"); } catch {}
      try { devices = await request("owner-device-settings"); } catch {}
      setData({
        dashboard,
        stock: stock.products || [],
        printJobs: printJobs.jobs || [],
        settings,
        devices,
      });
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!host) return;
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [host]);

  useEffect(() => {
    if (!popup) return;
    const previous = document.body.style.overflow;
    const onKey = (event) => event.key === "Escape" && setPopup(null);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [popup]);

  const health = useMemo(() => {
    const statuses = data.dashboard?.statuses || [];
    const activeOrders = countStatuses(statuses, ACTIVE_STATUSES);
    const pendingPayments = Number(
      data.dashboard?.paymentStatuses?.find((item) => item.status === "PENDING")?.count || 0,
    );
    const outOfStock = data.stock.filter((product) => Number(product.available_quantity || 0) <= 0);
    const failedPrintJobs = data.printJobs.filter((job) => job.status === "FAILED");
    const printerSimulation = data.settings?.printerSimulation !== false;
    const printerDevices = data.devices ? [data.devices.admin, data.devices.kitchen].filter(Boolean) : [];
    const deviceNotReady = !printerSimulation && printerDevices.some((device) =>
      device?.enabled && device.transport === "NETWORK_AGENT" && !String(device.host || "").trim(),
    );

    const attentionAreas = [];
    if (outOfStock.length) attentionAreas.push(`${outOfStock.length} produk kehabisan stok`);
    if (pendingPayments) attentionAreas.push(`${pendingPayments} pembayaran masih pending`);
    if (failedPrintJobs.length) attentionAreas.push(`${failedPrintJobs.length} print job gagal`);
    if (deviceNotReady) attentionAreas.push("printer fisik belum lengkap konfigurasinya");

    const overallTone = failedPrintJobs.length ? "critical" : attentionAreas.length ? "warning" : "safe";
    const overallLabel = failedPrintJobs.length
      ? "PERLU TINDAKAN"
      : attentionAreas.length
        ? "PERLU PERHATIAN"
        : "OPERASIONAL AMAN";

    const items = [
      {
        key: "orders",
        icon: "activity",
        title: "Order Aktif",
        value: activeOrders,
        tone: "safe",
        status: activeOrders ? "Berjalan" : "Tidak ada antrean",
        short: activeOrders ? "Pesanan sedang diproses tim." : "Tidak ada order aktif saat ini.",
        meaning: activeOrders
          ? "Ada pesanan yang sedang bergerak dari konfirmasi sampai pengantaran. Ini normal selama tidak menumpuk di satu tahap."
          : "Tidak ada pesanan yang sedang menunggu proses operasional.",
        recommendation: activeOrders
          ? "Pantau distribusi statusnya. Jika banyak order berhenti di satu tahap, follow up tim yang bertanggung jawab."
          : "Tidak ada tindakan yang diperlukan.",
        details: statuses
          .filter((item) => ACTIVE_STATUSES.includes(item.status) && Number(item.count || 0) > 0)
          .map((item) => `${STATUS_LABELS[item.status] || item.status}: ${item.count}`),
        actionLabel: "Buka Laporan Bisnis",
        action: () => clickOwnerControl("Laporan"),
      },
      {
        key: "stock",
        icon: "box",
        title: "Produk Stok Habis",
        value: outOfStock.length,
        tone: outOfStock.length ? "warning" : "safe",
        status: outOfStock.length ? "Perlu restock" : "Aman",
        short: outOfStock.length ? "Ada menu yang tidak bisa dijual." : "Tidak ada produk yang kehabisan stok.",
        meaning: outOfStock.length
          ? "Produk dengan stok tersedia 0 berisiko membuat menu tidak dapat dipenuhi saat customer memesan."
          : "Semua produk yang terbaca sistem masih memiliki stok tersedia.",
        recommendation: outOfStock.length
          ? "Minta Manager mengecek restock atau menonaktifkan sementara menu yang memang belum tersedia."
          : "Tidak ada tindakan yang diperlukan.",
        details: outOfStock.slice(0, 10).map((item) => item.name || `Produk #${item.id}`),
      },
      {
        key: "payments",
        icon: "payment",
        title: "Pembayaran Pending",
        value: pendingPayments,
        tone: pendingPayments ? "warning" : "safe",
        status: pendingPayments ? "Perlu cek" : "Aman",
        short: pendingPayments ? "Ada pembayaran belum final." : "Tidak ada pembayaran tertahan.",
        meaning: pendingPayments
          ? "Transaksi non-tunai masih menunggu status final dan belum boleh dianggap sebagai penerimaan selesai."
          : "Tidak ada transaksi yang masih tertahan pada status pembayaran pending.",
        recommendation: pendingPayments
          ? "Pastikan Admin menindaklanjuti pembayaran sebelum kedaluwarsa dan cek jika customer sudah membayar tetapi status belum berubah."
          : "Tidak ada tindakan yang diperlukan.",
        details: pendingPayments ? [`${pendingPayments} pembayaran masih berstatus pending hari ini.`] : [],
        actionLabel: "Buka Laporan Bisnis",
        action: () => clickOwnerControl("Laporan"),
      },
      {
        key: "printer",
        icon: "printer",
        title: "Printer & Device",
        value: failedPrintJobs.length,
        tone: failedPrintJobs.length ? "critical" : deviceNotReady ? "warning" : "safe",
        status: failedPrintJobs.length
          ? "Ada kegagalan"
          : printerSimulation
            ? "Mode simulasi"
            : deviceNotReady
              ? "Belum sinkron"
              : "Siap",
        short: failedPrintJobs.length
          ? "Ada job cetak yang gagal."
          : printerSimulation
            ? "Printer fisik belum menjadi jalur aktif."
            : deviceNotReady
              ? "Konfigurasi device perlu dilengkapi."
              : "Tidak ada kegagalan print yang terdeteksi.",
        meaning: failedPrintJobs.length
          ? "Job cetak yang gagal dapat membuat Admin atau Kitchen tidak menerima struk/tiket yang seharusnya dicetak."
          : printerSimulation
            ? "Sistem masih memakai simulasi, sehingga kondisi printer fisik belum dapat dinilai sebagai sehat atau gagal."
            : "Sistem tidak mendeteksi print job gagal pada data terbaru.",
        recommendation: failedPrintJobs.length || deviceNotReady || printerSimulation
          ? "Buka Pengaturan Printer untuk memastikan mode, host/IP, port, dan print agent sesuai kondisi perangkat toko."
          : "Tidak ada tindakan yang diperlukan.",
        details: [
          ...(printerSimulation ? ["Mode simulasi printer masih aktif."] : []),
          ...failedPrintJobs.slice(0, 8).map((job) =>
            `Job #${job.id}${job.order_id ? ` · Order #${job.order_id}` : ""}${job.printer_key ? ` · ${job.printer_key}` : ""}`,
          ),
        ],
        actionLabel: "Buka Pengaturan Printer",
        action: openPrinterSettings,
      },
    ];

    return { items, attentionAreas, overallTone, overallLabel };
  }, [data]);

  if (!host) return null;

  const updatedText = updatedAt
    ? updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return createPortal(
    <>
      <section className="ooh" aria-label="Operational Health Owner">
        <header className="ooh-head">
          <div className="ooh-head-copy">
            <span>OPERATIONAL HEALTH</span>
            <h3>Apakah operasional hari ini berjalan normal?</h3>
            <p>Menampilkan kondisi saat ini dan tidak mengikuti filter periode Sales.</p>
          </div>
          <div className="ooh-head-actions">
            <span className={`ooh-summary ${health.overallTone}`}>{health.overallLabel}</span>
            <button className={`ooh-refresh ${loading ? "loading" : ""}`} type="button" onClick={load} disabled={loading} aria-label="Perbarui Operational Health">
              <Icon name="refresh" />
            </button>
          </div>
        </header>

        {error ? (
          <div className="ooh-error">{error}</div>
        ) : (
          <>
            <div className={`ooh-overview ${health.overallTone}`}>
              <div>
                <strong>
                  {health.attentionAreas.length
                    ? `${health.attentionAreas.length} area perlu perhatian Owner`
                    : "Tidak ada indikator operasional utama yang membutuhkan tindakan"}
                </strong>
                <span>
                  {health.attentionAreas.length
                    ? health.attentionAreas.join(" · ")
                    : "Order, stok, pembayaran, dan printer tidak menunjukkan masalah utama dari data terbaru."}
                </span>
              </div>
              <em>Diperbarui {updatedText}</em>
            </div>

            <div className="ooh-grid">
              {health.items.map((item) => (
                <button key={item.key} type="button" className={`ooh-card ${item.tone}`} onClick={() => setPopup(item)}>
                  <div className="ooh-card-top">
                    <span className="ooh-icon"><Icon name={item.icon} /></span>
                    <span className="ooh-tone">{item.status}</span>
                  </div>
                  <div>
                    <strong className="ooh-value">{item.value}</strong>
                    <span className="ooh-title">{item.title}</span>
                  </div>
                  <p>{item.short}</p>
                  <span className="ooh-detail-link">Lihat penjelasan →</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {popup && (
        <div className="ooh-backdrop" role="presentation" onMouseDown={() => setPopup(null)}>
          <section className="ooh-modal" role="dialog" aria-modal="true" aria-label={popup.title} onMouseDown={(event) => event.stopPropagation()}>
            <header className="ooh-modal-head">
              <span className="ooh-modal-icon"><Icon name={popup.icon} /></span>
              <div>
                <small>OPERATIONAL HEALTH</small>
                <h3>{popup.title}</h3>
              </div>
              <button type="button" className="ooh-close" onClick={() => setPopup(null)} aria-label="Tutup"><Icon name="close" /></button>
            </header>
            <div className="ooh-modal-body">
              <div className="ooh-modal-status">
                <div><strong>{popup.value}</strong><span>Kondisi saat ini</span></div>
                <b className={popup.tone}>{popup.status}</b>
              </div>
              <div className="ooh-explain">
                <div><small>ARTINYA UNTUK OWNER</small><strong>{popup.meaning}</strong></div>
                <div><small>TINDAKAN YANG DISARANKAN</small><strong>{popup.recommendation}</strong></div>
              </div>
              <div className="ooh-list">
                <div className="ooh-list-title">DETAIL KONDISI</div>
                {popup.details?.length ? popup.details.map((detail, index) => <div key={`${popup.key}-${index}`}>{detail}</div>) : <div className="ooh-empty">Tidak ada detail tambahan yang perlu ditindaklanjuti.</div>}
              </div>
              {popup.action && (
                <button type="button" className="ooh-action" onClick={() => { const action = popup.action; setPopup(null); window.setTimeout(action, 0); }}>
                  {popup.actionLabel}<Icon name="arrow" />
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </>,
    host,
  );
}
