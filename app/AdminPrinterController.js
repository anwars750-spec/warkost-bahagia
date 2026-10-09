"use client";

import { useEffect } from "react";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const printerIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/><path d="M18 11h.01"/></svg>`;
const queueIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const successIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`;
const alertIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16h.01"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;
const pulseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>`;

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
  String(job?.printer || job?.station || job?.target || job?.type || "ADMIN").toUpperCase();
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
  const parsed = new Date(raw.replace(" ", "T") + (raw.includes("Z") ? "" : "Z"));
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
  const value = job?.updated_at || job?.completed_at || job?.created_at || job?.queued_at;
  const parsed = value ? new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z")) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : Number(job?.id || 0);
};

export default function AdminPrinterController() {
  useEffect(() => {
    let root = null;
    let modal = null;
    let poll = null;
    let loaded = false;
    let loading = false;
    let retryingId = null;
    let jobs = [];
    let role = "";
    let error = "";
    let tab = "queue";
    let target = "all";
    let search = "";
    let lastSync = null;

    const portal = () => document.getElementById("admin-ui-portal-root");
    const roleJobs = () =>
      role === "KITCHEN" ? jobs.filter(isKitchen) : jobs;
    const canRetry = () => role !== "OWNER";

    const summary = () => {
      const states = roleJobs().map(statusOf);
      return {
        queue: states.filter((state) => ACTIVE_STATES.has(state)).length,
        success: states.filter((state) => SUCCESS_STATES.has(state)).length,
        failed: states.filter((state) => FAILED_STATES.has(state)).length,
        timeout: states.filter((state) => state === "TIMEOUT").length,
      };
    };

    const roleCopy = () => {
      if (role === "KITCHEN") {
        return {
          eyebrow: "STASIUN DAPUR",
          title: "Printer Kitchen",
          description:
            "Pantau cetak otomatis tiket makanan, riwayat, dan kendala printer 80mm tanpa perlu refresh manual.",
        };
      }
      if (role === "OWNER") {
        return {
          eyebrow: "MONITOR PRINTER",
          title: "Printer Center",
          description:
            "Pantau antrean dan hasil cetak Admin serta Kitchen. Akses Owner bersifat monitoring.",
        };
      }
      return {
        eyebrow: "PUSAT PRINTER",
        title: "Printer Center",
        description:
          "Pantau antrean, hasil cetak, dan kendala printer Admin serta Kitchen dari satu tempat.",
      };
    };

    const filtered = () => {
      const needle = search.trim().toLowerCase();
      const source = roleJobs().filter((job) => {
        const state = statusOf(job);
        const targetOk =
          role === "KITCHEN" ||
          target === "all" ||
          (target === "kitchen" ? isKitchen(job) : !isKitchen(job));
        const tabOk = tab === "history" ? HISTORY_STATES.has(state) : ACTIVE_STATES.has(state);
        const haystack = `${displayOrder(job)} ${kindOf(job)} ${printerOf(job)} ${state}`.toLowerCase();
        return targetOk && tabOk && (!needle || haystack.includes(needle));
      });
      return source.sort((a, b) =>
        tab === "queue"
          ? numericOrder(a) - numericOrder(b)
          : timeValue(b) - timeValue(a),
      );
    };

    const deviceCard = (type) => {
      const kitchen = type === "kitchen";
      return `<article class="admin-printer-device-card">
        <span class="admin-printer-device-icon ${kitchen ? "kitchen" : "admin"}">${printerIcon}</span>
        <div class="admin-printer-device-copy">
          <small>${kitchen ? "PRINTER KITCHEN" : "PRINTER ADMIN"}</small>
          <strong>80mm Thermal</strong>
          <p>${
            kitchen
              ? "Cetak otomatis makanan saja. Minuman tetap ditangani Admin."
              : "Cetak seluruh item order dan ringkasan transaksi pembayaran."
          }</p>
        </div>
        <span class="admin-printer-device-state neutral">DIPANTAU</span>
      </article>`;
    };

    const statusMarkup = () => {
      const cards = role === "KITCHEN" ? deviceCard("kitchen") : `${deviceCard("admin")}${deviceCard("kitchen")}`;
      return `<div class="admin-printer-device-grid ${role === "KITCHEN" ? "single" : ""}">${cards}</div>
        <div class="admin-printer-routing-note">
          <strong>Routing cetak</strong>
          ${role !== "KITCHEN" ? "<span>Admin = semua item + transaksi</span>" : ""}
          <span>Kitchen = makanan saja</span>
          <span>Ukuran = thermal 80mm</span>
        </div>`;
    };

    const retryButton = (job, compact = false) => {
      const state = statusOf(job);
      if (!canRetry() || ACTIVE_STATES.has(state)) return "";
      const busy = String(retryingId) === String(job.id);
      return `<button type="button" class="admin-printer-retry ${compact ? "compact" : ""}" data-printer-retry="${esc(job.id ?? "")}" ${busy ? "disabled" : ""}>
        ${busy ? "Mengirim..." : "Cetak ulang"}
      </button>`;
    };

    const contentMarkup = () => {
      if (!loaded && loading)
        return '<div class="admin-printer-empty"><span class="admin-printer-spinner"></span><strong>Menyiapkan Printer Center...</strong><p>Membaca antrean cetak terbaru.</p></div>';
      if (error && !jobs.length)
        return `<div class="admin-printer-empty error"><span>${alertIcon}</span><strong>Data printer belum dapat dimuat</strong><p>${esc(error)}</p></div>`;
      if (tab === "status") return statusMarkup();
      const list = filtered();
      if (!list.length)
        return `<div class="admin-printer-empty"><span>${tab === "history" ? successIcon : printerIcon}</span><strong>${tab === "history" ? "Belum ada riwayat cetak" : "Antrean cetak kosong"}</strong><p>${tab === "history" ? "Cetakan berhasil, gagal, dan timeout akan tercatat di sini." : "Print job baru akan masuk otomatis saat ada order yang perlu dicetak."}</p></div>`;

      return `<div class="admin-printer-job-list">${list
        .map((job) => {
          const state = statusOf(job);
          const [label, tone] = statusMeta(state);
          return `<article class="admin-printer-job ${tone}">
            <span class="admin-printer-job-icon ${isKitchen(job) ? "kitchen" : "admin"}">${printerIcon}</span>
            <div class="admin-printer-job-main">
              <div class="admin-printer-job-title">
                <strong>${esc(displayOrder(job))}</strong>
                <span class="admin-printer-status ${tone}">${label}</span>
              </div>
              <span>${esc(kindOf(job))} · ${isKitchen(job) ? "Makanan saja" : "Semua item + transaksi"}</span>
              <small>${esc(fmt(job.created_at || job.createdAt || job.queued_at || job.updated_at))} · Percobaan ${esc(job.attempts ?? 0)} · Cetak ulang ${esc(job.retry_count ?? job.retries ?? 0)}</small>
            </div>
            <div class="admin-printer-job-actions">
              ${retryButton(job, true)}
              <button type="button" class="admin-printer-detail" data-printer-detail="${esc(job.id ?? "")}">Detail</button>
            </div>
          </article>`;
        })
        .join("")}</div>`;
    };

    const render = () => {
      if (!root) return;
      const s = summary();
      const copy = roleCopy();
      const syncText = lastSync
        ? `Update ${lastSync.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
        : "Sinkronisasi otomatis";
      root.className = `printer-center-role-${String(role || "unknown").toLowerCase()}`;
      root.innerHTML = `
        <section class="admin-printer-hero">
          <div class="admin-printer-hero-copy">
            <small>${copy.eyebrow}</small>
            <h2>${copy.title}</h2>
            <p>${copy.description}</p>
          </div>
          <div class="admin-printer-live-card">
            <span class="admin-printer-live-icon">${pulseIcon}</span>
            <div><strong>Auto update</strong><small>${esc(syncText)}</small></div>
            <i aria-hidden="true"></i>
          </div>
        </section>

        ${error && loaded ? `<div class="admin-printer-inline-alert">${alertIcon}<span>${esc(error)}</span></div>` : ""}

        <section class="admin-printer-kpis">
          <article><span class="icon">${queueIcon}</span><div><small>Antrean</small><strong>${s.queue}</strong><em>job aktif</em></div></article>
          <article><span class="icon success">${successIcon}</span><div><small>Berhasil</small><strong>${s.success}</strong><em>riwayat</em></div></article>
          <article><span class="icon danger">${alertIcon}</span><div><small>Gagal</small><strong>${s.failed}</strong><em>perlu cek</em></div></article>
          <article><span class="icon warn">${queueIcon}</span><div><small>Timeout</small><strong>${s.timeout}</strong><em>perlu tindak lanjut</em></div></article>
        </section>

        <section class="admin-printer-workspace">
          <div class="admin-printer-workspace-head">
            <nav class="admin-printer-tabs" aria-label="Menu Printer">
              <button type="button" data-printer-tab="queue" class="${tab === "queue" ? "active" : ""}">Antrean <span>${s.queue}</span></button>
              <button type="button" data-printer-tab="history" class="${tab === "history" ? "active" : ""}">Riwayat</button>
              <button type="button" data-printer-tab="status" class="${tab === "status" ? "active" : ""}">Status Printer</button>
            </nav>
            <div class="admin-printer-auto-state"><i></i><span>Sinkron otomatis 5 detik</span></div>
          </div>
          ${
            tab === "status"
              ? ""
              : `<div class="admin-printer-toolbar">
                  <label class="admin-printer-search">
                    <span>${searchIcon}</span>
                    <input type="search" value="${esc(search)}" placeholder="Cari invoice atau status..." />
                  </label>
                  ${
                    role === "KITCHEN"
                      ? '<span class="admin-printer-scope-chip">Kitchen · makanan saja</span>'
                      : `<div class="admin-printer-targets">
                          <button type="button" data-printer-target="all" class="${target === "all" ? "active" : ""}">Semua</button>
                          <button type="button" data-printer-target="admin" class="${target === "admin" ? "active" : ""}">Admin</button>
                          <button type="button" data-printer-target="kitchen" class="${target === "kitchen" ? "active" : ""}">Kitchen</button>
                        </div>`
                  }
                </div>`
          }
          <div class="admin-printer-content">${contentMarkup()}</div>
        </section>`;
    };

    const ensureRoot = () => {
      const host = portal();
      if (!host) return false;
      if (!root || !root.isConnected) {
        root = document.createElement("div");
        root.id = "admin-printer-center-v1";
        host.appendChild(root);

        root.addEventListener("click", (event) => {
          const tabButton = event.target.closest("[data-printer-tab]");
          if (tabButton) {
            tab = tabButton.dataset.printerTab;
            render();
            return;
          }
          const targetButton = event.target.closest("[data-printer-target]");
          if (targetButton) {
            target = targetButton.dataset.printerTarget;
            render();
            return;
          }
          const retryButtonNode = event.target.closest("[data-printer-retry]");
          if (retryButtonNode) {
            retryJob(retryButtonNode.dataset.printerRetry);
            return;
          }
          const detailButton = event.target.closest("[data-printer-detail]");
          if (detailButton) openModal(detailButton.dataset.printerDetail);
        });

        root.addEventListener("input", (event) => {
          if (!event.target.matches(".admin-printer-search input")) return;
          search = event.target.value;
          render();
          requestAnimationFrame(() => {
            const next = root?.querySelector(".admin-printer-search input");
            next?.focus();
            next?.setSelectionRange(search.length, search.length);
          });
        });
      }
      return true;
    };

    const openModal = (id) => {
      const job = jobs.find((item) => String(item.id) === String(id));
      if (!job) return;
      const state = statusOf(job);
      const [label, tone] = statusMeta(state);
      modal?.remove();
      modal = document.createElement("div");
      modal.className = "admin-printer-modal-overlay";
      modal.innerHTML = `<section class="admin-printer-modal" role="dialog" aria-modal="true" aria-label="Detail cetakan">
        <header>
          <div><small>DETAIL CETAKAN</small><h3>${esc(displayOrder(job))}</h3><p>${esc(kindOf(job))}</p></div>
          <button type="button" data-printer-close aria-label="Tutup"><span class="admin-printer-close-x" aria-hidden="true"></span></button>
        </header>
        <div class="admin-printer-modal-grid">
          <article><span>Status</span><strong class="admin-printer-modal-status ${tone}">${label}</strong></article>
          <article><span>Tujuan</span><strong>${isKitchen(job) ? "Kitchen 80mm" : "Admin 80mm"}</strong></article>
          <article><span>Percobaan</span><strong>${esc(job.attempts ?? 0)}</strong></article>
          <article><span>Cetak ulang</span><strong>${esc(job.retry_count ?? job.retries ?? 0)}</strong></article>
          <article><span>Dibuat</span><strong>${esc(fmt(job.created_at || job.createdAt || job.queued_at))}</strong></article>
          <article><span>Update</span><strong>${esc(fmt(job.updated_at || job.completed_at || job.completedAt))}</strong></article>
        </div>
        <section class="admin-printer-preview">
          <small>ROUTING CETAK</small>
          <strong>${isKitchen(job) ? "Kitchen Ticket · makanan saja" : "Struk Admin · semua item & transaksi"}</strong>
          <p>${esc(job.error || job.error_message || "Tidak ada pesan error pada print job ini.")}</p>
        </section>
        ${retryButton(job)}
      </section>`;
      document.body.appendChild(modal);
    };

    const load = async ({ silent = false, includeRole = false } = {}) => {
      if (loading) return;
      loading = true;
      if (!silent) render();
      try {
        if (includeRole || !role) {
          const [meResponse, jobsResponse] = await Promise.all([
            fetch("/api/me", { cache: "no-store" }),
            fetch("/api/print-jobs", { cache: "no-store" }),
          ]);
          const meData = await meResponse.json();
          const jobsData = await jobsResponse.json();
          if (!meResponse.ok) throw new Error(meData.error || "Gagal membaca role");
          if (!jobsResponse.ok) throw new Error(jobsData.error || "Gagal memuat print job");
          role = String(meData.user?.role || "").toUpperCase();
          jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
          if (role === "KITCHEN") target = "kitchen";
        } else {
          const response = await fetch("/api/print-jobs", { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Gagal memuat print job");
          jobs = Array.isArray(data.jobs) ? data.jobs : [];
        }
        error = "";
        loaded = true;
        lastSync = new Date();
      } catch (err) {
        error = err.message || "Gagal memuat data printer";
      } finally {
        loading = false;
        render();
      }
    };

    const retryJob = async (id) => {
      if (!id || retryingId || !canRetry()) return;
      retryingId = id;
      render();
      try {
        const response = await fetch("/api/print-retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: Number(id) || id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal mengirim cetak ulang");
        modal?.remove();
        modal = null;
        await load({ silent: true });
      } catch (err) {
        error = err.message || "Gagal mengirim cetak ulang";
      } finally {
        retryingId = null;
        render();
      }
    };

    const activate = () => {
      if (!ensureRoot()) return;
      document.body.classList.add("admin-printer-stable-view");
      render();
      load({ includeRole: true });
      poll = window.setInterval(() => {
        if (document.visibilityState === "visible") load({ silent: true });
      }, 5000);
    };

    const deactivate = () => {
      document.body.classList.remove("admin-printer-stable-view");
      if (poll) window.clearInterval(poll);
      poll = null;
      modal?.remove();
      modal = null;
      root?.remove();
      root = null;
      loaded = false;
    };

    const onDocumentClick = (event) => {
      if (event.target.closest("[data-printer-close]")) {
        modal?.remove();
        modal = null;
        return;
      }
      const retryButtonNode = event.target.closest("[data-printer-retry]");
      if (retryButtonNode && modal?.contains(retryButtonNode)) {
        retryJob(retryButtonNode.dataset.printerRetry);
        return;
      }
      if (event.target === modal) {
        modal?.remove();
        modal = null;
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    const onKey = (event) => {
      if (event.key === "Escape") {
        modal?.remove();
        modal = null;
      }
    };
    window.addEventListener("keydown", onKey);
    activate();

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("keydown", onKey);
      deactivate();
    };
  }, []);

  return null;
}
