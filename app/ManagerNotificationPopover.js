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
  stock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7.5 8-4.5 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21"/></svg>`,
  product: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4z"/><path d="M8 9h8M8 13h5"/></svg>`,
  promo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 12 3h6l3 3v6l-9 9L3 12Z"/><path d="M16.5 7.5h.01"/></svg>`,
  system: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
};

const FILTERS = [
  ["all", "Semua"],
  ["unread", "Belum dibaca"],
  ["stock", "Stok"],
  ["product", "Produk"],
  ["promo", "Promo"],
  ["system", "Sistem"],
];

const categoryOf = (message) => {
  const value = String(message || "").toLowerCase();
  if (/stok|stock|inventory|reserved|available|restock|bahan baku|opname/.test(value)) return "stock";
  if (/produk|product|subkategori|kategori|menu|dinonaktifkan|diaktifkan/.test(value)) return "product";
  if (/promo|voucher|diskon|campaign|kampanye/.test(value)) return "promo";
  return "system";
};

const titleOf = (message) => {
  const category = categoryOf(message);
  if (category === "stock") return /rendah|habis|minimum/i.test(message) ? "Perhatian stok" : "Update stok";
  if (category === "product") return /subkategori/i.test(message) ? "Update subkategori" : "Update produk";
  if (category === "promo") return "Update promo";
  return "Informasi sistem";
};

