"use client";

import { useEffect } from "react";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const printerIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 8V3h10v5"></path>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2"></path>
    <path d="M7 14h10v7H7z"></path>
    <path d="M18 11h.01"></path>
  </svg>`;
const queueIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M12 7v5l3 2"></path>
  </svg>`;
const successIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="m8 12 2.5 2.5L16 9"></path>
  </svg>`;
const alertIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 2.8 19h18.4L12 3Z"></path>
    <path d="M12 9v4"></path>
    <path d="M12 16h.01"></path>
  </svg>`;
const searchIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-4-4"></path>
  </svg>`;

const fmtDateTime = (value) => {
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

const jobStatus = (job) => String(job?.status || job?.state || "QUEUED").toUpperCase();
const jobOrder = (job) => job?.order_number || job?.order_no || job?.order_id || job?.orderId || "—";
const jobPrinter = (job) => String(job?.printer || job?.station || job?.target || job?.type || "ADMIN").toUpperCase();
const isKitchen = (job) => /KITCHEN|DAPUR/.test(jobPrinter(job));
const jobKind = (job) => (isKitchen(job) ? "Kitchen Ticket" : "Struk Admin");

export default function AdminPrinterEnhancerV2() {
  useEffect(() => {
    let root = null;
    let observer = null;
    let raf = null;
    let modal = null;
    let jobs = [];
    let loading = false;
    let error = "";
    let activeTab = "queue";
    let activeTarget = "all";
    let search = "";
    let loaded = false;

    const findNativePanel = () =>
      [...document.querySelectorAll("main .panel")].find((panel) =>
        panel.textContent?.includes("Antrean cetak struk 80mm"),
      );

    const portal = () => document.getElementById("admin-ui-portal-root");

    const syncNavActive = (active) => {
      document.querySelectorAll("header.top nav button").forEach((button) => {
        const label = button.textContent.replace(/\d+/g, "").trim();
        if (active) button.classList.toggle("admin-nav-active", label === "Printer");
        else if (label === "Printer") button.classList.remove("admin-nav-active");
      });
    };

    const statusTone = (status) => {
      if (["SUCCESS", "PRINTED", "DONE", "COMPLETED"].includes(status)) return "success";
      if (["FAILED", "ERROR"].includes(status)) return "failed";
      if (status === "TIMEOUT") return "timeout";
      if (status === "PRINTING") return "printing";
      return "queued";
    };

    const summary = () => {
      const statuses = jobs.map(jobStatus);
      return {
        queue: statuses.filter((s) => ["QUEUED", "PENDING", "PRINTING"].includes(s)).length,
        success: statuses.filter((s) => ["SUCCESS", "PRINTED", "DONE", "COMPLETED"].includes(s)).length,
        failed: statuses.filter((s) => ["FAILED", "ERROR"].includes(s)).length,
        timeout: statuses.filter((s) => s === "TIMEOUT").length,
      };
    };

    const filteredJobs = () => {
      const term = search.trim().toLowerCase();
      return jobs.filter((job) => {
        const status = jobStatus(job);
        const targetOk =
          activeTarget === "all" ||
          (activeTarget === "kitchen" ? isKitchen(job) : !isKitchen(job));
        const tabOk =
          activeTab === "history"
            ? ["SUCCESS", "PRINTED", "DONE", "COMPLETED", "FAILED", "ERROR", "TIMEOUT"].includes(status)
            : ["QUEUED", "PENDING", "PRINTING"].includes(status);
        const haystack = `${jobOrder(job)} ${jobKind(job)} ${jobPrinter(job)} ${status}`.toLowerCase();
        return targetOk && tabOk && (!term || haystack.includes(term));
      });
    };

    const renderPrinterStatus = () => `
      <div class="admin-printer-device-grid">
        <article class="admin-printer-device-card">
          <span class="admin-printer-device-icon">${printerIcon}</span>
          <div><small>PRINTER ADMIN</small><strong>80mm Thermal</strong><p>Menerima seluruh item order dan ringkasan transaksi.</p></div>
          <span class="admin-printer-device-state neutral">SIAP DIPANTAU</span>
        </article>
        <article class="admin-printer-device-card">
          <span class="admin-printer-device-icon kitchen">${printerIcon}</span>
          <div><small>PRINTER KITCHEN</small><strong>80mm Thermal</strong><p>Menerima makanan saja. Minuman tetap ditangani Admin.</p></div>
          <span class="admin-printer-device-state neutral">SIAP DIPANTAU</span>
        </article>
      </div>
      <div class="admin-printer-routing-note">
        <strong>Routing cetak Warkost</strong>
        <span>Admin = semua item + transaksi</span>
        <span>Kitchen = makanan saja</span>
      </div>`;

    const renderJobList = () => {
      if (loading) {
        return '<div class="admin-printer-empty"><span class="admin-printer-spinner"></span><strong>Memuat data printer...</strong></div>';
      }
      if (error) {
        return `<div class="admin-printer-empty error"><span>${alertIcon}</span><strong>Data printer belum dapat dimuat</strong><p>${esc(error)}</p></div>`;
      }
      if (activeTab === "status") return renderPrinterStatus();
      const list = filteredJobs();
      if (!list.length) {
        return `<div class="admin-printer-empty"><span>${activeTab === "history" ? successIcon : printerIcon}</span><strong>${activeTab === "history" ? "Belum ada riwayat cetak" : "Tidak ada antrean cetak"}</strong><p>${activeTab === "history" ? "Job yang selesai, gagal, atau timeout akan tampil di sini." : "Print job baru akan tampil otomatis saat order membutuhkan cetakan."}</p></div>`;
      }
      return `<div class="admin-printer-job-list">${list
        .map((job) => {
          const status = jobStatus(job);
          const order = jobOrder(job);
          const created = job.created_at || job.createdAt || job.queued_at || job.updated_at;
          return `
            <article class="admin-printer-job">
              <span class="admin-printer-job-icon ${isKitchen(job) ? "kitchen" : "admin"}">${printerIcon}</span>
              <div class="admin-printer-job-main">
                <div class="admin-printer-job-title">
                  <strong>${esc(order === "—" ? "Print Job" : `#${String(order).replace(/^#/, "")}`)}</strong>
                  <span class="admin-printer-status ${statusTone(status)}">${esc(status)}</span>
                </div>
                <span>${esc(jobKind(job))} · ${isKitchen(job) ? "Kitchen Printer" : "Admin Printer"}</span>
                <small>${esc(fmtDateTime(created))}</small>
              </div>
              <button type="button" data-printer-detail="${esc(job.id ?? "")}">Lihat detail</button>
            </article>`;
        })
        .join("")}</div>`;
    };

    const render = () => {
      if (!root) return;
      const s = summary();
      root.innerHTML = `
        <section class="admin-printer-hero">
          <div>
            <small>PUSAT PRINTER</small>
            <h2>Printer Center</h2>
            <p>Pantau antrean, hasil cetak, dan kondisi printer Admin serta Kitchen dari satu tempat.</p>
          </div>
          <div class="admin-printer-hero-badge"><span>${printerIcon}</span><div><strong>80mm Thermal</strong><small>Operasional Warkost</small></div></div>
        </section>

        <section class="admin-printer-kpis">
          <article><span class="icon">${queueIcon}</span><div><small>Antrean</small><strong>${s.queue}</strong></div></article>
          <article><span class="icon success">${successIcon}</span><div><small>Berhasil</small><strong>${s.success}</strong></div></article>
          <article><span class="icon danger">${alertIcon}</span><div><small>Gagal</small><strong>${s.failed}</strong></div></article>
          <article><span class="icon warn">${queueIcon}</span><div><small>Timeout</small><strong>${s.timeout}</strong></div></article>
          <article><span class="icon admin">${printerIcon}</span><div><small>Printer Admin</small><strong>Dipantau</strong></div></article>
          <article><span class="icon kitchen">${printerIcon}</span><div><small>Printer Kitchen</small><strong>Dipantau</strong></div></article>
        </section>

        <section class="admin-printer-workspace">
          <nav class="admin-printer-tabs" aria-label="Menu Printer">
            <button type="button" data-printer-tab="queue" class="${activeTab === "queue" ? "active" : ""}">Antrean <span>${s.queue}</span></button>
            <button type="button" data-printer-tab="history" class="${activeTab === "history" ? "active" : ""}">Riwayat</button>
            <button type="button" data-printer-tab="status" class="${activeTab === "status" ? "active" : ""}">Status Printer</button>
          </nav>
          ${
            activeTab === "status"
              ? ""
              : `<div class="admin-printer-toolbar">
                  <label class="admin-printer-search"><span>${searchIcon}</span><input type="search" value="${esc(search)}" placeholder="Cari nomor order atau printer..." /></label>
                  <div class="admin-printer-targets">
                    <button type="button" data-printer-target="all" class="${activeTarget === "all" ? "active" : ""}">Semua</button>
                    <button type="button" data-printer-target="admin" class="${activeTarget === "admin" ? "active" : ""}">Admin</button>
                    <button type="button" data-printer-target="kitchen" class="${activeTarget === "kitchen" ? "active" : ""}">Kitchen</button>
                  </div>
                </div>`
          }
          <div class="admin-printer-content">${renderJobList()}</div>
        </section>`;
    };

    const closeModal = () => {
      modal?.remove();
      modal = null;
    };

    const openModal = (id) => {
      const job = jobs.find((item) => String(item.id) === String(id));
      if (!job) return;
      closeModal();
      const status = jobStatus(job);
      modal = document.createElement("div");
      modal.className = "admin-printer-modal-overlay";
      modal.innerHTML = `
        <section class="admin-printer-modal" role="dialog" aria-modal="true" aria-label="Detail cetakan">
          <header>
            <div><small>DETAIL CETAKAN</small><h3>${esc(jobOrder(job) === "—" ? "Print Job" : `#${String(jobOrder(job)).replace(/^#/, "")}`)}</h3><p>${esc(jobKind(job))}</p></div>
            <button type="button" data-printer-close aria-label="Tutup"><span class="admin-printer-close-x" aria-hidden="true"></span></button>
          </header>
          <div class="admin-printer-modal-grid">
            <article><span>Status</span><strong class="admin-printer-status ${statusTone(status)}">${esc(status)}</strong></article>
            <article><span>Tujuan</span><strong>${isKitchen(job) ? "Kitchen Printer" : "Admin Printer"}</strong></article>
            <article><span>Dibuat</span><strong>${esc(fmtDateTime(job.created_at || job.createdAt || job.queued_at))}</strong></article>
            <article><span>Update</span><strong>${esc(fmtDateTime(job.updated_at || job.completed_at || job.completedAt))}</strong></article>
          </div>
          <section class="admin-printer-preview">
            <small>PREVIEW ROUTING</small>
            <strong>${isKitchen(job) ? "Kitchen Ticket · makanan saja" : "Struk Admin · semua item & transaksi"}</strong>
            <p>${esc(job.error || job.error_message || "Detail cetakan mengikuti data order dari server.")}</p>
          </section>
        </section>`;
      document.body.appendChild(modal);
    };

    const loadJobs = async () => {
      loading = true;
      error = "";
      render();
      try {
        const response = await fetch("/api/print-jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat print job");
        jobs = Array.isArray(data.jobs) ? data.jobs : [];
      } catch (err) {
        error = err.message || "Gagal memuat data printer";
      } finally {
        loading = false;
        render();
      }
    };

    const attachRootEvents = () => {
      root.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-printer-tab]");
        if (tab) {
          activeTab = tab.dataset.printerTab;
          render();
          return;
        }
        const target = event.target.closest("[data-printer-target]");
        if (target) {
          activeTarget = target.dataset.printerTarget;
          render();
          return;
        }
        const detail = event.target.closest("[data-printer-detail]");
        if (detail) openModal(detail.dataset.printerDetail);
      });
      root.addEventListener("input", (event) => {
        if (!event.target.matches(".admin-printer-search input")) return;
        search = event.target.value;
        render();
        requestAnimationFrame(() => {
          const next = root.querySelector(".admin-printer-search input");
          next?.focus();
          next?.setSelectionRange(search.length, search.length);
        });
      });
    };

    const unmount = () => {
      closeModal();
      root?.remove();
      root = null;
      loaded = false;
      document.body.classList.remove("admin-printer-stable-view");
      syncNavActive(false);
    };

    const mount = () => {
      const panel = findNativePanel();
      const host = portal();
      if (!panel || !host) {
        if (root || document.body.classList.contains("admin-printer-stable-view")) unmount();
        return;
      }

      document.body.classList.add("admin-printer-stable-view");
      syncNavActive(true);

      if (!root || !root.isConnected) {
        root = document.createElement("div");
        root.id = "admin-printer-center-v1";
        host.appendChild(root);
        attachRootEvents();
        render();
      } else if (root.parentElement !== host) {
        host.appendChild(root);
      }

      if (!loaded) {
        loaded = true;
        loadJobs();
      }
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(mount);
    };

    const onDocumentClick = (event) => {
      if (event.target.closest("[data-printer-close]")) closeModal();
      if (event.target === modal) closeModal();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeModal();
    };

    document.addEventListener("click", onDocumentClick);
    window.addEventListener("keydown", onKeyDown);
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("keydown", onKeyDown);
      unmount();
    };
  }, []);

  return null;
}
