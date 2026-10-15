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
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3z"/><path d="M7 12h.01M17 12h.01"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  stock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7.5 8-4.5 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21"/></svg>`,
  order: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>`,
  system: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/></svg>`,
};

const categoryOf = (message) => {
  const value = String(message || "").toLowerCase();
  if (/setoran|kas|cod|cash|pembayaran|qris|transfer/.test(value)) return "cash";
  if (/stok|stock|inventory|restock|habis/.test(value)) return "stock";
  if (/order|pesanan|driver|dapur|antar|pengantaran/.test(value)) return "order";
  return "system";
};

const titleOf = (message) => {
  const category = categoryOf(message);
  if (category === "cash") return /setoran/i.test(message) ? "Setoran kas" : "Pembayaran";
  if (category === "stock") return "Perhatian stok";
  if (category === "order") return "Update pesanan";
  return "Informasi Owner";
};

const relativeTime = (value) => {
  if (!value) return "Baru saja";
  const source = String(value);
  const normalized = source.includes("T") ? source : source.replace(" ", "T");
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : normalized + "Z");
  if (Number.isNaN(date.getTime())) return source;
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

export default function OwnerNotificationPopover() {
  useEffect(() => {
    let root = null;
    let anchor = null;
    let notifications = [];
    let unread = 0;
    let loading = false;
    let error = "";
    let filter = "all";
    let controller = null;

    const findButton = () =>
      document.querySelector('header.top nav button[data-owner-nav-key="Notifikasi"]');

    const filtered = () =>
      filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;

    const syncBadge = () => {
      const button = findButton();
      const badge = button?.querySelector(".notification-count");
      if (!badge) return;
      if (unread > 0) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    };

    const position = () => {
      if (!root || !anchor || window.innerWidth <= 760) return;
      const rect = anchor.getBoundingClientRect();
      const width = 430;
      root.style.width = `${width}px`;
      root.style.right = `${Math.max(18, window.innerWidth - rect.right)}px`;
      root.style.left = "auto";
      root.style.top = `${rect.bottom + 10}px`;
      root.style.bottom = "auto";
    };

    const render = () => {
      if (!root) return;
      const list = filtered();
      root.innerHTML = `
        <div class="manager-notification-backdrop" data-owner-notif-close></div>
        <section class="manager-notification-panel" role="dialog" aria-modal="true" aria-label="Notifikasi Owner">
          <div class="manager-notification-grabber" aria-hidden="true"></div>
          <header class="manager-notification-head">
            <div class="manager-notification-heading">
              <span class="manager-notification-heading-icon">${ICONS.bell}</span>
              <div>
                <small>PUSAT NOTIFIKASI OWNER</small>
                <div class="manager-notification-title-row">
                  <h2>Notifikasi</h2>
                  ${unread ? `<span>${unread} baru</span>` : ""}
                </div>
                <p>Update penting penjualan, setoran, stok, pesanan, dan sistem.</p>
              </div>
            </div>
            <div class="manager-notification-head-actions">
              ${unread ? `<button type="button" class="manager-notification-mark-all" data-owner-notif-mark-all>${ICONS.check}<span>Tandai semua</span></button>` : ""}
              <button type="button" class="manager-notification-close" data-owner-notif-close aria-label="Tutup">${ICONS.close}</button>
            </div>
          </header>

          <div class="manager-notification-filters" role="tablist" aria-label="Filter notifikasi Owner">
            <button type="button" data-owner-notif-filter="all" class="${filter === "all" ? "active" : ""}">Semua <span>${notifications.length}</span></button>
            <button type="button" data-owner-notif-filter="unread" class="${filter === "unread" ? "active" : ""}">Belum dibaca <span>${unread}</span></button>
          </div>

          <div class="manager-notification-list">
            ${loading ? `
              <div class="manager-notification-state">
                <span class="manager-notification-spinner"></span>
                <strong>Memuat notifikasi...</strong>
                <p>Mengambil update terbaru untuk Owner.</p>
              </div>` : error ? `
              <div class="manager-notification-state error">
                <span class="manager-notification-state-icon">${ICONS.system}</span>
                <strong>Notifikasi belum dapat dimuat</strong>
                <p>${esc(error)}</p>
                <button type="button" data-owner-notif-retry>${ICONS.refresh} Coba lagi</button>
              </div>` : !list.length ? `
              <div class="manager-notification-state">
                <span class="manager-notification-state-icon">${ICONS.bell}</span>
                <strong>${filter === "unread" ? "Semua sudah dibaca" : "Belum ada notifikasi"}</strong>
                <p>${filter === "unread" ? "Tidak ada update baru yang membutuhkan perhatian Owner." : "Update penting Warkost akan tampil di sini."}</p>
              </div>` : list.map((item) => {
                const category = categoryOf(item.message);
                const visualClass = category === "stock" ? "stock" : "system";
                return `
                  <article class="manager-notification-item ${item.read_at ? "read" : "unread"}" data-owner-notif-id="${esc(item.id)}">
                    <span class="manager-notification-item-icon ${visualClass}">${ICONS[category] || ICONS.system}</span>
                    <div class="manager-notification-item-body">
                      <div class="manager-notification-item-meta">
                        <strong>${esc(titleOf(item.message))}</strong>
                        <time>${esc(relativeTime(item.created_at))}</time>
                      </div>
                      <p>${esc(item.message)}</p>
                      <div class="manager-notification-item-actions">
                        ${!item.read_at ? `<button type="button" data-owner-notif-read="${esc(item.id)}">Tandai dibaca</button>` : `<span>Sudah dibaca</span>`}
                      </div>
                    </div>
                    ${!item.read_at ? `<span class="manager-notification-unread-dot" aria-label="Belum dibaca"></span>` : ""}
                  </article>`;
              }).join("")}
          </div>

          <footer class="manager-notification-footer">
            <span>Notifikasi diperbarui setiap panel dibuka.</span>
            <button type="button" data-owner-notif-refresh>${ICONS.refresh} Refresh</button>
          </footer>
        </section>
      `;
    };

    const close = () => {
      controller?.abort();
      controller = null;
      root?.remove();
      root = null;
      anchor?.classList.remove("owner-notification-open");
      anchor = null;
      document.documentElement.classList.remove("manager-notification-sheet-open");
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
      } catch (caught) {
        if (caught.name === "AbortError") return;
        error = caught.message || "Gagal memuat notifikasi";
      } finally {
        loading = false;
        render();
        syncBadge();
      }
    };

    const markRead = async (id) => {
      const item = notifications.find((entry) => String(entry.id) === String(id));
      if (!item || item.read_at) return;
      try {
        const response = await fetch("/api/notification-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal menandai notifikasi");
        item.read_at = new Date().toISOString();
        unread = Math.max(0, unread - 1);
        render();
        syncBadge();
      } catch (caught) {
        error = caught.message || "Gagal menandai notifikasi";
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
      } catch (caught) {
        error = caught.message || "Gagal menandai semua notifikasi";
        unread = notifications.filter((item) => !item.read_at).length;
      } finally {
        loading = false;
        render();
        syncBadge();
      }
    };

    const open = (button) => {
      close();
      anchor = button;
      anchor.classList.add("owner-notification-open");
      root = document.createElement("div");
      root.className = "manager-notification-popover owner-notification-popover";
      document.body.appendChild(root);
      document.documentElement.classList.add("manager-notification-sheet-open");
      position();
      render();
      load();
    };

    // Capture at window level so the Owner click is stopped before React's
    // delegated notification handler can change the page view to the legacy
    // inline notifications screen. This makes the Owner interaction popup-only.
    const onCapture = (event) => {
      const button = event.target.closest?.('header.top nav button[data-owner-nav-key="Notifikasi"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (root && anchor === button) close();
      else open(button);
    };

    const onClick = (event) => {
      if (!root) return;
      const closeButton = event.target.closest?.("[data-owner-notif-close]");
      if (closeButton && root.contains(closeButton)) return close();

      const filterButton = event.target.closest?.("[data-owner-notif-filter]");
      if (filterButton && root.contains(filterButton)) {
        filter = filterButton.dataset.ownerNotifFilter;
        render();
        return;
      }

      const readButton = event.target.closest?.("[data-owner-notif-read]");
      if (readButton && root.contains(readButton)) return markRead(readButton.dataset.ownerNotifRead);

      const markAllButton = event.target.closest?.("[data-owner-notif-mark-all]");
      if (markAllButton && root.contains(markAllButton)) return markAll();

      const retryButton = event.target.closest?.("[data-owner-notif-retry]");
      if (retryButton && root.contains(retryButton)) return load();

      const refreshButton = event.target.closest?.("[data-owner-notif-refresh]");
      if (refreshButton && root.contains(refreshButton)) return load();

      if (!root.contains(event.target) && !anchor?.contains(event.target)) close();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    const onViewport = () => position();

    window.addEventListener("click", onCapture, true);
    document.addEventListener("click", onClick, false);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);

    return () => {
      close();
      window.removeEventListener("click", onCapture, true);
      document.removeEventListener("click", onClick, false);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, []);

  return null;
}
