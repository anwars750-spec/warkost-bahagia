"use client";

import { useEffect } from "react";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const ICONS = {
  order: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>`,
  payment: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 15h3"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-9 8 9 9 0 0 1-4-1l-5 2 2-5a8 8 0 1 1 16-4Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>`,
  system: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
};

const categoryOf = (message) => {
  const value = String(message || "").toLowerCase();
  if (/printer|cetak|print|thermal|timeout/.test(value)) return "printer";
  if (/cod|bayar|payment|paid|gagal bayar|expired|qris|setoran/.test(value)) return "payment";
  if (/chat|customer service|pesan customer|pelanggan bertanya|support/.test(value)) return "chat";
  if (/order|pesanan|driver|dapur|antar|pengantaran|pickup/.test(value)) return "order";
  return "system";
};

const titleOf = (message) => {
  const category = categoryOf(message);
  if (category === "printer") return "Status printer";
  if (category === "payment") return /cod|setoran/i.test(message) ? "Setoran COD" : "Pembayaran";
  if (category === "chat") return "Customer Service";
  if (category === "order") return "Update pesanan";
  return "Notifikasi sistem";
};

const relativeTime = (value) => {
  if (!value) return "Baru saja";
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : normalized + "Z");
  if (Number.isNaN(date.getTime())) return String(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = Math.floor(diff / 60000);
  if (minute < 1) return "Baru saja";
  if (minute < 60) return `${minute} menit lalu`;
  const hour = Math.floor(minute / 60);
  if (hour < 24) return `${hour} jam lalu`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

export default function AdminNotificationPopover() {
  useEffect(() => {
    let panel = null;
    let anchor = null;
    let notifications = [];
    let unread = 0;
    let loading = false;
    let error = "";
    let filter = "all";
    let controller = null;

    const isAdminUi = () =>
      [...document.querySelectorAll("header.top nav button")].some(
        (button) => button.textContent.replace(/\d+/g, "").trim() === "Operasional",
      );

    const findButton = () =>
      [...document.querySelectorAll("header.top nav button")].find(
        (button) => button.textContent.replace(/\d+/g, "").trim() === "Notifikasi",
      );

    const filtered = () =>
      filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;

    const positionPanel = () => {
      if (!panel || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const mobile = window.innerWidth <= 760;
      if (mobile) {
        panel.style.left = "12px";
        panel.style.right = "12px";
        panel.style.width = "auto";
        panel.style.top = `${Math.min(rect.bottom + 10, 92)}px`;
      } else {
        const width = 392;
        const right = Math.max(18, window.innerWidth - rect.right);
        panel.style.left = "auto";
        panel.style.right = `${right}px`;
        panel.style.width = `${width}px`;
        panel.style.top = `${rect.bottom + 10}px`;
      }
    };

    const updateAnchorBadge = () => {
      const button = findButton();
      if (!button) return;
      let badge = button.querySelector(".admin-notification-badge-v2");
      if (!unread) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "admin-notification-badge-v2";
        button.appendChild(badge);
      }
      badge.textContent = unread > 99 ? "99+" : String(unread);
    };

    const render = () => {
      if (!panel) return;
      const list = filtered();
      panel.innerHTML = `
        <section class="admin-notification-popover-card" role="dialog" aria-label="Notifikasi Admin">
          <header class="admin-notification-head">
            <div>
              <small>PUSAT NOTIFIKASI</small>
              <div class="admin-notification-title-row">
                <h2>Notifikasi</h2>
                ${unread ? `<span>${unread} baru</span>` : ""}
              </div>
            </div>
            ${unread ? `<button type="button" class="admin-notification-mark-all" data-notif-mark-all>${ICONS.check}<span>Tandai semua</span></button>` : ""}
          </header>

          <div class="admin-notification-filters" role="tablist" aria-label="Filter notifikasi">
            <button type="button" data-notif-filter="all" class="${filter === "all" ? "active" : ""}">Semua <span>${notifications.length}</span></button>
            <button type="button" data-notif-filter="unread" class="${filter === "unread" ? "active" : ""}">Belum dibaca <span>${unread}</span></button>
          </div>

          <div class="admin-notification-list">
            ${loading ? `
              <div class="admin-notification-state">
                <span class="admin-notification-spinner"></span>
                <strong>Memuat notifikasi...</strong>
              </div>` : error ? `
              <div class="admin-notification-state error">
                <span class="admin-notification-state-icon">${ICONS.system}</span>
                <strong>Notifikasi belum dapat dimuat</strong>
                <p>${esc(error)}</p>
                <button type="button" data-notif-retry>Coba lagi</button>
              </div>` : !list.length ? `
              <div class="admin-notification-state">
                <span class="admin-notification-state-icon">${ICONS.system}</span>
                <strong>${filter === "unread" ? "Semua sudah dibaca" : "Belum ada notifikasi"}</strong>
                <p>${filter === "unread" ? "Tidak ada notifikasi baru yang perlu ditangani." : "Update operasional akan muncul di sini."}</p>
              </div>` : list.map((item) => {
                const category = categoryOf(item.message);
                return `
                  <article class="admin-notification-item ${item.read_at ? "read" : "unread"}" data-notif-id="${esc(item.id)}">
                    <span class="admin-notification-item-icon ${category}">${ICONS[category] || ICONS.system}</span>
                    <div class="admin-notification-item-body">
                      <div class="admin-notification-item-top">
                        <strong>${esc(titleOf(item.message))}</strong>
                        <time>${esc(relativeTime(item.created_at))}</time>
                      </div>
                      <p>${esc(item.message)}</p>
                      ${!item.read_at ? `<button type="button" data-notif-read="${esc(item.id)}">Tandai dibaca</button>` : ""}
                    </div>
                    ${!item.read_at ? `<span class="admin-notification-unread-dot" aria-label="Belum dibaca"></span>` : ""}
                  </article>`;
              }).join("")}
          </div>
        </section>
      `;
    };

    const close = () => {
      controller?.abort();
      controller = null;
      panel?.remove();
      panel = null;
      anchor?.classList.remove("admin-notification-open");
      anchor = null;
    };

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      loading = true;
      error = "";
      render();
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat notifikasi");
        notifications = Array.isArray(data.notifications) ? data.notifications : [];
        unread = Number.isFinite(Number(data.unread))
          ? Number(data.unread)
          : notifications.filter((item) => !item.read_at).length;
      } catch (err) {
        if (err.name === "AbortError") return;
        error = err.message || "Gagal memuat notifikasi";
      } finally {
        loading = false;
        render();
        updateAnchorBadge();
      }
    };

    const markRead = async (id) => {
      const target = notifications.find((item) => String(item.id) === String(id));
      if (!target || target.read_at) return;
      try {
        const response = await fetch("/api/notification-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: target.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal menandai notifikasi");
        target.read_at = new Date().toISOString();
        unread = Math.max(0, unread - 1);
        render();
        updateAnchorBadge();
      } catch (err) {
        error = err.message || "Gagal menandai notifikasi";
        render();
      }
    };

    const markAll = async () => {
      const pending = notifications.filter((item) => !item.read_at);
      if (!pending.length) return;
      loading = true;
      render();
      try {
        for (const item of pending) {
          const response = await fetch("/api/notification-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
          });
          if (!response.ok) throw new Error("Sebagian notifikasi belum berhasil ditandai");
          item.read_at = new Date().toISOString();
        }
        unread = 0;
      } catch (err) {
        error = err.message || "Gagal menandai semua notifikasi";
        unread = notifications.filter((item) => !item.read_at).length;
      } finally {
        loading = false;
        render();
        updateAnchorBadge();
      }
    };

    const open = (button) => {
      close();
      anchor = button;
      anchor.classList.add("admin-notification-open");
      panel = document.createElement("div");
      panel.className = "admin-notification-popover";
      document.body.appendChild(panel);
      positionPanel();
      render();
      load();
    };

    const onDocumentClickCapture = (event) => {
      if (!isAdminUi()) return;
      const button = event.target.closest?.("header.top nav button");
      if (button && button.textContent.replace(/\d+/g, "").trim() === "Notifikasi") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (panel && anchor === button) close();
        else open(button);
      }
    };

    const onDocumentClick = (event) => {
      if (!panel) return;
      const filterButton = event.target.closest?.("[data-notif-filter]");
      if (filterButton && panel.contains(filterButton)) {
        filter = filterButton.dataset.notifFilter;
        render();
        return;
      }
      const readButton = event.target.closest?.("[data-notif-read]");
      if (readButton && panel.contains(readButton)) {
        markRead(readButton.dataset.notifRead);
        return;
      }
      const markAllButton = event.target.closest?.("[data-notif-mark-all]");
      if (markAllButton && panel.contains(markAllButton)) {
        markAll();
        return;
      }
      const retry = event.target.closest?.("[data-notif-retry]");
      if (retry && panel.contains(retry)) {
        load();
        return;
      }
      if (!panel.contains(event.target) && !anchor?.contains(event.target)) close();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    const onViewportChange = () => positionPanel();

    document.addEventListener("click", onDocumentClickCapture, true);
    document.addEventListener("click", onDocumentClick, false);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      close();
      document.removeEventListener("click", onDocumentClickCapture, true);
      document.removeEventListener("click", onDocumentClick, false);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, []);

  return null;
}
