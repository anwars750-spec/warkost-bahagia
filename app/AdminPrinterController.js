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

const statusOf = (job) => String(job?.status || job?.state || "QUEUED").toUpperCase();
const printerOf = (job) => String(job?.printer || job?.station || job?.target || job?.type || "ADMIN").toUpperCase();
const orderOf = (job) => job?.order_number || job?.order_no || job?.order_id || job?.orderId || "—";
const isKitchen = (job) => /KITCHEN|DAPUR/.test(printerOf(job));
const kindOf = (job) => (isKitchen(job) ? "Kitchen Ticket" : "Struk Admin");
const fmt = (value) => {
  if (!value) return "—";
  const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function AdminPrinterController() {
  useEffect(() => {
    let root = null;
    let modal = null;
    let loaded = false;
    let loading = false;
    let jobs = [];
    let error = "";
    let tab = "queue";
    let target = "all";
    let search = "";

    const portal = () => document.getElementById("admin-ui-portal-root");
    const summary = () => {
      const states = jobs.map(statusOf);
      return {
        queue: states.filter((s) => ["QUEUED", "PENDING", "PRINTING"].includes(s)).length,
        success: states.filter((s) => ["SUCCESS", "PRINTED", "DONE", "COMPLETED"].includes(s)).length,
        failed: states.filter((s) => ["FAILED", "ERROR"].includes(s)).length,
        timeout: states.filter((s) => s === "TIMEOUT").length,
      };
    };

    const filtered = () => {
      const needle = search.trim().toLowerCase();
      return jobs.filter((job) => {
        const state = statusOf(job);
        const targetOk = target === "all" || (target === "kitchen" ? isKitchen(job) : !isKitchen(job));
        const tabOk = tab === "history"
          ? ["SUCCESS", "PRINTED", "DONE", "COMPLETED", "FAILED", "ERROR", "TIMEOUT"].includes(state)
          : ["QUEUED", "PENDING", "PRINTING"].includes(state);
        const haystack = `${orderOf(job)} ${kindOf(job)} ${printerOf(job)} ${state}`.toLowerCase();
        return targetOk && tabOk && (!needle || haystack.includes(needle));
      });
    };

    const statusMarkup = () => `
      <div class="admin-printer-device-grid">
        <article class="admin-printer-device-card"><span class="admin-printer-device-icon">${printerIcon}</span><div><small>PRINTER ADMIN</small><strong>80mm Thermal</strong><p>Menerima seluruh item order dan ringkasan transaksi.</p></div><span class="admin-printer-device-state neutral">SIAP DIPANTAU</span></article>
        <article class="admin-printer-device-card"><span class="admin-printer-device-icon kitchen">${printerIcon}</span><div><small>PRINTER KITCHEN</small><strong>80mm Thermal</strong><p>Menerima makanan saja. Minuman ditangani Admin.</p></div><span class="admin-printer-device-state neutral">SIAP DIPANTAU</span></article>
      </div>
      <div class="admin-printer-routing-note"><strong>Routing cetak Warkost</strong><span>Admin = semua item + transaksi</span><span>Kitchen = makanan saja</span></div>`;

    const contentMarkup = () => {
      if (loading) return '<div class="admin-printer-empty"><span class="admin-printer-spinner"></span><strong>Memuat data printer...</strong></div>';
      if (error) return `<div class="admin-printer-empty error"><span>${alertIcon}</span><strong>Data printer belum dapat dimuat</strong><p>${esc(error)}</p></div>`;
      if (tab === "status") return statusMarkup();
      const list = filtered();
      if (!list.length) return `<div class="admin-printer-empty"><span>${tab === "history" ? successIcon : printerIcon}</span><strong>${tab === "history" ? "Belum ada riwayat cetak" : "Tidak ada antrean cetak"}</strong><p>${tab === "history" ? "Job selesai, gagal, atau timeout akan tampil di sini." : "Print job baru akan tampil otomatis saat order membutuhkan cetakan."}</p></div>`;
      return `<div class="admin-printer-job-list">${list.map((job) => {
        const state = statusOf(job);
        const tone = ["SUCCESS", "PRINTED", "DONE", "COMPLETED"].includes(state) ? "success" : ["FAILED", "ERROR"].includes(state) ? "failed" : state === "TIMEOUT" ? "timeout" : state === "PRINTING" ? "printing" : "queued";
        return `<article class="admin-printer-job"><span class="admin-printer-job-icon ${isKitchen(job) ? "kitchen" : "admin"}">${printerIcon}</span><div class="admin-printer-job-main"><div class="admin-printer-job-title"><strong>${esc(orderOf(job) === "—" ? "Print Job" : `#${String(orderOf(job)).replace(/^#/, "")}`)}</strong><span class="admin-printer-status ${tone}">${esc(state)}</span></div><span>${esc(kindOf(job))} · ${isKitchen(job) ? "Kitchen Printer" : "Admin Printer"}</span><small>${esc(fmt(job.created_at || job.createdAt || job.queued_at || job.updated_at))}</small></div><button type="button" data-printer-detail="${esc(job.id ?? "")}">Lihat detail</button></article>`;
      }).join("")}</div>`;
    };

    const render = () => {
      if (!root) return;
      const s = summary();
      root.innerHTML = `<section class="admin-printer-hero"><div><small>PUSAT PRINTER</small><h2>Printer Center</h2><p>Pantau antrean, hasil cetak, dan kondisi printer Admin serta Kitchen dari satu tempat.</p></div><div class="admin-printer-hero-badge"><span>${printerIcon}</span><div><strong>80mm Thermal</strong><small>Operasional Warkost</small></div></div></section>
      <section class="admin-printer-kpis"><article><span class="icon">${queueIcon}</span><div><small>Antrean</small><strong>${s.queue}</strong></div></article><article><span class="icon success">${successIcon}</span><div><small>Berhasil</small><strong>${s.success}</strong></div></article><article><span class="icon danger">${alertIcon}</span><div><small>Gagal</small><strong>${s.failed}</strong></div></article><article><span class="icon warn">${queueIcon}</span><div><small>Timeout</small><strong>${s.timeout}</strong></div></article><article><span class="icon admin">${printerIcon}</span><div><small>Printer Admin</small><strong>Dipantau</strong></div></article><article><span class="icon kitchen">${printerIcon}</span><div><small>Printer Kitchen</small><strong>Dipantau</strong></div></article></section>
      <section class="admin-printer-workspace"><nav class="admin-printer-tabs" aria-label="Menu Printer"><button type="button" data-printer-tab="queue" class="${tab === "queue" ? "active" : ""}">Antrean <span>${s.queue}</span></button><button type="button" data-printer-tab="history" class="${tab === "history" ? "active" : ""}">Riwayat</button><button type="button" data-printer-tab="status" class="${tab === "status" ? "active" : ""}">Status Printer</button></nav>${tab === "status" ? "" : `<div class="admin-printer-toolbar"><label class="admin-printer-search"><span>${searchIcon}</span><input type="search" value="${esc(search)}" placeholder="Cari nomor order atau printer..." /></label><div class="admin-printer-targets"><button type="button" data-printer-target="all" class="${target === "all" ? "active" : ""}">Semua</button><button type="button" data-printer-target="admin" class="${target === "admin" ? "active" : ""}">Admin</button><button type="button" data-printer-target="kitchen" class="${target === "kitchen" ? "active" : ""}">Kitchen</button></div></div>`}<div class="admin-printer-content">${contentMarkup()}</div></section>`;
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
          if (tabButton) { tab = tabButton.dataset.printerTab; render(); return; }
          const targetButton = event.target.closest("[data-printer-target]");
          if (targetButton) { target = targetButton.dataset.printerTarget; render(); return; }
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
      modal?.remove();
      modal = document.createElement("div");
      modal.className = "admin-printer-modal-overlay";
      modal.innerHTML = `<section class="admin-printer-modal" role="dialog" aria-modal="true" aria-label="Detail cetakan"><header><div><small>DETAIL CETAKAN</small><h3>${esc(orderOf(job) === "—" ? "Print Job" : `#${String(orderOf(job)).replace(/^#/, "")}`)}</h3><p>${esc(kindOf(job))}</p></div><button type="button" data-printer-close aria-label="Tutup"><span class="admin-printer-close-x" aria-hidden="true"></span></button></header><div class="admin-printer-modal-grid"><article><span>Status</span><strong>${esc(statusOf(job))}</strong></article><article><span>Tujuan</span><strong>${isKitchen(job) ? "Kitchen Printer" : "Admin Printer"}</strong></article><article><span>Dibuat</span><strong>${esc(fmt(job.created_at || job.createdAt || job.queued_at))}</strong></article><article><span>Update</span><strong>${esc(fmt(job.updated_at || job.completed_at || job.completedAt))}</strong></article></div><section class="admin-printer-preview"><small>PREVIEW ROUTING</small><strong>${isKitchen(job) ? "Kitchen Ticket · makanan saja" : "Struk Admin · semua item & transaksi"}</strong><p>${esc(job.error || job.error_message || "Detail cetakan mengikuti data order dari server.")}</p></section></section>`;
      document.body.appendChild(modal);
    };

    const load = async () => {
      if (loading) return;
      loading = true; error = ""; render();
      try {
        const response = await fetch("/api/print-jobs", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat print job");
        jobs = Array.isArray(data.jobs) ? data.jobs : [];
      } catch (err) {
        error = err.message || "Gagal memuat data printer";
      } finally {
        loading = false; loaded = true; render();
      }
    };

    const activate = () => {
      if (!ensureRoot()) return;
      document.body.classList.add("admin-printer-stable-view");
      render();
      if (!loaded) load();
    };

    const deactivate = () => {
      document.body.classList.remove("admin-printer-stable-view");
      modal?.remove(); modal = null;
      root?.remove(); root = null;
      loaded = false;
    };

    const onDocumentClick = (event) => {
      if (event.target.closest("[data-printer-close]")) { modal?.remove(); modal = null; return; }
      if (event.target === modal) { modal?.remove(); modal = null; return; }
    };

    document.addEventListener("click", onDocumentClick, true);
    const onKey = (event) => { if (event.key === "Escape") { modal?.remove(); modal = null; } };
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