const moduleOf = (message) => {
  const value = String(message || "").toLowerCase();
  if (/stok|stock|inventory|reserved|available|restock|opname/.test(value)) return "Stok";
  if (/subkategori/.test(value)) return "Subkategori";
  if (/promo|voucher|diskon|campaign|kampanye/.test(value)) return "Promo";
  if (/produk|product|kategori|menu/.test(value)) return "Produk & Menu";
  return null;
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

export default function ManagerNotificationPopover() {
  useEffect(() => {
    let root = null;
    let anchor = null;
    let notifications = [];
    let unread = 0;
    let loading = false;
    let error = "";
    let filter = "all";
    let controller = null;

    const managerActive = () => Boolean(document.querySelector(".manager-control-center"));

    const topNotificationButton = () => {
      if (!managerActive()) return null;
      return [...document.querySelectorAll('header.top nav button[aria-label="Buka notifikasi"]')].find(
        (button) => !button.dataset.adminNav,
      ) || null;
    };

    const countFor = (key) => {
      if (key === "all") return notifications.length;
      if (key === "unread") return unread;
      return notifications.filter((item) => categoryOf(item.message) === key).length;
    };

    const filtered = () => {
      if (filter === "unread") return notifications.filter((item) => !item.read_at);
      if (filter === "all") return notifications;
      return notifications.filter((item) => categoryOf(item.message) === filter);
    };

    const syncBadge = () => {
      const button = topNotificationButton();
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
      const right = Math.max(18, window.innerWidth - rect.right);
      root.style.width = `${width}px`;
      root.style.right = `${right}px`;
      root.style.left = "auto";
      root.style.top = `${rect.bottom + 10}px`;
      root.style.bottom = "auto";
    };

    const render = () => {
      if (!root) return;
      const list = filtered();
      root.innerHTML = `
        <div class="manager-notification-backdrop" data-manager-notif-close></div>
        <section class="manager-notification-panel" role="dialog" aria-modal="true" aria-label="Notifikasi Manager">
          <div class="manager-notification-grabber" aria-hidden="true"></div>
          <header class="manager-notification-head">
            <div class="manager-notification-heading">
              <span class="manager-notification-heading-icon">${ICONS.bell}</span>
              <div>
                <small>PUSAT NOTIFIKASI</small>
                <div class="manager-notification-title-row">
                  <h2>Notifikasi</h2>
                  ${unread ? `<span>${unread} baru</span>` : ""}
                </div>
                <p>Update stok, produk, promo, dan sistem Manager.</p>
              </div>
            </div>
            <div class="manager-notification-head-actions">
              ${unread ? `<button type="button" class="manager-notification-mark-all" data-manager-notif-mark-all>${ICONS.check}<span>Tandai semua</span></button>` : ""}
              <button type="button" class="manager-notification-close" data-manager-notif-close aria-label="Tutup">${ICONS.close}</button>
            </div>
          </header>

          <div class="manager-notification-filters" role="tablist" aria-label="Filter notifikasi Manager">
            ${FILTERS.map(([key, label]) => `<button type="button" data-manager-notif-filter="${key}" class="${filter === key ? "active" : ""}">${label}<span>${countFor(key)}</span></button>`).join("")}
          </div>

          <div class="manager-notification-list">
            ${loading ? `
              <div class="manager-notification-state">
                <span class="manager-notification-spinner"></span>
                <strong>Memuat notifikasi...</strong>
                <p>Sedang mengambil update terbaru untuk Manager.</p>
              </div>` : error ? `
              <div class="manager-notification-state error">
                <span class="manager-notification-state-icon">${ICONS.system}</span>
                <strong>Notifikasi belum dapat dimuat</strong>
                <p>${esc(error)}</p>
                <button type="button" data-manager-notif-retry>${ICONS.refresh} Coba lagi</button>
              </div>` : !list.length ? `
              <div class="manager-notification-state">
                <span class="manager-notification-state-icon">${filter === "stock" ? ICONS.stock : filter === "product" ? ICONS.product : filter === "promo" ? ICONS.promo : ICONS.bell}</span>
                <strong>${filter === "unread" ? "Semua sudah dibaca" : "Belum ada notifikasi"}</strong>
                <p>${filter === "unread" ? "Tidak ada update baru yang membutuhkan perhatian." : "Update operasional Manager akan tampil di sini saat tersedia."}</p>
              </div>` : list.map((item) => {
                const category = categoryOf(item.message);
                const module = moduleOf(item.message);
                return `
                  <article class="manager-notification-item ${item.read_at ? "read" : "unread"}" data-manager-notif-id="${esc(item.id)}">
                    <span class="manager-notification-item-icon ${category}">${ICONS[category] || ICONS.system}</span>
                    <div class="manager-notification-item-body">
                      <div class="manager-notification-item-meta">
                        <strong>${esc(titleOf(item.message))}</strong>
                        <time>${esc(relativeTime(item.created_at))}</time>
                      </div>
                      <p>${esc(item.message)}</p>
                      <div class="manager-notification-item-actions">
                        ${!item.read_at ? `<button type="button" data-manager-notif-read="${esc(item.id)}">Tandai dibaca</button>` : `<span>Sudah dibaca</span>`}
                        ${module ? `<button type="button" class="module-link" data-manager-notif-module="${esc(module)}">Buka ${esc(module)} ${ICONS.arrow}</button>` : ""}
                      </div>
                    </div>
                    ${!item.read_at ? `<span class="manager-notification-unread-dot" aria-label="Belum dibaca"></span>` : ""}
                  </article>`;
              }).join("")}
          </div>

          <footer class="manager-notification-footer">
            <span>Notifikasi diperbarui setiap panel dibuka.</span>
            <button type="button" data-manager-notif-refresh>${ICONS.refresh} Refresh</button>
          </footer>
        </section>
      `;
    };

    const close = () => {
      controller?.abort();
      controller = null;
      root?.remove();
      root = null;
      anchor?.classList.remove("manager-notification-open");
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

    const navigateTo = (label) => {
      close();
      const top = [...document.querySelectorAll("header.top nav button")].find(
        (button) => button.textContent?.replace(/\s+/g, " ").trim().includes(label),
      );
      if (top) {
        top.click();
        return;
      }
      if (label === "Produk & Menu") {
        document.querySelector(".manager-mobile-nav button:nth-child(2)")?.click();
      } else if (label === "Stok") {
        document.querySelector(".manager-mobile-nav button:nth-child(3)")?.click();
      } else if (label === "Promo") {
        document.querySelector(".manager-mobile-nav button:nth-child(4)")?.click();
      } else if (label === "Subkategori") {
        document.querySelector(".manager-mobile-nav button:last-child")?.click();
        setTimeout(() => {
          [...document.querySelectorAll(".manager-more-menu button")]
            .find((button) => button.textContent?.trim() === "Subkategori")
            ?.click();
        }, 0);
      }
    };

    const open = (button) => {
      close();
      anchor = button;
      anchor.classList.add("manager-notification-open");
      root = document.createElement("div");
      root.className = "manager-notification-popover";
      document.body.appendChild(root);
      if (window.innerWidth <= 760) document.documentElement.classList.add("manager-notification-sheet-open");
      position();
      render();
      load();
      if (button.closest(".manager-more-menu")) {
        setTimeout(() => document.querySelector(".manager-mobile-nav button:last-child")?.click(), 0);
      }
    };

    const notificationTrigger = (target) => {
      const top = target.closest?.('header.top nav button[aria-label="Buka notifikasi"]');
      if (top && !top.dataset.adminNav) return top;
      const more = target.closest?.(".manager-more-menu button");
      if (more && more.textContent?.trim() === "Notifikasi") return more;
      return null;
    };

    const onCaptureClick = (event) => {
      if (!managerActive()) return;
      const trigger = notificationTrigger(event.target);
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (root && anchor === trigger) close();
      else open(trigger);
    };

    const onClick = (event) => {
      if (!root) return;
      const closeButton = event.target.closest?.("[data-manager-notif-close]");
      if (closeButton && root.contains(closeButton)) {
        close();
        return;
      }
      const filterButton = event.target.closest?.("[data-manager-notif-filter]");
      if (filterButton && root.contains(filterButton)) {
        filter = filterButton.dataset.managerNotifFilter;
        render();
        return;
      }
      const readButton = event.target.closest?.("[data-manager-notif-read]");
      if (readButton && root.contains(readButton)) {
        markRead(readButton.dataset.managerNotifRead);
        return;
      }
      const markAllButton = event.target.closest?.("[data-manager-notif-mark-all]");
      if (markAllButton && root.contains(markAllButton)) {
        markAll();
        return;
      }
      const retryButton = event.target.closest?.("[data-manager-notif-retry], [data-manager-notif-refresh]");
      if (retryButton && root.contains(retryButton)) {
        load();
        return;
      }
      const moduleButton = event.target.closest?.("[data-manager-notif-module]");
      if (moduleButton && root.contains(moduleButton)) {
        navigateTo(moduleButton.dataset.managerNotifModule);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    const onViewport = () => position();

    document.addEventListener("click", onCaptureClick, true);
    document.addEventListener("click", onClick, false);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);

    return () => {
      close();
      document.removeEventListener("click", onCaptureClick, true);
      document.removeEventListener("click", onClick, false);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, []);

  return null;
}
