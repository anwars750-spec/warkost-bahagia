"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AdminIcon } from "./AdminPresentation";
const ACTIVE_STATES = new Set(["QUEUED", "PENDING", "PRINTING"]);
const SUCCESS_STATES = new Set(["SUCCESS", "PRINTED", "DONE", "COMPLETED"]);
const FAILED_STATES = new Set(["FAILED", "ERROR"]);
const HISTORY_STATES = new Set([
  ...SUCCESS_STATES,
  ...FAILED_STATES,
  "TIMEOUT",
]);

const statusOf = (job) =>
  String(job?.status || job?.state || "QUEUED").toUpperCase();
const printerOf = (job) =>
  String(
    job?.printer || job?.station || job?.target || job?.type || "ADMIN",
  ).toUpperCase();
const orderOf = (job) =>
  job?.order_number || job?.order_no || job?.order_id || job?.orderId || "";
const isKitchen = (job) => /KITCHEN|DAPUR/.test(printerOf(job));
const kindOf = (job) => (isKitchen(job) ? "Kitchen Ticket" : "Struk Admin");
const displayOrder = (job) => {
  const value = orderOf(job);
  if (!value) return "Print Job";
  const raw = String(value).replace(/^#/, "");
  if (/^WB\d+$/i.test(raw)) return raw.toUpperCase();
  if (/^\d+$/.test(raw)) return `WB${raw.padStart(6, "0")}`;
  return raw;
};
const fmt = (value) => {
  if (!value) return "—";
  const raw = String(value);
  const parsed = new Date(
    raw.replace(" ", "T") + (raw.includes("Z") ? "" : "Z"),
  );
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const statusMeta = (state) => {
  if (SUCCESS_STATES.has(state)) return ["BERHASIL", "success"];
  if (FAILED_STATES.has(state)) return ["GAGAL", "failed"];
  if (state === "TIMEOUT") return ["TIMEOUT", "timeout"];
  if (state === "PRINTING") return ["MENCETAK", "printing"];
  return ["MENUNGGU", "queued"];
};
const numericOrder = (job) => {
  const raw = String(orderOf(job) || "").replace(/\D/g, "");
  return Number(raw || job?.id || 0);
};
const timeValue = (job) => {
  const value =
    job?.updated_at || job?.completed_at || job?.created_at || job?.queued_at;
  const parsed = value
    ? new Date(
        String(value).replace(" ", "T") +
          (String(value).includes("Z") ? "" : "Z"),
      )
    : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.getTime()
    : Number(job?.id || 0);
};

async function request(route, body, signal) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Gagal memuat data printer");
  return data;
}
export default function AdminPrinterView({ role = "ADMIN" }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryingId, setRetryingId] = useState(null);
  const [tab, setTab] = useState("queue");
  const [target, setTarget] = useState("all");
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await request(
          "print-jobs",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setJobs(result.jobs || []);
          setError("");
          setLastSync(new Date());
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const onRealtime = (event) => {
      if (event.detail?.type === "PRINTER_STATUS_CHANGED") void load();
    };
    window.addEventListener("warkost:realtime", onRealtime);
    void load();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 120000);
    window.addEventListener("warkost:realtime-recovered", load);
    return () => {
      controller.abort();
      window.removeEventListener("warkost:realtime", onRealtime);
      window.clearInterval(poll);
      window.removeEventListener("warkost:realtime-recovered", load);
    };
  }, []);
  useEffect(() => {
    if (selectedId === null) return;
    const close = (event) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedId]);
  const retryJob = async (id) => {
    if (retryingId !== null) return;
    setRetryingId(id);
    try {
      await request("print-retry", { id: Number(id) || id });
      const result = await request("print-jobs");
      setJobs(result.jobs || []);
      setLastSync(new Date());
      setError("");
      setSelectedId(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setRetryingId(null);
    }
  };
  const retryButton = (job, compact = false) =>
    ACTIVE_STATES.has(statusOf(job)) ? null : (
      <button
        type="button"
        className={`admin-printer-retry ${compact ? "compact" : ""}`}
        data-printer-retry={job.id}
        disabled={retryingId !== null}
        onClick={() => retryJob(job.id)}
      >
        {String(retryingId) === String(job.id) ? "Mengirim..." : "Cetak ulang"}
      </button>
    );
  const scopedJobs = role === "KITCHEN" ? jobs.filter(isKitchen) : jobs;
  const states = scopedJobs.map(statusOf);
  const summary = {
    queue: states.filter((state) => ACTIVE_STATES.has(state)).length,
    success: states.filter((state) => SUCCESS_STATES.has(state)).length,
    failed: states.filter((state) => FAILED_STATES.has(state)).length,
    timeout: states.filter((state) => state === "TIMEOUT").length,
  };
  const filtered = scopedJobs
    .filter(
      (job) =>
        (target === "all" ||
          (target === "kitchen" ? isKitchen(job) : !isKitchen(job))) &&
        (tab === "history"
          ? HISTORY_STATES.has(statusOf(job))
          : ACTIVE_STATES.has(statusOf(job))) &&
        (!search.trim() ||
          `${displayOrder(job)} ${kindOf(job)} ${printerOf(job)} ${statusOf(job)}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())),
    )
    .sort((a, b) =>
      tab === "queue"
        ? numericOrder(a) - numericOrder(b)
        : timeValue(b) - timeValue(a),
    );
  const selected = scopedJobs.find(
    (job) => String(job.id) === String(selectedId),
  );
  return (
    <div
      id="admin-printer-center-v1"
      className={`printer-center-role-${role.toLowerCase()}`}
      data-kitchen-printer={role === "KITCHEN" ? "true" : undefined}
      data-admin-ui-owner="react"
    >
      <section className="admin-printer-hero">
        <div className="admin-printer-hero-copy">
          <small>
            {role === "KITCHEN" ? "STASIUN DAPUR" : "PUSAT PRINTER"}
          </small>
          <h2>{role === "KITCHEN" ? "Printer Kitchen" : "Printer Center"}</h2>
          <p>
            {role === "KITCHEN"
              ? "Pantau cetak otomatis tiket makanan, riwayat, dan kendala printer 80mm tanpa perlu refresh manual."
              : "Pantau antrean cetak otomatis, riwayat, dan kendala printer Admin serta Kitchen."}
          </p>
        </div>
        <div className="admin-printer-live-card">
          <AdminIcon name="pulse" className="admin-printer-live-icon" />
          <div>
            <strong>Auto update</strong>
            <small>
              {lastSync
                ? `Update ${lastSync.toLocaleTimeString("id-ID")}`
                : "Sinkronisasi otomatis"}
            </small>
          </div>
          <i aria-hidden="true" />
        </div>
      </section>
      {error && (
        <div className="admin-printer-inline-alert" role="alert">
          <AdminIcon name="clock" />
          <span>{error}</span>
        </div>
      )}
      <section className="admin-printer-kpis">
        {[
          ["queue", "Antrean", "job aktif", "", "clock"],
          ["success", "Berhasil", "riwayat", "success", "check"],
          ["failed", "Gagal", "perlu cek", "danger", "clock"],
          ["timeout", "Timeout", "perlu tindak lanjut", "warn", "clock"],
        ].map(([key, label, hint, tone, icon]) => (
          <article key={key}>
            <AdminIcon name={icon} className={`icon ${tone}`} />
            <div>
              <small>{label}</small>
              <strong>{summary[key]}</strong>
              <em>{hint}</em>
            </div>
          </article>
        ))}
      </section>
      <section className="admin-printer-workspace">
        <div className="admin-printer-workspace-head">
          <nav className="admin-printer-tabs" aria-label="Menu Printer">
            {[
              ["queue", "Antrean"],
              ["history", "Riwayat"],
              ["status", "Status Printer"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                data-printer-tab={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
                {key === "queue" && <span>{summary.queue}</span>}
              </button>
            ))}
          </nav>
          <div className="admin-printer-auto-state">
            <i />
            <span>Sinkron otomatis</span>
          </div>
        </div>
        {tab !== "status" && (
          <div className="admin-printer-toolbar">
            <label className="admin-printer-search">
              <AdminIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari invoice atau status..."
              />
            </label>
            {role === "KITCHEN" ? (
              <span className="admin-printer-scope-chip">
                Kitchen · makanan saja
              </span>
            ) : (
              <div className="admin-printer-targets">
                {[
                  ["all", "Semua"],
                  ["admin", "Admin"],
                  ["kitchen", "Kitchen"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    data-printer-target={key}
                    className={target === key ? "active" : ""}
                    onClick={() => setTarget(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="admin-printer-content">
          {tab === "status" ? (
            <>
              <div className="admin-printer-device-grid">
                {(role === "KITCHEN" ? ["kitchen"] : ["admin", "kitchen"]).map(
                  (type) => (
                    <article className="admin-printer-device-card" key={type}>
                      <AdminIcon
                        name="printer"
                        className={`admin-printer-device-icon ${type}`}
                      />
                      <div className="admin-printer-device-copy">
                        <small>PRINTER {type.toUpperCase()}</small>
                        <strong>80mm Thermal</strong>
                        <p>
                          {type === "kitchen"
                            ? "Cetak otomatis makanan saja. Minuman tetap ditangani Admin."
                            : "Cetak seluruh item order dan ringkasan transaksi pembayaran."}
                        </p>
                      </div>
                      <span className="admin-printer-device-state neutral">
                        DIPANTAU
                      </span>
                    </article>
                  ),
                )}
              </div>
              <div className="admin-printer-routing-note">
                <strong>Routing cetak</strong>
                {role !== "KITCHEN" && (
                  <span>Admin = semua item + transaksi</span>
                )}
                <span>Kitchen = makanan saja</span>
                <span>Ukuran = thermal 80mm</span>
              </div>
            </>
          ) : loading ? (
            <div className="admin-printer-empty">
              <span className="admin-printer-spinner" />
              <strong>Menyiapkan Printer Center...</strong>
              <p>Membaca antrean cetak terbaru.</p>
            </div>
          ) : filtered.length ? (
            <div className="admin-printer-job-list">
              {filtered.map((job) => {
                const [label, tone] = statusMeta(statusOf(job));
                return (
                  <article key={job.id} className={`admin-printer-job ${tone}`}>
                    <AdminIcon
                      name="printer"
                      className={`admin-printer-job-icon ${isKitchen(job) ? "kitchen" : "admin"}`}
                    />
                    <div className="admin-printer-job-main">
                      <div className="admin-printer-job-title">
                        <strong>{displayOrder(job)}</strong>
                        <span className={`admin-printer-status ${tone}`}>
                          {label}
                        </span>
                      </div>
                      <span>
                        {kindOf(job)} ·{" "}
                        {isKitchen(job)
                          ? "Makanan saja"
                          : "Semua item + transaksi"}
                      </span>
                      <small>
                        {fmt(
                          job.created_at ||
                            job.createdAt ||
                            job.queued_at ||
                            job.updated_at,
                        )}{" "}
                        · Percobaan {job.attempts ?? 0} · Cetak ulang{" "}
                        {job.retry_count ?? job.retries ?? 0}
                      </small>
                    </div>
                    <div className="admin-printer-job-actions">
                      {retryButton(job, true)}
                      <button
                        type="button"
                        className="admin-printer-detail"
                        data-printer-detail={job.id}
                        onClick={() => setSelectedId(job.id)}
                      >
                        Detail
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="admin-printer-empty">
              <AdminIcon name="printer" />
              <strong>
                {error
                  ? "Data printer belum dapat dimuat"
                  : tab === "history"
                    ? "Belum ada riwayat cetak"
                    : "Antrean cetak kosong"}
              </strong>
              <p>
                {tab === "history"
                  ? "Cetakan berhasil, gagal, dan timeout akan tercatat di sini."
                  : "Print job baru akan masuk otomatis saat ada order yang perlu dicetak."}
              </p>
            </div>
          )}
        </div>
      </section>
      {selected &&
        createPortal(
          <div
            className="admin-printer-modal-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelectedId(null);
            }}
          >
            <section
              className="admin-printer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Detail cetakan"
            >
              <header>
                <div>
                  <small>DETAIL CETAKAN</small>
                  <h3>{displayOrder(selected)}</h3>
                  <p>{kindOf(selected)}</p>
                </div>
                <button
                  type="button"
                  data-printer-close
                  aria-label="Tutup"
                  onClick={() => setSelectedId(null)}
                >
                  <span className="admin-printer-close-x" aria-hidden="true" />
                </button>
              </header>
              <div className="admin-printer-modal-grid">
                {[
                  ["Status", statusMeta(statusOf(selected))[0]],
                  [
                    "Tujuan",
                    isKitchen(selected) ? "Kitchen 80mm" : "Admin 80mm",
                  ],
                  ["Percobaan", selected.attempts ?? 0],
                  [
                    "Cetak ulang",
                    selected.retry_count ?? selected.retries ?? 0,
                  ],
                  ["Dibuat", fmt(selected.created_at)],
                  ["Update", fmt(selected.updated_at || selected.completed_at)],
                ].map(([label, value]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
              <section className="admin-printer-preview">
                <small>ROUTING CETAK</small>
                <strong>
                  {isKitchen(selected)
                    ? "Kitchen Ticket · makanan saja"
                    : "Struk Admin · semua item & transaksi"}
                </strong>
                <p>
                  {selected.error ||
                    selected.error_message ||
                    "Tidak ada pesan error pada print job ini."}
                </p>
              </section>
              {retryButton(selected)}
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
